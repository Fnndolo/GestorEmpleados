import 'server-only'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { cargarParametros } from './parametros'
import { liquidar } from './motor'
import { diasFueraDelVinculo, diasSuperpuestos, pagoIncapacidad } from './ausencias'
import { horasMesJornada } from './horas'
import { CONTRATOS_DE_NOMINA } from '@/lib/vinculo-contrato'
import { regenerarNovedadesAsistencia } from '@/server/asistencia/horas-asistencia'

/**
 * Liquida (o recalcula) un periodo de nómina completo: para cada colaborador
 * con contrato laboral activo, calcula su liquidación y persiste el detalle.
 * Idempotente: borra y recrea las liquidaciones del periodo (advisory lock).
 */
/**
 * Deshace TODO lo que este periodo dejó aplicado fuera de sus liquidaciones: abonos de
 * préstamo (el saldo vuelve a subir), bonificaciones marcadas como pagadas y marcas de
 * pago anticipado de vacaciones. Se usa al recalcular, al reabrir y al eliminar el
 * periodo, para que ninguna de esas operaciones deje rastros de dinero ya aplicado.
 */
export async function revertirEfectosPeriodo(periodoId: string): Promise<void> {
  await prisma.liquidacionNomina.deleteMany({ where: { periodoId } })

  // Abonos de préstamo: devolver el saldo y borrar las cuotas del periodo.
  const cuotasPrevias = await prisma.cuotaPrestamo.findMany({ where: { periodoId } })
  for (const c of cuotasPrevias) {
    await prisma.prestamo.update({
      where: { id: c.prestamoId },
      data: { saldo: { increment: c.valor }, estado: 'ACTIVO' },
    })
  }
  await prisma.cuotaPrestamo.deleteMany({ where: { periodoId } })

  // Bonificaciones pagadas por ESTE periodo → vuelven a quedar pendientes y sin periodo.
  await prisma.bonificacion.updateMany({
    where: { periodoId },
    data: { estadoPago: 'PENDIENTE', periodoId: null, fechaPago: null },
  })

  // Marcas de pago anticipado de vacaciones hechas por ESTE periodo.
  await prisma.vacaciones.updateMany({
    where: { pagoAnticipadoPeriodoId: periodoId },
    data: { pagoAnticipadoPeriodoId: null },
  })

  // Novedades que este periodo había recogido: se SUELTAN, no se borran. La
  // comisión existió aunque el periodo se rehaga o se elimine; queda pendiente
  // y la recoge el siguiente. Borrarlas perdería trabajo que alguien registró.
  const soltar = { where: { periodoId }, data: { periodoId: null } }
  await prisma.novedadHoras.updateMany(soltar)
  await prisma.comision.updateMany(soltar)
  await prisma.novedadConcepto.updateMany(soltar)
}

export async function liquidarPeriodo(periodoId: string): Promise<{ liquidados: number; horasSinRefrescar: number }> {
  const periodo = await prisma.periodoNomina.findUniqueOrThrow({ where: { id: periodoId } })
  if (periodo.estado === 'CERRADA' || periodo.estado === 'PAGADA') {
    throw new Error('El periodo está cerrado. Crea un periodo de ajuste para corregir.')
  }

  // Interruptores configurables desde Configuración → Parámetros de nómina.
  const config = await prisma.configuracionEmpresa.findFirst()
  const empresaExonerada = config?.empresaExonerada ?? true // Ley 114-1
  const aplicaRetefuente = config?.aplicaRetefuente ?? false
  const parametros = await cargarParametros(periodo.fechaFin)

  // Colaboradores con vínculo laboral vigente al cierre de este periodo.
  //
  // El corte es la FECHA DE RETIRO contra el cierre, no el estado del contrato.
  // Filtrar por contrato ACTIVO parecía equivalente, pero no lo es: al registrar
  // una terminación el contrato queda TERMINADO para siempre, así que rehacer un
  // periodo ANTERIOR al retiro borraba de la nómina a alguien que sí lo trabajó.
  //
  // Del periodo en que cae el retiro sí queda por fuera: esos días se le pagan en
  // su liquidación definitiva junto con las prestaciones, como en la colilla que
  // emite el software contable. Incluirlo en ambos le pagaría el mes dos veces.
  const contratosCrudos = await prisma.contrato.findMany({
    where: {
      estado: { in: ['ACTIVO', 'TERMINADO'] },
      tipo: { in: [...CONTRATOS_DE_NOMINA] },
      fechaInicio: { lte: periodo.fechaFin },
      colaborador: { OR: [{ fechaRetiro: null }, { fechaRetiro: { gt: periodo.fechaFin } }] },
    },
    include: { colaborador: true },
    orderBy: { fechaInicio: 'desc' },
  })

  // Una liquidación por persona (la tabla lo exige). Si alguien tiene dos
  // contratos vigentes por un traslape de renovación, manda el más reciente:
  // es el que fija el salario con que se le paga.
  const contratos = [...new Map(contratosCrudos.map((c) => [c.colaboradorId, c])).values()]

  // Lock por periodo para evitar liquidaciones concurrentes
  await prisma.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${periodoId}))`

  // Horas de asistencia SIEMPRE frescas: se regeneran desde las marcaciones
  // (esquema `asistencia`, misma base) en cada liquidación/recalculo. Editar
  // una marcación en ArriveControl y recalcular aquí siempre cuadra — no hay
  // envíos ni copias que se desactualicen.
  const asistencia = await regenerarNovedadesAsistencia(periodo)

  await revertirEfectosPeriodo(periodoId)

  /**
   * Novedades que le tocan a este periodo: las causadas hasta su cierre que
   * nadie ha pagado todavía, más las que este mismo periodo ya recogió (para
   * que recalcular sea idempotente y no las duplique ni las suelte).
   *
   * Se filtra por FECHA y no por periodo, que es lo que permite registrarlas
   * cuando ocurren sin esperar a que alguien abra la nómina. Una novedad
   * atrasada —de un mes que nunca se liquidó, o digitada tarde— entra en el
   * siguiente periodo en vez de perderse.
   */
  const porRecoger = {
    OR: [
      { periodoId: null, fecha: { lte: periodo.fechaFin } },
      { periodoId },
    ],
  }

  let liquidados = 0
  for (const contrato of contratos) {
    const colaboradorId = contrato.colaboradorId
    const diasPeriodo = periodo.diasPeriodo

    // Salario efectivo: si gana salario mínimo se usa el SMMLV vigente (se actualiza con el parámetro)
    const salarioEfectivo = contrato.ganaSalarioMinimo ? Number(parametros.SMMLV) : Number(contrato.salarioBase)

    // ── Ausencias del periodo ──
    // Descuentan salario: incapacidades (se pagan aparte al 66,67%), licencias NO
    // remuneradas, suspensiones y permisos no remunerados de día completo.
    // Las licencias remuneradas y las vacaciones NO descuentan (salario normal).
    const rango = { fechaInicio: { lte: periodo.fechaFin }, fechaFin: { gte: periodo.fechaInicio } }
    const [incapacidades, licenciasNoRem, permisosNoRem, suspensiones] = await Promise.all([
      prisma.incapacidad.findMany({ where: { colaboradorId, ...rango } }),
      prisma.licencia.findMany({ where: { colaboradorId, remunerada: false, ...rango } }),
      prisma.permiso.count({ where: { colaboradorId, remunerado: false, diaCompleto: true, fecha: { gte: periodo.fechaInicio, lte: periodo.fechaFin } } }),
      prisma.suspensionContrato.findMany({ where: { contrato: { colaboradorId }, fechaInicio: { lte: periodo.fechaFin }, OR: [{ fechaFin: null }, { fechaFin: { gte: periodo.fechaInicio } }] } }),
    ])
    const diasIncapacidad = incapacidades.reduce((t, i) => t + diasSuperpuestos(i.fechaInicio, i.fechaFin, periodo.fechaInicio, periodo.fechaFin), 0)
    const diasNoRemunerados =
      licenciasNoRem.reduce((t, l) => t + diasSuperpuestos(l.fechaInicio, l.fechaFin, periodo.fechaInicio, periodo.fechaFin), 0) +
      suspensiones.reduce((t, s) => t + diasSuperpuestos(s.fechaInicio, s.fechaFin, periodo.fechaInicio, periodo.fechaFin), 0) +
      permisosNoRem
    // Días de vacaciones de este periodo que YA se pagaron por adelantado en un
    // periodo anterior: se restan del salario para no pagarlos doble.
    const vacacionesYaPagadas = await prisma.vacaciones.findMany({
      where: {
        colaboradorId,
        estado: { in: ['APROBADA', 'EN_DISFRUTE', 'DISFRUTADA'] },
        pagoAnticipadoPeriodoId: { not: null },
        NOT: { pagoAnticipadoPeriodoId: periodoId },
        ...rango,
      },
    })
    const diasVacacionesAnticipadas = vacacionesYaPagadas.reduce(
      (t, v) => t + diasSuperpuestos(v.fechaInicio, v.fechaFin, periodo.fechaInicio, periodo.fechaFin), 0,
    )

    // Días sin vínculo: los previos al ingreso y los posteriores al retiro. Se
    // cuentan como ausencia para que el salario y el auxilio salgan proporcionales
    // (el motor ya prorratea por diasTrabajados).
    const diasSinVinculo = diasFueraDelVinculo(contrato.fechaInicio, contrato.colaborador.fechaRetiro, periodo)

    // Ni un día de vínculo en todo el periodo: no le corresponde nada y no debe
    // salir en la nómina. Pasa con un contrato que empieza después del cierre, o
    // en el hueco entre dos vínculos de alguien que fue recontratado.
    if (diasSinVinculo >= diasPeriodo) continue

    const diasAusencia = Math.min(
      diasPeriodo,
      diasSinVinculo + diasIncapacidad + diasNoRemunerados + diasVacacionesAnticipadas,
    )
    const diasTrabajados = Math.max(0, diasPeriodo - diasAusencia)
    // Cada incapacidad se paga por su cuenta: el porcentaje depende del origen
    // (una laboral va al 100%) y de en qué día del episodio va (la enfermedad
    // general baja al 50% desde el día 91). Sumarlas y aplicar un solo
    // porcentaje, como se hacía antes, le pagaba de menos a quien se accidentó
    // trabajando y de más a quien lleva meses enfermo.
    const valorIncapacidad = incapacidades.reduce((total, i) => {
      const diasEnPeriodo = diasSuperpuestos(i.fechaInicio, i.fechaFin, periodo.fechaInicio, periodo.fechaFin)
      if (diasEnPeriodo === 0) return total
      // Días del episodio ya transcurridos antes de este periodo: es lo que
      // decide si ya se pasó del día 90.
      const previos = diasSuperpuestos(
        i.fechaInicio,
        i.fechaFin,
        i.fechaInicio,
        new Date(periodo.fechaInicio.getTime() - 86_400_000),
      )
      return total + pagoIncapacidad(
        Math.min(diasEnPeriodo, diasPeriodo),
        salarioEfectivo,
        Number(parametros.SMMLV),
        i.tipo,
        previos + 1,
      )
    }, 0)

    // ── Pago anticipado de vacaciones (Flujo 2A: "nómina procesa el pago antes de
    // la fecha de salida"). Vacaciones aprobadas que inician DESPUÉS de este periodo
    // (dentro de los 31 días siguientes) se pagan completas aquí, a salario ordinario
    // (RIT art. 42: base/30 × días calendario del descanso), y se marcan para que el
    // periodo que las cubra descuente esos días.
    const ventanaAnticipo = new Date(periodo.fechaFin)
    ventanaAnticipo.setUTCDate(ventanaAnticipo.getUTCDate() + 31)
    const vacacionesPorAnticipar = await prisma.vacaciones.findMany({
      where: {
        colaboradorId,
        estado: 'APROBADA',
        pagoAnticipadoPeriodoId: null,
        fechaInicio: { gt: periodo.fechaFin, lte: ventanaAnticipo },
      },
    })
    let valorVacacionesAnticipadas = 0
    for (const v of vacacionesPorAnticipar) {
      const diasCal = diasSuperpuestos(v.fechaInicio, v.fechaFin, v.fechaInicio, v.fechaFin)
      valorVacacionesAnticipadas += Math.round((salarioEfectivo / 30) * diasCal)
      await prisma.vacaciones.update({ where: { id: v.id }, data: { pagoAnticipadoPeriodoId: periodoId } })
    }

    // Horas extra del periodo. El divisor de la hora ordinaria sigue la jornada
    // máxima vigente (Ley 2101, RIT art. 18): 220 (44h) hasta 14-jul-2026, 210 (42h) después.
    const horas = await prisma.novedadHoras.findMany({ where: { colaboradorId, ...porRecoger } })
    const tiposHora = await import('./parametros').then((m) => m.cargarTiposHora(periodo.fechaFin))
    const valorHora = salarioEfectivo / horasMesJornada(periodo.fechaFin)
    let valorHorasExtra = 0
    for (const h of horas) {
      const factor = tiposHora[h.tipoHora] ?? 0
      valorHorasExtra += valorHora * factor * Number(h.horas)
    }

    // Comisiones que le corresponden a este periodo
    const comisiones = await prisma.comision.findMany({ where: { colaboradorId, ...porRecoger } })
    const totalComisiones = comisiones.reduce((t, c) => t + Number(c.valor), 0)

    // Bonificaciones a pagar en este periodo: las pendientes sin periodo asignado,
    // más las que YA se asignaron a este periodo (para que el recálculo sea idempotente
    // y no las duplique ni las pierda). Se marcan como pagadas más abajo.
    const bonos = await prisma.bonificacion.findMany({
      where: { colaboradorId, OR: [{ estadoPago: 'PENDIENTE', periodoId: null }, { periodoId }] },
    })
    const sumaBonos = (constitutivo: boolean) =>
      bonos.filter((b) => b.constitutivoSalario === constitutivo).reduce((t, b) => t + Number(b.valor), 0)
    const bonificacionConstitutiva = sumaBonos(true)
    const bonificacionNoConstitutiva = sumaBonos(false)

    // Cuotas de TODOS los préstamos activos (no solo uno); cada cuota se limita al saldo.
    // Se registra el abono (CuotaPrestamo), se descuenta del saldo y el préstamo pasa
    // a PAGADO cuando queda en cero. El recálculo revierte estos abonos arriba.
    const prestamos = await prisma.prestamo.findMany({
      where: { colaboradorId, estado: 'ACTIVO' },
      include: { _count: { select: { cuotas: true } } },
    })
    let cuotaPrestamo = 0
    for (const p of prestamos) {
      const abono = Math.min(Number(p.valorCuota), Number(p.saldo))
      if (abono <= 0) continue
      cuotaPrestamo += abono
      const nuevoSaldo = Math.round((Number(p.saldo) - abono) * 100) / 100
      await prisma.cuotaPrestamo.create({
        data: { prestamoId: p.id, numero: p._count.cuotas + 1, valor: abono, pagada: true, periodoId, fechaPago: periodo.fechaFin },
      })
      await prisma.prestamo.update({
        where: { id: p.id },
        data: { saldo: nuevoSaldo, estado: nuevoSaldo <= 0 ? 'PAGADO' : 'ACTIVO' },
      })
    }

    // Conceptos configurables aplicados a este colaborador en el periodo:
    // el motor los liquida según las banderas del catálogo (art. 127/128 CST).
    const novedadesConcepto = await prisma.novedadConcepto.findMany({
      where: { colaboradorId, ...porRecoger },
      include: { concepto: true },
    })
    const otrosConceptos = novedadesConcepto
      .filter((n) => n.concepto.activo && (n.concepto.tipo === 'DEVENGADO' || n.concepto.tipo === 'DEDUCCION'))
      .map((n) => ({
        codigo: n.concepto.codigo,
        nombre: n.concepto.nombre,
        tipo: n.concepto.tipo as 'DEVENGADO' | 'DEDUCCION',
        valor: Number(n.valor),
        afectaIbcSs: n.concepto.afectaIbcSs,
        basePrestaciones: n.concepto.basePrestaciones,
        baseVacaciones: n.concepto.baseVacaciones,
      }))

    const resultado = liquidar({
      salarioBase: salarioEfectivo,
      tipoSalario: contrato.tipoSalario,
      tieneAuxTransporte: contrato.tieneAuxTransporte,
      auxConectividad: Number(contrato.auxConectividad ?? 0),
      diasTrabajados,
      diasPeriodo,
      valorHorasExtra: Math.round(valorHorasExtra),
      comisiones: totalComisiones,
      bonificacionConstitutiva,
      bonificacionNoConstitutiva,
      valorIncapacidad,
      valorVacacionesAnticipadas,
      otrosConceptos,
      cuotaPrestamo,
      claseRiesgoArl: contrato.colaborador.claseRiesgoArl ?? 'I',
      empresaExonerada,
      aplicaRetefuente,
      parametros,
    })

    await dbAuditado.liquidacionNomina.create({
      data: {
        periodoId,
        colaboradorId,
        diasTrabajados,
        salarioBase: salarioEfectivo,
        ibc: resultado.ibc,
        totalDevengado: resultado.totalDevengado,
        totalDeducido: resultado.totalDeducido,
        neto: resultado.neto,
        detalles: {
          create: resultado.lineas.map((l) => ({
            conceptoCodigo: l.codigo,
            conceptoNombre: l.nombre,
            tipo: l.tipo,
            cantidad: l.cantidad ?? null,
            base: l.base ?? null,
            factor: l.factor ?? null,
            valor: l.valor,
          })),
        },
      },
    })

    // Marcar las bonificaciones incluidas como pagadas en ESTE periodo, para que no
    // se vuelvan a pagar en el siguiente. El filtro por periodoId de arriba las
    // vuelve a tomar si se recalcula este mismo periodo.
    if (bonos.length > 0) {
      await prisma.bonificacion.updateMany({
        where: { id: { in: bonos.map((b) => b.id) } },
        data: { estadoPago: 'PAGADO', periodoId, fechaPago: periodo.fechaFin },
      })
    }

    // Igual con las demás novedades: quedan estampadas con este periodo, que es
    // lo que las marca como pagadas y evita que el siguiente las vuelva a tomar.
    const marcar = { data: { periodoId } }
    if (horas.length > 0) await prisma.novedadHoras.updateMany({ where: { id: { in: horas.map((h) => h.id) } }, ...marcar })
    if (comisiones.length > 0) await prisma.comision.updateMany({ where: { id: { in: comisiones.map((c) => c.id) } }, ...marcar })
    if (novedadesConcepto.length > 0) {
      await prisma.novedadConcepto.updateMany({ where: { id: { in: novedadesConcepto.map((n) => n.id) } }, ...marcar })
    }
    liquidados++
  }

  await prisma.periodoNomina.update({
    where: { id: periodoId },
    data: { estado: 'CALCULADA', parametrosSnapshot: parametros },
  })

  // Se devuelve para poder advertirlo en pantalla: la nómina se liquidó, pero
  // con horas de asistencia que no se pudieron actualizar.
  return { liquidados, horasSinRefrescar: asistencia.omitido ? (asistencia.sinRefrescar ?? 0) : 0 }
}
