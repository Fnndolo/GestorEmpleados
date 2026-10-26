'use server'

import { revalidatePath } from 'next/cache'
import { anotarPagoPeriodoEnAsistencia } from '@/server/asistencia/pagos-asistencia'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dbAuditado, auditar } from '@/lib/auditoria'
import { accion, ErrorNegocio } from '@/server/accion'
import { eliminarDocumento } from '@/server/documentos'
import { ENTIDAD_ACUERDO } from '@/server/descuentos-acuerdo'
import { ENTIDAD_COMPROBANTE_CUENTA } from '@/server/cuentas-cobro'
import { liquidarPeriodo, revertirEfectosPeriodo } from '@/server/nomina/liquidador'
import { generarDesprendibles } from '@/server/nomina/desprendibles'
import { generarPazSalvoPrestamo } from '@/server/prestamos'
import { guardarAcuerdo } from '@/server/descuentos-acuerdo'
import { contarPaginas } from '@/server/pdf/firma-en-pdf'

/** Dónde firma el colaborador en el PDF subido (puntos PDF, página en base 1). */
const posicionFirmaSchema = z.object({
  pagina: z.number().int().min(1), x: z.number(), y: z.number(), ancho: z.number().positive(), alto: z.number().positive(),
})
import { obtenerPdfAdjunto, borrarPdfTemporal } from '@/server/archivos-temporales'
import { parseFechaISO } from '@/lib/fechas'
import { registrarPagoCuentaCobro } from '@/server/cuentas-cobro'
import { registrarPagoNomina } from '@/server/nomina/pagos'
import { avisar, usuarioDeColaborador } from '@/server/notificaciones/avisar'
import { fmtCOP } from '@/lib/moneda'
import { fechaBreve } from '@/lib/notificaciones/texto'
import { dividirDiurnoNocturno, PAREJA_TIPO_HORA } from '@/server/nomina/horas'

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

/** Motivo obligatorio de toda anulación: queda en auditoría. */
const motivoSchema = z.string().trim().min(5, 'Explica por qué se anula.').max(300)

/**
 * Una novedad que un periodo CERRADO o PAGADO ya recogió no se toca: ese
 * dinero ya salió en un desprendible y corregirlo es un periodo de ajuste.
 */
function exigirPeriodoAbierto(periodo: { estado: string; nombre: string } | null, que: string): void {
  if (periodo && (periodo.estado === 'CERRADA' || periodo.estado === 'PAGADA')) {
    throw new ErrorNegocio(`${que} ya se pagó en el periodo cerrado "${periodo.nombre}": no se puede cambiar ni anular. Corrígelo con un periodo de ajuste.`)
  }
}

/**
 * Corregir un periodo que todavía no se ha aprobado: el nombre y las fechas
 * que cubre. Si ya estaba calculado, el cálculo se descarta (vuelve a
 * Borrador) porque con otras fechas las cifras ya no valen; se recalcula
 * desde su pantalla. No puede cruzarse con otro periodo del mismo tipo.
 */
export const editarPeriodo = accion(
  {
    modulo: 'nomina',
    accion: 'EDITAR',
    schema: z.object({
      periodoId: z.uuid(),
      nombre: z.string().trim().min(3, 'Escribe el nombre del periodo.').max(80),
      fechaInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      fechaFin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  },
  async (d) => {
    const p = await prisma.periodoNomina.findUniqueOrThrow({ where: { id: d.periodoId } })
    if (p.estado !== 'BORRADOR' && p.estado !== 'CALCULADA') {
      throw new ErrorNegocio(`El periodo está ${p.estado === 'APROBADA' ? 'aprobado' : 'cerrado'}: reábrelo primero si necesitas corregirlo.`)
    }
    const inicio = parseFechaISO(d.fechaInicio)!, fin = parseFechaISO(d.fechaFin)!
    if (fin < inicio) throw new ErrorNegocio('La fecha de fin no puede ser anterior a la de inicio.')
    const cruce = await prisma.periodoNomina.findFirst({
      where: { id: { not: p.id }, tipo: p.tipo, esAjuste: p.esAjuste, fechaInicio: { lte: fin }, fechaFin: { gte: inicio } },
      select: { nombre: true },
    })
    if (cruce) throw new ErrorNegocio(`Esas fechas se cruzan con el periodo "${cruce.nombre}".`)

    const cambianFechas = p.fechaInicio.getTime() !== inicio.getTime() || p.fechaFin.getTime() !== fin.getTime()
    if (cambianFechas && p.estado === 'CALCULADA') {
      // Lo calculado con las fechas viejas no sirve: se descarta y se recalcula.
      await revertirEfectosPeriodo(p.id)
    }
    await dbAuditado.periodoNomina.update({
      where: { id: p.id },
      data: { nombre: d.nombre, fechaInicio: inicio, fechaFin: fin, ...(cambianFechas && p.estado === 'CALCULADA' ? { estado: 'BORRADOR' } : {}) },
    })
    revalidatePath('/nomina')
    revalidatePath(`/nomina/${p.id}`)
    return { recalcular: cambianFechas && p.estado === 'CALCULADA' }
  },
)

export const crearPeriodo = accion(
  {
    modulo: 'nomina',
    accion: 'CREAR',
    schema: z.object({
      anio: z.coerce.number().int().min(2024).max(2100),
      mes: z.coerce.number().int().min(1).max(12),
      tipo: z.enum(['MENSUAL', 'QUINCENAL']),
      quincena: z.coerce.number().int().min(1).max(2).optional(),
    }),
  },
  async (d) => {
    const existe = await prisma.periodoNomina.findFirst({
      where: { anio: d.anio, mes: d.mes, quincena: d.tipo === 'QUINCENAL' ? (d.quincena ?? 1) : null, esAjuste: false },
    })
    if (existe) throw new ErrorNegocio('Ya existe ese periodo de nómina.')

    const diasPeriodo = d.tipo === 'QUINCENAL' ? 15 : 30
    const inicioDia = d.tipo === 'QUINCENAL' && d.quincena === 2 ? 16 : 1
    const finDia = d.tipo === 'QUINCENAL' ? (d.quincena === 2 ? 30 : 15) : 30
    const nombre = `${MESES[d.mes - 1]} ${d.anio}${d.tipo === 'QUINCENAL' ? ` · ${d.quincena}ª quincena` : ''}`

    const periodo = await dbAuditado.periodoNomina.create({
      data: {
        nombre, tipo: d.tipo, anio: d.anio, mes: d.mes,
        quincena: d.tipo === 'QUINCENAL' ? (d.quincena ?? 1) : null,
        fechaInicio: new Date(Date.UTC(d.anio, d.mes - 1, inicioDia)),
        fechaFin: new Date(Date.UTC(d.anio, d.mes - 1, finDia)),
        diasPeriodo, estado: 'BORRADOR',
      },
    })
    revalidatePath('/nomina')
    return { id: periodo.id }
  },
)

export const liquidar = accion(
  { modulo: 'nomina', accion: 'CREAR', schema: z.object({ periodoId: z.uuid() }) },
  async ({ periodoId }) => {
    const r = await liquidarPeriodo(periodoId)
    revalidatePath(`/nomina/${periodoId}`)
    return r
  },
)

export const aprobarPeriodo = accion(
  { modulo: 'nomina', accion: 'APROBAR', schema: z.object({ periodoId: z.uuid() }) },
  async ({ periodoId }) => {
    const p = await prisma.periodoNomina.findUniqueOrThrow({ where: { id: periodoId } })
    if (p.estado !== 'CALCULADA') throw new ErrorNegocio('Solo se aprueban periodos calculados.')
    await dbAuditado.periodoNomina.update({ where: { id: periodoId }, data: { estado: 'APROBADA' } })
    revalidatePath(`/nomina/${periodoId}`)
  },
)

export const cerrarPeriodo = accion(
  { modulo: 'nomina', accion: 'APROBAR', schema: z.object({ periodoId: z.uuid() }) },
  async ({ periodoId }) => {
    const p = await prisma.periodoNomina.findUniqueOrThrow({ where: { id: periodoId } })
    if (p.estado !== 'APROBADA') throw new ErrorNegocio('Solo se cierran periodos aprobados.')
    // Los efectos (abono de préstamos, bonificaciones pagadas, vacaciones anticipadas) los
    // aplica el LIQUIDADOR, de forma idempotente y atada al periodo. Cerrar solo congela el
    // estado: no debe volver a aplicarlos o se descontarían/pagarían dos veces.
    await dbAuditado.periodoNomina.update({ where: { id: periodoId }, data: { estado: 'CERRADA' } })
    // Las horas de asistencia que este periodo pagó quedan anotadas allá.
    const asistencia = await anotarPagoPeriodoEnAsistencia(periodoId, true)
    revalidatePath('/nomina')
    revalidatePath(`/nomina/${periodoId}`)
    return { asistencia }
  },
)

/**
 * Reabre un periodo cerrado o aprobado para poder corregirlo. Devuelve el periodo a
 * BORRADOR y deshace todo lo que había dejado aplicado (abonos de préstamo,
 * bonificaciones pagadas, vacaciones anticipadas), de modo que al volver a liquidar
 * no queden dobles descuentos. No se puede reabrir un periodo ya PAGADO.
 */
export const reabrirPeriodo = accion(
  { modulo: 'nomina', accion: 'APROBAR', schema: z.object({ periodoId: z.uuid() }) },
  async ({ periodoId }) => {
    const p = await prisma.periodoNomina.findUniqueOrThrow({ where: { id: periodoId } })
    if (p.estado === 'PAGADA') throw new ErrorNegocio('El periodo ya fue pagado: corrige con un periodo de ajuste.')
    if (p.estado === 'BORRADOR') throw new ErrorNegocio('El periodo ya está abierto.')
    // Con pagos registrados ya no se reabre: recalcular borraría lo que se pagó.
    const pagados = await prisma.liquidacionNomina.count({ where: { periodoId, pagadoEn: { not: null } } })
    if (pagados > 0) throw new ErrorNegocio(`Ya hay ${pagados} pago(s) registrado(s) en este periodo: no se puede reabrir. Corrige con un periodo de ajuste.`)

    await revertirEfectosPeriodo(periodoId)
    await dbAuditado.periodoNomina.update({ where: { id: periodoId }, data: { estado: 'BORRADOR' } })
    // Si estaba cerrado, sus horas de asistencia ya no cuentan como pagadas.
    const asistencia = p.estado === 'CERRADA' ? await anotarPagoPeriodoEnAsistencia(periodoId, false) : undefined
    revalidatePath('/nomina')
    revalidatePath(`/nomina/${periodoId}`)
    return { estadoAnterior: p.estado, asistencia }
  },
)

/**
 * Elimina un periodo que aún no se ha cerrado (útil si se creó por error). Deshace sus
 * efectos antes de borrarlo para no dejar préstamos ni bonificaciones descuadrados.
 */
export const eliminarPeriodo = accion(
  { modulo: 'nomina', accion: 'APROBAR', schema: z.object({ periodoId: z.uuid() }) },
  async ({ periodoId }) => {
    const p = await prisma.periodoNomina.findUniqueOrThrow({ where: { id: periodoId } })
    if (p.estado === 'CERRADA' || p.estado === 'PAGADA') {
      throw new ErrorNegocio('No se puede eliminar un periodo cerrado o pagado. Reábrelo primero si necesitas corregirlo.')
    }

    // Las novedades que este periodo había recogido quedan sueltas, no se borran:
    // de eso ya se encarga revertirEfectosPeriodo. La comisión existió aunque el
    // periodo se elimine, y la recoge el siguiente que cubra su fecha.
    const sueltas = await prisma.comision.count({ where: { periodoId } })
      + await prisma.novedadHoras.count({ where: { periodoId } })
      + await prisma.novedadConcepto.count({ where: { periodoId } })
    await revertirEfectosPeriodo(periodoId)
    await dbAuditado.periodoNomina.delete({ where: { id: periodoId } })
    revalidatePath('/nomina')
    revalidatePath('/nomina/novedades')
    return { nombre: p.nombre, sueltas }
  },
)

export const generarPdfDesprendibles = accion(
  { modulo: 'nomina', accion: 'EXPORTAR', schema: z.object({ periodoId: z.uuid() }) },
  async ({ periodoId }, usuario) => {
    const r = await generarDesprendibles(periodoId, usuario.id)
    revalidatePath(`/nomina/${periodoId}`)
    return r
  },
)

/**
 * Registrar un descuento de nómina (préstamo, anticipo, daño…). `mesInicio` es
 * el mes en que empieza a descontarse; el acuerdo de pago es opcional y, si
 * se adjunta, puede ir ya firmado o para que el colaborador lo firme.
 */
export const registrarPrestamo = accion(
  {
    modulo: 'nomina',
    accion: 'CREAR',
    schema: z.object({
      colaboradorId: z.uuid(),
      valorTotal: z.coerce.number().min(1),
      numeroCuotas: z.coerce.number().int().min(1).max(60),
      mesInicio: z.string().regex(/^\d{4}-\d{2}$/, 'Elige el mes en que empieza el descuento.'),
      descripcion: z.string().trim().min(3, 'Escribe el asunto del descuento.').max(300),
      acuerdoRef: z.string().min(16).max(2000).nullish(),
      requiereFirma: z.boolean().optional(),
      posicionFirma: posicionFirmaSchema.nullish(),
    }),
  },
  async (d, usuario) => {
    // A un retirado no se le presta (su saldo pendiente va a la liquidación).
    // Por decisión de la empresa (por ahora) NO se exige contrato cargado: hay
    // personas activas cuyo contrato aún no está en la app. El descuento queda
    // registrado y la nómina lo aplica cuando la persona entre a liquidación.
    const colab = await prisma.colaborador.findUniqueOrThrow({ where: { id: d.colaboradorId }, select: { estado: true } })
    if (colab.estado !== 'ACTIVO') throw new ErrorNegocio('El colaborador no está activo; no se le pueden registrar descuentos.')

    const valorCuota = Math.round(d.valorTotal / d.numeroCuotas)
    const prestamo = await dbAuditado.prestamo.create({
      data: {
        colaboradorId: d.colaboradorId, valorTotal: d.valorTotal, numeroCuotas: d.numeroCuotas,
        valorCuota, saldo: d.valorTotal, fechaInicio: parseFechaISO(`${d.mesInicio}-01`)!,
        estado: 'ACTIVO', descripcion: d.descripcion,
      },
    })
    await prisma.cuotaPrestamo.createMany({
      // La última cuota absorbe el redondeo: 1.000.000 en 3 son 333.333 + 333.333
      // + 333.334, no tres de 333.333 que dejarían un peso suelto en el saldo.
      data: Array.from({ length: d.numeroCuotas }, (_, i) => ({
        prestamoId: prestamo.id, numero: i + 1,
        valor: i === d.numeroCuotas - 1 ? d.valorTotal - valorCuota * (d.numeroCuotas - 1) : valorCuota,
      })),
    })
    if (d.acuerdoRef) {
      const pdf = await obtenerPdfAdjunto({ pdfRef: d.acuerdoRef }, usuario.id, 'El acuerdo de pago está vacío.')
      await guardarAcuerdo({ prestamoId: prestamo.id, colaboradorId: d.colaboradorId, pdf, asunto: d.descripcion, requiereFirma: d.requiereFirma === true, posicionFirma: d.posicionFirma ?? null, usuarioId: usuario.id })
      await borrarPdfTemporal(d.acuerdoRef, usuario.id)
    }
    revalidatePath('/nomina/prestamos')
    return { id: prestamo.id }
  },
)

/** Plan de cuotas: iguales, y la última absorbe el redondeo (misma regla que al registrar). */
function planDeCuotas(valorTotal: number, numeroCuotas: number): { valorCuota: number; cuotas: { numero: number; valor: number }[] } {
  const valorCuota = Math.round(valorTotal / numeroCuotas)
  return {
    valorCuota,
    cuotas: Array.from({ length: numeroCuotas }, (_, i) => ({
      numero: i + 1,
      valor: i === numeroCuotas - 1 ? valorTotal - valorCuota * (numeroCuotas - 1) : valorCuota,
    })),
  }
}

/** Un descuento con cuotas ya descontadas en nómina no se cambia ni se anula. */
async function exigirPrestamoSinPagos(prestamoId: string) {
  const p = await prisma.prestamo.findUniqueOrThrow({ where: { id: prestamoId }, include: { _count: { select: { cuotas: { where: { pagada: true } } } } } })
  if (p._count.cuotas > 0) {
    throw new ErrorNegocio(`Ya se descontaron ${p._count.cuotas} cuota(s) en nómina: el descuento no se puede cambiar ni anular. Ajusta las cuotas pendientes desde su detalle.`)
  }
  return p
}

/**
 * Corregir un descuento registrado con datos equivocados (asunto, valor,
 * cuotas o mes de inicio) mientras ninguna cuota se haya descontado. El plan
 * de cuotas se rehace desde cero, así que los ajustes acordados cuota a cuota
 * se pierden (se vuelven a acordar si hace falta). Con el acuerdo ya firmado
 * no se toca: lo firmado dice otras cifras.
 */
export const editarPrestamo = accion(
  {
    modulo: 'nomina',
    accion: 'EDITAR',
    schema: z.object({
      prestamoId: z.uuid(),
      valorTotal: z.coerce.number().min(1),
      numeroCuotas: z.coerce.number().int().min(1).max(60),
      mesInicio: z.string().regex(/^\d{4}-\d{2}$/, 'Elige el mes en que empieza el descuento.'),
      descripcion: z.string().trim().min(3, 'Escribe el asunto del descuento.').max(300),
    }),
  },
  async (d) => {
    const p = await exigirPrestamoSinPagos(d.prestamoId)
    if (p.firmaEmpleadoFecha) throw new ErrorNegocio('El acuerdo de pago ya está firmado por el colaborador: no se puede cambiar ni anular el descuento.')
    const plan = planDeCuotas(d.valorTotal, d.numeroCuotas)
    await dbAuditado.prestamo.update({
      where: { id: p.id },
      data: {
        valorTotal: d.valorTotal, numeroCuotas: d.numeroCuotas, valorCuota: plan.valorCuota, saldo: d.valorTotal,
        fechaInicio: parseFechaISO(`${d.mesInicio}-01`)!, descripcion: d.descripcion,
      },
    })
    await prisma.cuotaPrestamo.deleteMany({ where: { prestamoId: p.id } })
    await prisma.cuotaPrestamo.createMany({ data: plan.cuotas.map((c) => ({ prestamoId: p.id, ...c })) })
    revalidatePath('/nomina/prestamos')
    revalidatePath(`/nomina/prestamos/${p.id}`)
    return { ok: true }
  },
)

/**
 * Anular un descuento registrado por error, con el motivo (queda en
 * auditoría). Solo mientras ninguna cuota se haya descontado y el acuerdo no
 * esté firmado. Se va con sus cuotas y con el acuerdo adjunto; si el
 * colaborador tenía el acuerdo por firmar, se le avisa que ya no debe firmarlo.
 */
export const anularPrestamo = accion(
  { modulo: 'nomina', accion: 'ELIMINAR', schema: z.object({ prestamoId: z.uuid(), motivo: motivoSchema }) },
  async (d) => {
    const p = await exigirPrestamoSinPagos(d.prestamoId)
    if (p.firmaEmpleadoFecha) throw new ErrorNegocio('El acuerdo de pago ya está firmado por el colaborador: no se puede cambiar ni anular el descuento.')
    const porFirmar = p.requiereFirma && !!p.acuerdoDocId
    const docs = await prisma.documento.findMany({ where: { entidadTipo: ENTIDAD_ACUERDO, entidadId: p.id }, select: { id: true } })
    // Las cuotas se van en cascada con el descuento.
    await dbAuditado.prestamo.delete({ where: { id: p.id } })
    for (const doc of docs) await eliminarDocumento(doc.id).catch(() => {})
    await auditar('ELIMINAR', 'Prestamo', { registroId: p.id, descripcion: `Anulado: ${d.motivo}` })
    if (porFirmar) {
      const uid = await usuarioDeColaborador(p.colaboradorId)
      if (uid) {
        await avisar(uid, {
          evento: 'solicitud_resuelta',
          titulo: `Talento Humano anuló el descuento "${p.descripcion ?? 'Descuento'}"`,
          mensaje: `Ya no debes firmar el acuerdo de pago. Motivo: ${d.motivo}`,
          enlace: '/autoservicio/descuentos',
        }).catch(() => {})
      }
    }
    revalidatePath('/nomina/prestamos')
    revalidatePath('/autoservicio/descuentos')
    return { ok: true }
  },
)

/**
 * Cuántas páginas tiene el acuerdo recién subido. A propósito NO se busca la
 * línea de firma en el texto: los acuerdos no tienen un formato fijo (y la
 * palabra bajo la línea puede cambiar), así que el recuadro aparece siempre en
 * la última página y quien lo sube lo arrastra a su sitio. Con la plantilla del
 * acuerdo, la posición quedará fija.
 */
export const analizarAcuerdoDescuento = accion(
  { modulo: 'nomina', accion: 'CREAR', schema: z.object({ acuerdoRef: z.string().min(16).max(2000) }) },
  async (d, usuario) => {
    const pdf = await obtenerPdfAdjunto({ pdfRef: d.acuerdoRef }, usuario.id, 'El acuerdo de pago está vacío.')
    return { paginas: await contarPaginas(pdf), posicion: null }
  },
)

/**
 * Ajustar lo que se descuenta en una cuota que todavía no se ha pagado: se
 * habla con la persona antes de la nómina y puede pagar más, menos o nada ese
 * mes (0). Las cuotas pendientes que vienen DESPUÉS se recalculan para repartir
 * lo que falta del saldo en partes iguales (la última absorbe el redondeo), así
 * el plan siempre suma el saldo. Si no quedan cuotas después y falta saldo, la
 * nómina agrega las que hagan falta al final; si ya no falta nada, las cuotas
 * sobrantes se quitan. Sin `cuotaId` se ajusta la próxima cuota de un
 * descuento que ya agotó su plan pero aún tiene saldo.
 */
export const ajustarCuotaDescuento = accion(
  {
    modulo: 'nomina',
    accion: 'EDITAR',
    schema: z.object({
      prestamoId: z.uuid(),
      cuotaId: z.uuid().nullish(),
      valor: z.coerce.number().min(0, 'El valor no puede ser negativo.'),
    }),
  },
  async (d) => {
    const p = await prisma.prestamo.findUniqueOrThrow({ where: { id: d.prestamoId }, include: { _count: { select: { cuotas: true } } } })
    if (p.estado !== 'ACTIVO') throw new ErrorNegocio('Este descuento ya está pagado.')
    if (d.valor > Number(p.saldo)) throw new ErrorNegocio(`No puede ser mayor que el saldo (${fmtCOP(Number(p.saldo))}).`)
    if (d.cuotaId) {
      const c = await prisma.cuotaPrestamo.findUniqueOrThrow({ where: { id: d.cuotaId } })
      if (c.prestamoId !== p.id) throw new ErrorNegocio('La cuota no es de este descuento.')
      if (c.pagada) throw new ErrorNegocio('Esa cuota ya se descontó en una nómina.')
      const pendientes = await prisma.cuotaPrestamo.findMany({ where: { prestamoId: p.id, pagada: false }, orderBy: { numero: 'asc' } })
      const antes = pendientes.filter((x) => x.numero < c.numero)
      const despues = pendientes.filter((x) => x.numero > c.numero)
      // Lo que ya está comprometido en las cuotas pendientes anteriores a esta.
      const comprometido = antes.reduce((t, x) => t + Number(x.valorAcordado ?? x.valor), 0)
      const disponible = Number(p.saldo) - comprometido
      if (d.valor > disponible) {
        throw new ErrorNegocio(`Con las cuotas anteriores, esta puede ser de máximo ${fmtCOP(Math.max(0, disponible))}.`)
      }
      await dbAuditado.cuotaPrestamo.update({ where: { id: c.id }, data: { valorAcordado: d.valor } })

      const resto = Math.round((disponible - d.valor) * 100) / 100
      if (resto <= 0) {
        // Con esta cuota se completa el saldo: las siguientes ya no hacen falta.
        if (despues.length) await prisma.cuotaPrestamo.deleteMany({ where: { id: { in: despues.map((x) => x.id) } } })
      } else if (despues.length) {
        const parte = Math.floor(resto / despues.length)
        for (const [i, x] of despues.entries()) {
          const valor = i === despues.length - 1 ? Math.round((resto - parte * (despues.length - 1)) * 100) / 100 : parte
          await dbAuditado.cuotaPrestamo.update({ where: { id: x.id }, data: { valorAcordado: valor } })
        }
      }
    } else {
      await dbAuditado.cuotaPrestamo.create({
        data: { prestamoId: p.id, numero: p._count.cuotas + 1, valor: p.valorCuota, valorAcordado: d.valor },
      })
    }
    revalidatePath(`/nomina/prestamos/${p.id}`)
    return { ok: true }
  },
)

/**
 * Adjuntar (o reemplazar) el acuerdo de pago de un descuento ya registrado,
 * mientras el colaborador no lo haya firmado.
 */
export const adjuntarAcuerdoDescuento = accion(
  {
    modulo: 'nomina',
    accion: 'EDITAR',
    schema: z.object({ prestamoId: z.uuid(), acuerdoRef: z.string().min(16).max(2000), requiereFirma: z.boolean(), posicionFirma: posicionFirmaSchema.nullish() }),
  },
  async (d, usuario) => {
    const p = await prisma.prestamo.findUniqueOrThrow({ where: { id: d.prestamoId } })
    if (p.firmaEmpleadoFecha) throw new ErrorNegocio('El colaborador ya firmó el acuerdo: no se puede reemplazar.')
    const pdf = await obtenerPdfAdjunto({ pdfRef: d.acuerdoRef }, usuario.id, 'El acuerdo de pago está vacío.')
    await guardarAcuerdo({ prestamoId: p.id, colaboradorId: p.colaboradorId, pdf, asunto: p.descripcion ?? 'Descuento', requiereFirma: d.requiereFirma, posicionFirma: d.posicionFirma ?? null, usuarioId: usuario.id })
    await borrarPdfTemporal(d.acuerdoRef, usuario.id)
    revalidatePath('/nomina/prestamos')
    revalidatePath(`/nomina/prestamos/${p.id}`)
    return { ok: true }
  },
)

export const generarPazSalvoDePrestamo = accion(
  { modulo: 'nomina', accion: 'EXPORTAR', schema: z.object({ prestamoId: z.uuid() }) },
  async ({ prestamoId }, usuario) => {
    const documentoId = await generarPazSalvoPrestamo(prestamoId, usuario.id)
    revalidatePath(`/nomina/prestamos/${prestamoId}`)
    return { documentoId }
  },
)

/**
 * Registra una comisión con su fecha de causación, sin amarrarla a un periodo.
 *
 * El periodo la recoge después por rango de fechas. Así se puede registrar el
 * día que ocurre —sin esperar a que alguien abra la nómina del mes— y lo que
 * quede sin pagar cuando alguien se retira lo recoge su liquidación.
 */
export const registrarComision = accion(
  {
    modulo: 'nomina',
    accion: 'CREAR',
    schema: z.object({
      colaboradorId: z.uuid(),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      tipo: z.enum(['VENTA', 'RECAUDO']),
      baseCalculo: z.coerce.number().min(0),
      valor: z.coerce.number().min(0),
      descripcion: z.string().max(300).optional(),
    }),
  },
  async (d) => {
    await dbAuditado.comision.create({
      data: {
        colaboradorId: d.colaboradorId, fecha: parseFechaISO(d.fecha)!, tipo: d.tipo,
        baseCalculo: d.baseCalculo, valor: d.valor, descripcion: d.descripcion,
      },
    })
    revalidatePath('/nomina/novedades')
  },
)

const comisionCamposSchema = z.object({
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  tipo: z.enum(['VENTA', 'RECAUDO']),
  baseCalculo: z.coerce.number().min(0),
  valor: z.coerce.number().min(0),
  descripcion: z.string().max(300).optional(),
})

/**
 * Corregir una comisión (fecha, tipo, base, valor). Si un periodo abierto ya
 * la recogió, al recalcularlo toma los valores nuevos; si ese periodo está
 * cerrado, no se toca.
 */
export const editarComision = accion(
  { modulo: 'nomina', accion: 'EDITAR', schema: comisionCamposSchema.extend({ id: z.uuid() }) },
  async (d) => {
    const c = await prisma.comision.findUniqueOrThrow({ where: { id: d.id }, include: { periodo: true } })
    exigirPeriodoAbierto(c.periodo, 'Esta comisión')
    await dbAuditado.comision.update({
      where: { id: c.id },
      data: { fecha: parseFechaISO(d.fecha)!, tipo: d.tipo, baseCalculo: d.baseCalculo, valor: d.valor, descripcion: d.descripcion?.trim() || null },
    })
    revalidatePath('/nomina/novedades')
    return { ok: true }
  },
)

/** Solo se puede borrar mientras nadie la haya pagado; el motivo queda en auditoría. */
export const eliminarComision = accion(
  { modulo: 'nomina', accion: 'ELIMINAR', schema: z.object({ id: z.uuid(), motivo: motivoSchema }) },
  async ({ id, motivo }) => {
    const c = await prisma.comision.findUniqueOrThrow({ where: { id }, include: { periodo: true } })
    exigirPeriodoAbierto(c.periodo, 'Esta comisión')
    await dbAuditado.comision.delete({ where: { id } })
    await auditar('ELIMINAR', 'Comision', { registroId: id, descripcion: `Anulado: ${motivo}` })
    revalidatePath('/nomina/novedades')
    return { ok: true }
  },
)

/**
 * Aplica un concepto configurable del catálogo a un colaborador en un periodo
 * (auxilio, prima extralegal, descuento…). El motor lo liquida según las
 * banderas del concepto: constitutivo → IBC y prestaciones (art. 127/128 CST).
 */
export const registrarNovedadConcepto = accion(
  {
    modulo: 'nomina',
    accion: 'CREAR',
    schema: z.object({
      colaboradorId: z.uuid(),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      conceptoId: z.uuid(),
      valor: z.coerce.number().min(0).optional(),
      observaciones: z.string().max(300).optional(),
    }),
  },
  async (d) => {
    const concepto = await prisma.conceptoNomina.findUniqueOrThrow({ where: { id: d.conceptoId } })
    if (!concepto.activo) throw new ErrorNegocio('El concepto está inactivo.')
    if (concepto.tipoCalculo === 'SISTEMA') throw new ErrorNegocio('Este concepto lo calcula el motor automáticamente; no se aplica a mano.')
    const valor = d.valor ?? Number(concepto.valorFijo ?? 0)
    if (valor <= 0) throw new ErrorNegocio('Indica el valor (el concepto no tiene valor fijo configurado).')

    await dbAuditado.novedadConcepto.create({
      data: {
        colaboradorId: d.colaboradorId, fecha: parseFechaISO(d.fecha)!, conceptoId: d.conceptoId,
        valor, observaciones: d.observaciones || null,
      },
    })
    revalidatePath('/nomina/novedades')
    return { ok: true }
  },
)

/** Corregir un concepto aplicado (fecha, concepto, valor), con el mismo bloqueo que borrarlo. */
export const editarNovedadConcepto = accion(
  {
    modulo: 'nomina',
    accion: 'EDITAR',
    schema: z.object({
      id: z.uuid(),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      conceptoId: z.uuid(),
      valor: z.coerce.number().min(0).optional(),
      observaciones: z.string().max(300).optional(),
    }),
  },
  async (d) => {
    const n = await prisma.novedadConcepto.findUniqueOrThrow({ where: { id: d.id }, include: { periodo: true } })
    exigirPeriodoAbierto(n.periodo, 'Esta novedad')
    const concepto = await prisma.conceptoNomina.findUniqueOrThrow({ where: { id: d.conceptoId } })
    if (!concepto.activo) throw new ErrorNegocio('El concepto está inactivo.')
    if (concepto.tipoCalculo === 'SISTEMA') throw new ErrorNegocio('Este concepto lo calcula el motor automáticamente; no se aplica a mano.')
    const valor = d.valor ?? Number(concepto.valorFijo ?? 0)
    if (valor <= 0) throw new ErrorNegocio('Indica el valor (el concepto no tiene valor fijo configurado).')
    await dbAuditado.novedadConcepto.update({
      where: { id: n.id },
      data: { fecha: parseFechaISO(d.fecha)!, conceptoId: d.conceptoId, valor, observaciones: d.observaciones?.trim() || null },
    })
    revalidatePath('/nomina/novedades')
    return { ok: true }
  },
)

export const eliminarNovedadConcepto = accion(
  { modulo: 'nomina', accion: 'ELIMINAR', schema: z.object({ id: z.uuid(), motivo: motivoSchema }) },
  async ({ id, motivo }) => {
    const n = await prisma.novedadConcepto.findUniqueOrThrow({ where: { id }, include: { periodo: true } })
    exigirPeriodoAbierto(n.periodo, 'Esta novedad')
    await dbAuditado.novedadConcepto.delete({ where: { id } })
    await auditar('ELIMINAR', 'NovedadConcepto', { registroId: id, descripcion: `Anulado: ${motivo}` })
    revalidatePath('/nomina/novedades')
    return { ok: true }
  },
)

const TIPOS_HORA = ['HED', 'HEN', 'RN', 'RD', 'RND', 'HEDD', 'HEND'] as const

/**
 * Con rango horario válido, la clasificación diurna/nocturna la hace el
 * sistema (Ley 2466, RIT art. 22); sin rango, se toman el tipo y las horas tal
 * como se digitaron. Lo comparten registrar y editar.
 */
function tramosDeHoras(d: { tipoHora: string; horas: number; horaInicio: string; horaFin: string }): { tipoHora: string; horas: number }[] {
  const rangoValido = /^\d{2}:\d{2}$/.test(d.horaInicio) && /^\d{2}:\d{2}$/.test(d.horaFin) && d.horaInicio !== d.horaFin
  if (!rangoValido) return [{ tipoHora: d.tipoHora, horas: d.horas }]
  const { diurnas, nocturnas } = dividirDiurnoNocturno(d.horaInicio, d.horaFin)
  const pareja = PAREJA_TIPO_HORA[d.tipoHora]
  const tramos = [
    ...(diurnas > 0 && pareja.diurno ? [{ tipoHora: pareja.diurno, horas: diurnas }] : []),
    ...(nocturnas > 0 ? [{ tipoHora: pareja.nocturno, horas: nocturnas }] : []),
  ]
  if (tramos.length === 0) throw new ErrorNegocio('El rango indicado no genera horas con recargo (la hora ordinaria diurna no tiene recargo).')
  return tramos
}

/**
 * Corregir una novedad de horas (a mano o traída de AsistencIA). Las horas se
 * recalculan igual que al registrar: con rango, por franja; si el rango cruza
 * las 7:00 p.m., esta fila queda con la parte diurna y la nocturna se crea
 * aparte. Una que ya pagó un periodo cerrado no se toca.
 */
export const editarNovedadHoras = accion(
  {
    modulo: 'nomina',
    accion: 'EDITAR',
    schema: z.object({
      id: z.uuid(),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      tipoHora: z.enum(TIPOS_HORA),
      horas: z.coerce.number().min(0.5).max(12),
      horaInicio: z.string().default(''),
      horaFin: z.string().default(''),
      observaciones: z.string().trim().max(300).optional(),
    }),
  },
  async (d) => {
    const n = await prisma.novedadHoras.findUniqueOrThrow({ where: { id: d.id }, include: { periodo: true } })
    exigirPeriodoAbierto(n.periodo, 'Esta novedad de horas')
    const [primero, ...resto] = tramosDeHoras(d)
    const conRango = /^\d{2}:\d{2}$/.test(d.horaInicio) && /^\d{2}:\d{2}$/.test(d.horaFin)
    const horaInicio = conRango ? d.horaInicio : n.horaInicio
    const horaFin = conRango ? d.horaFin : n.horaFin
    const observaciones = d.observaciones || (resto.length ? 'Clasificada automáticamente por franja horaria (Ley 2466).' : null)
    await dbAuditado.novedadHoras.update({
      where: { id: n.id },
      data: { fecha: parseFechaISO(d.fecha)!, tipoHora: primero.tipoHora, horas: primero.horas, horaInicio, horaFin, observaciones },
    })
    for (const t of resto) {
      await dbAuditado.novedadHoras.create({
        data: { colaboradorId: n.colaboradorId, periodoId: n.periodoId, fecha: parseFechaISO(d.fecha)!, tipoHora: t.tipoHora, horas: t.horas, horaInicio, horaFin, observaciones },
      })
    }
    revalidatePath('/nomina/novedades')
    return { tramos: [primero, ...resto] }
  },
)

/** Borrar una novedad de horas mal registrada, con el motivo (queda en auditoría). */
export const eliminarNovedadHoras = accion(
  { modulo: 'nomina', accion: 'ELIMINAR', schema: z.object({ id: z.uuid(), motivo: motivoSchema }) },
  async ({ id, motivo }) => {
    const n = await prisma.novedadHoras.findUniqueOrThrow({ where: { id }, include: { periodo: true } })
    exigirPeriodoAbierto(n.periodo, 'Esta novedad de horas')
    await dbAuditado.novedadHoras.delete({ where: { id } })
    await auditar('ELIMINAR', 'NovedadHoras', { registroId: id, descripcion: `Anulado: ${motivo}` })
    revalidatePath('/nomina/novedades')
    return { ok: true }
  },
)

export const registrarHoras = accion(
  {
    modulo: 'nomina',
    accion: 'CREAR',
    schema: z.object({
      colaboradorId: z.uuid(),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      tipoHora: z.enum(TIPOS_HORA),
      horas: z.coerce.number().min(0.5).max(12),
      horaInicio: z.string().default(''),
      horaFin: z.string().default(''),
    }),
  },
  async (d) => {
    // Con rango horario, el sistema clasifica solo: la franja nocturna va de
    // 7:00 p.m. a 6:00 a.m. (Ley 2466, RIT art. 22). Un rango que cruza las
    // 7:00 p.m. se parte en dos novedades (parte diurna y parte nocturna).
    const rangoValido = /^\d{2}:\d{2}$/.test(d.horaInicio) && /^\d{2}:\d{2}$/.test(d.horaFin) && d.horaInicio !== d.horaFin
    if (rangoValido) {
      const tramos = tramosDeHoras(d)
      for (const t of tramos) {
        await dbAuditado.novedadHoras.create({
          data: {
            colaboradorId: d.colaboradorId, fecha: parseFechaISO(d.fecha)!,
            tipoHora: t.tipoHora, horas: t.horas, horaInicio: d.horaInicio, horaFin: d.horaFin,
            observaciones: tramos.length > 1 ? 'Clasificada automáticamente por franja horaria (Ley 2466).' : null,
          },
        })
      }
      revalidatePath('/nomina/novedades')
      return { tramos }
    }
    await dbAuditado.novedadHoras.create({
      data: { colaboradorId: d.colaboradorId, fecha: parseFechaISO(d.fecha)!, tipoHora: d.tipoHora, horas: d.horas, horaInicio: d.horaInicio || '00:00', horaFin: d.horaFin || '00:00' },
    })
    revalidatePath('/nomina/novedades')
    return { tramos: [{ tipoHora: d.tipoHora, horas: d.horas }] }
  },
)

/**
 * Pagos OPS: registra el pago de una cuenta de cobro aprobada desde la misma
 * lista de lo que falta por pagar. El comprobante es un soporte: se adjunta en
 * el momento o después, con esta misma acción (la fecha ya guardada se
 * conserva). Le avisa al contratista la primera vez y la cuenta pasa a «Pagadas».
 */
export const pagarCuentaCobro = accion(
  {
    modulo: 'nomina',
    accion: 'APROBAR',
    schema: z.object({
      id: z.uuid(),
      fechaPago: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Indica la fecha del pago.'),
      comprobante: z.string().startsWith('data:', 'El comprobante no es un archivo válido.').optional(),
    }),
  },
  async (d, usuario) => {
    const fechaPago = parseFechaISO(d.fechaPago)!
    const yaPagada = (await prisma.cuentaCobroOps.findUnique({ where: { id: d.id }, select: { estado: true } }))?.estado === 'PAGADA'
    const r = await registrarPagoCuentaCobro({ cuentaId: d.id, fechaPago, comprobanteDataUri: d.comprobante ?? null, usuarioId: usuario.id })
    const uid = r.colaboradorId && !yaPagada ? await usuarioDeColaborador(r.colaboradorId) : null
    if (uid) {
      await avisar(uid, {
        evento: 'cuenta_cobro_estado',
        titulo: `Tu cuenta ${r.numero} fue pagada`,
        mensaje: `${fmtCOP(r.valor)} · pago del ${fechaBreve(d.fechaPago)}.`,
        enlace: '/autoservicio/cuentas-cobro',
        llamadoAccion: 'Ver mis cuentas de cobro',
      }).catch(() => {})
    }
    revalidatePath('/nomina/ops')
    revalidatePath('/contratos/cuentas-cobro')
    revalidatePath('/contratos/ops')
  },
)

/**
 * Registra el pago de la nómina de una persona en un periodo cerrado. El
 * comprobante de la transferencia es un soporte: se adjunta en el momento o
 * después, con esta misma acción (la fecha ya guardada se conserva). Le avisa
 * la primera vez, y el periodo pasa a Pagada cuando ya están pagados todos.
 */
export const pagarNominaPersona = accion(
  {
    modulo: 'nomina',
    accion: 'APROBAR',
    schema: z.object({
      liquidacionId: z.uuid(),
      fechaPago: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Indica la fecha del pago.'),
      comprobante: z.string().startsWith('data:', 'El comprobante no es un archivo válido.').optional(),
    }),
  },
  async (d, usuario) => {
    const yaPagada = !!(await prisma.liquidacionNomina.findUnique({ where: { id: d.liquidacionId }, select: { pagadoEn: true } }))?.pagadoEn
    const r = await registrarPagoNomina({ liquidacionId: d.liquidacionId, fechaPago: parseFechaISO(d.fechaPago)!, comprobanteDataUri: d.comprobante ?? null, usuarioId: usuario.id })
    const uid = yaPagada ? null : await usuarioDeColaborador(r.colaboradorId)
    if (uid) {
      await avisar(uid, {
        evento: 'nomina_pagada',
        titulo: `Se pagó tu nómina de ${r.periodoNombre}`,
        mensaje: `${fmtCOP(r.neto)} · pago del ${fechaBreve(d.fechaPago)}. ${r.conComprobante ? 'El desprendible y el comprobante están' : 'El desprendible está'} en Mis desprendibles.`,
        enlace: '/autoservicio/desprendibles',
        llamadoAccion: 'Ver mis desprendibles',
      }).catch(() => {})
    }
    revalidatePath('/nomina')
    return { periodoPagado: r.periodoPagado }
  },
)

/**
 * Deshace el registro del pago de la nómina de una persona (se registró a la
 * persona equivocada, o no se había pagado): la liquidación vuelve a "por
 * pagar" y el comprobante se retira. En un periodo ya PAGADO solo se puede si
 * esa es su única liquidación (el periodo vuelve a Cerrado); con más gente
 * pagada, el periodo ya quedó cerrado contablemente y se corrige con un ajuste.
 */
export const deshacerPagoNominaPersona = accion(
  { modulo: 'nomina', accion: 'APROBAR', schema: z.object({ liquidacionId: z.uuid(), motivo: motivoSchema }) },
  async (d) => {
    const liq = await prisma.liquidacionNomina.findUniqueOrThrow({ where: { id: d.liquidacionId }, include: { periodo: true } })
    if (!liq.pagadoEn) throw new ErrorNegocio('Esta nómina no tiene un pago registrado.')
    if (liq.periodo.estado === 'PAGADA') {
      const total = await prisma.liquidacionNomina.count({ where: { periodoId: liq.periodoId } })
      if (total > 1) {
        throw new ErrorNegocio(`El periodo "${liq.periodo.nombre}" ya quedó pagado con ${total} personas: no se deshace un pago suelto. Corrígelo con un periodo de ajuste.`)
      }
      await dbAuditado.periodoNomina.update({ where: { id: liq.periodoId }, data: { estado: 'CERRADA' } })
    }
    await dbAuditado.liquidacionNomina.update({ where: { id: liq.id }, data: { pagadoEn: null, comprobantePagoId: null } })
    if (liq.comprobantePagoId) await eliminarDocumento(liq.comprobantePagoId).catch(() => {})
    await auditar('EDITAR', 'LiquidacionNomina', { registroId: liq.id, descripcion: `Pago deshecho: ${d.motivo}` })
    const uid = await usuarioDeColaborador(liq.colaboradorId)
    if (uid) {
      await avisar(uid, {
        evento: 'nomina_pagada',
        titulo: `Se corrigió el registro del pago de tu nómina de ${liq.periodo.nombre}`,
        mensaje: `El pago registrado el ${fechaBreve(liq.pagadoEn)} se retiró. Motivo: ${d.motivo}`,
        enlace: '/autoservicio/desprendibles',
      }).catch(() => {})
    }
    revalidatePath('/nomina')
    revalidatePath(`/nomina/${liq.periodoId}`)
    return { ok: true }
  },
)

/**
 * Deshace el pago de una cuenta de cobro (se marcó la cuenta equivocada): vuelve
 * a "por pagar" y el comprobante se retira. Se le avisa al contratista.
 */
export const deshacerPagoCuentaCobro = accion(
  { modulo: 'nomina', accion: 'APROBAR', schema: z.object({ id: z.uuid(), motivo: motivoSchema }) },
  async (d) => {
    const cuenta = await prisma.cuentaCobroOps.findUniqueOrThrow({ where: { id: d.id }, include: { contratoOps: { select: { colaboradorId: true } } } })
    if (cuenta.estado !== 'PAGADA') throw new ErrorNegocio('Esta cuenta no está pagada.')
    const comprobantes = await prisma.documento.findMany({ where: { entidadTipo: ENTIDAD_COMPROBANTE_CUENTA, entidadId: cuenta.id }, select: { id: true } })
    await dbAuditado.cuentaCobroOps.update({ where: { id: cuenta.id }, data: { estado: 'APROBADA', fechaPago: null } })
    for (const doc of comprobantes) await eliminarDocumento(doc.id).catch(() => {})
    await auditar('EDITAR', 'CuentaCobroOps', { registroId: cuenta.id, descripcion: `Pago deshecho: ${d.motivo}` })
    const colaboradorId = cuenta.colaboradorId ?? cuenta.contratoOps?.colaboradorId ?? null
    const uid = colaboradorId ? await usuarioDeColaborador(colaboradorId) : null
    if (uid) {
      await avisar(uid, {
        evento: 'cuenta_cobro_estado',
        titulo: `Tu cuenta ${cuenta.numero} vuelve a estar por pagar`,
        mensaje: `El pago registrado se retiró. Motivo: ${d.motivo}`,
        enlace: '/autoservicio/cuentas-cobro',
        llamadoAccion: 'Ver mis cuentas de cobro',
      }).catch(() => {})
    }
    revalidatePath('/nomina/ops')
    revalidatePath('/contratos/cuentas-cobro')
    revalidatePath('/contratos/ops')
    return { ok: true }
  },
)
