import { requerirPermiso, tienePermiso, alcanceDe } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { sedeActualId } from '@/server/sede-actual'
import { hoyBogota, formatFechaISO } from '@/lib/fechas'
import { SstCliente } from './sst-cliente'

export const metadata = { title: 'SST · Smart Gadgets RH' }

export default async function SstPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const usuario = await requerirPermiso('sst', 'VER')
  const { tab = 'tablero' } = await searchParams
  const puedeCrear = tienePermiso(usuario, 'sst', 'CREAR')
  const puedeEditar = tienePermiso(usuario, 'sst', 'EDITAR')
  const anio = hoyBogota().getUTCFullYear()
  const hoy = hoyBogota()
  const en30 = new Date(hoy); en30.setUTCDate(en30.getUTCDate() + 30)

  // Alcance por sede — SOLO para lo operativo/personal. Lo documental del SG-SST
  // (estructura, matriz legal, autoevaluación, indicadores) es uno por empleador
  // y se muestra global a propósito.
  const sedeActiva = await sedeActualId()
  const alcance = alcanceDe(usuario, 'sst', 'VER')
  const sedesPermitidas = alcance === 'SEDES_ASIGNADAS' || alcance === 'EQUIPO'
    ? (usuario.sedeIds.length ? usuario.sedeIds : ['∅'])
    : null
  // Registros con sedeId propio: los globales (sedeId null) se ven en cualquier sede.
  const fSede = sedeActiva
    ? { OR: [{ sedeId: sedeActiva }, { sedeId: null }] }
    : sedesPermitidas
      ? { OR: [{ sedeId: { in: sedesPermitidas } }, { sedeId: null }] }
      : {}
  // Registros que heredan la sede del colaborador (exámenes, EPP, novedades ARL).
  const fColab = sedeActiva
    ? { colaborador: { sedeId: sedeActiva } }
    : sedesPermitidas
      ? { colaborador: { sedeId: { in: sedesPermitidas } } }
      : {}

  const [
    headcount,
    autoeval, comites, examenes, accidentes, epps, entregasEpp, peligros,
    profesiogramas, cargos, sedes, planesEmergencia, brigadistas, simulacros, inspecciones,
    politicaSgsst, politicasDisponibles, responsableSgsst, planTrabajo, normas,
    indicadoresSst, novedadesArl,
  ] = await Promise.all([
    prisma.colaborador.count({ where: { estado: 'ACTIVO' } }),
    prisma.autoevaluacionSst.findFirst({ orderBy: { anio: 'desc' }, include: { acciones: { orderBy: [{ cumplida: 'asc' }, { fechaLimite: 'asc' }] } } }),
    prisma.comite.findMany({
      where: { activo: true, ...fSede }, orderBy: { creadoEn: 'desc' },
      include: {
        miembros: { include: { colaborador: { select: { nombres: true, apellidos: true } } } },
        reuniones: { orderBy: { fecha: 'desc' } },
      },
    }),
    prisma.examenMedico.findMany({ where: fColab, include: { colaborador: { select: { nombres: true, apellidos: true } }, seguimientos: { orderBy: { fecha: 'desc' } } }, orderBy: { fecha: 'desc' }, take: 80 }),
    prisma.accidenteTrabajo.findMany({ where: fSede, include: { colaborador: { select: { nombres: true, apellidos: true } } }, orderBy: { fecha: 'desc' }, take: 80 }),
    prisma.elementoEpp.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } }),
    prisma.entregaEpp.findMany({ where: fColab, include: { elementoEpp: true, colaborador: { select: { nombres: true, apellidos: true } } }, orderBy: { fechaEntrega: 'desc' }, take: 60 }),
    prisma.peligroIpevr.findMany({ where: fSede, orderBy: { creadoEn: 'desc' }, take: 80 }),
    prisma.profesiograma.findMany({ orderBy: { actualizadoEn: 'desc' } }),
    prisma.cargo.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' }, select: { id: true, nombre: true } }),
    prisma.sede.findMany({ where: { activa: true }, orderBy: { nombre: 'asc' }, select: { id: true, nombre: true } }),
    prisma.planEmergencia.findMany({ where: { activo: true, ...fSede }, orderBy: { creadoEn: 'desc' } }),
    prisma.brigadista.findMany({ where: { activo: true, ...fSede }, include: { colaborador: { select: { nombres: true, apellidos: true } } }, orderBy: { creadoEn: 'desc' } }),
    prisma.simulacro.findMany({ where: fSede, orderBy: { fecha: 'desc' }, take: 40 }),
    prisma.inspeccionSst.findMany({ where: fSede, orderBy: { fecha: 'desc' }, take: 80 }),
    prisma.documentoLegal.findFirst({ where: { esSgSst: true } }),
    prisma.documentoLegal.findMany({ where: { categoria: 'POLITICA' }, orderBy: { titulo: 'asc' }, select: { id: true, titulo: true, esSgSst: true } }),
    prisma.responsableSgsst.findFirst({ where: { activo: true }, orderBy: { creadoEn: 'desc' }, include: { colaborador: { select: { nombres: true, apellidos: true } } } }),
    prisma.planTrabajoSst.findUnique({ where: { anio } }),
    prisma.normaMatrizLegal.findMany({ where: { activo: true }, orderBy: { norma: 'asc' } }),
    prisma.indicadorSst.findMany({ orderBy: [{ anio: 'desc' }, { mes: 'desc' }], take: 12 }),
    prisma.novedadArl.findMany({ where: fColab, include: { colaborador: { select: { nombres: true, apellidos: true } } }, orderBy: { fecha: 'desc' }, take: 60 }),
  ])

  const verSalud = tienePermiso(usuario, 'colaboradores_salud', 'VER')

  const docsAccidentes = accidentes.length
    ? await prisma.documento.findMany({
        where: { entidadTipo: 'AccidenteTrabajo', entidadId: { in: accidentes.map((a) => a.id) } },
        orderBy: { creadoEn: 'desc' },
        select: { id: true, entidadId: true, nombre: true },
      })
    : []

  const cargoNombre = new Map(cargos.map((c) => [c.id, c.nombre]))
  const sedeNombre = new Map(sedes.map((s) => [s.id, s.nombre]))

  // Índices de accidentalidad/ausentismo (Res. 0312/2019, sin umbral legal único: se usa
  // K=240.000 horas-hombre, referencia habitual del sector, y bandas de semáforo internas.
  const K = 240_000
  const indicadoresCalculados = indicadoresSst.map((i) => {
    const horasHombre = Number(i.horasHombre)
    const frecuencia = horasHombre > 0 ? (i.numAccidentes / horasHombre) * K : 0
    const severidad = horasHombre > 0 ? (i.diasPerdidos / horasHombre) * K : 0
    const ausentismo = i.numTrabajadores > 0 ? (i.diasAusentismo / (i.numTrabajadores * 30)) * 100 : 0
    const tono: 'emerald' | 'amber' | 'destructive' =
      frecuencia > 20 || severidad > 200 || ausentismo > 5 ? 'destructive'
        : frecuencia > 0 || severidad > 0 || ausentismo > 2 ? 'amber'
          : 'emerald'
    return {
      anio: i.anio, mes: i.mes, numTrabajadores: i.numTrabajadores, horasHombre, diasAusentismo: i.diasAusentismo,
      numAccidentes: i.numAccidentes, diasPerdidos: i.diasPerdidos,
      frecuencia: Math.round(frecuencia * 10) / 10, severidad: Math.round(severidad * 10) / 10, ausentismo: Math.round(ausentismo * 10) / 10, tono,
    }
  })

  // Estado de los comités (art. 2.2.4.6.31/34 D.1072): vigente / por vencer / vencido / sin conformar.
  const comiteEstado = comites.length === 0
    ? { label: 'Sin conformar', tono: 'destructive' as const }
    : comites.some((c) => c.vigenciaHasta < hoy)
      ? { label: 'Vencido', tono: 'destructive' as const }
      : comites.some((c) => c.vigenciaHasta <= en30)
        ? { label: 'Por vencer', tono: 'amber' as const }
        : { label: 'Vigente', tono: 'emerald' as const }

  // Semáforo de cumplimiento documental del SG-SST (D.1072 art. 2.2.4.6.8)
  type EstadoSem = 'ok' | 'warn' | 'bad'
  const normasCumple = normas.filter((n) => n.cumplimiento === 'CUMPLE').length
  const semaforo: { label: string; estado: EstadoSem; detalle: string; tab: string }[] = [
    {
      label: 'Política del SG-SST firmada', tab: 'estructura',
      estado: politicaSgsst?.firmadaEn ? 'ok' : politicaSgsst ? 'warn' : 'bad',
      detalle: politicaSgsst
        ? politicaSgsst.firmadaEn ? `"${politicaSgsst.titulo}" · firmada el ${formatFechaISO(politicaSgsst.firmadaEn)}` : `"${politicaSgsst.titulo}" sin fecha de firma`
        : 'No se ha vinculado la política (se sube en Jurídica, categoría Política).',
    },
    {
      label: 'Responsable del SG-SST designado', tab: 'estructura',
      estado: responsableSgsst ? (responsableSgsst.cartaDocId ? 'ok' : 'warn') : 'bad',
      detalle: responsableSgsst
        ? `${responsableSgsst.colaborador.nombres} ${responsableSgsst.colaborador.apellidos} · desde ${formatFechaISO(responsableSgsst.fechaDesignacion)}${responsableSgsst.cartaDocId ? '' : ' · falta la carta de designación'}`
        : 'Nadie ha sido designado formalmente.',
    },
    {
      label: `Plan de trabajo anual ${anio}`, tab: 'estructura',
      estado: planTrabajo ? (planTrabajo.documentoId ? 'ok' : 'warn') : 'bad',
      detalle: planTrabajo
        ? `Avance ${planTrabajo.avancePct}%${planTrabajo.documentoId ? '' : ' · falta adjuntar el PDF del plan'}`
        : 'No se ha registrado el plan de este año.',
    },
    {
      label: 'Autoevaluación y plan de mejora', tab: 'autoeval',
      estado: !autoeval ? 'bad'
        : autoeval.anio < anio - 1 ? 'warn'
        : autoeval.acciones.some((a) => !a.cumplida && a.fechaLimite < hoy) ? 'warn'
        : 'ok',
      detalle: !autoeval ? 'Sin autoevaluación registrada.'
        : `Última: ${autoeval.anio} (${Number(autoeval.puntaje)}%)` + (autoeval.acciones.length
          ? ` · plan de mejora: ${autoeval.acciones.filter((a) => a.cumplida).length}/${autoeval.acciones.length} acciones cumplidas${autoeval.acciones.some((a) => !a.cumplida && a.fechaLimite < hoy) ? ' (hay vencidas)' : ''}`
          : ' · sin acciones de mejora registradas'),
    },
    {
      label: 'Matriz legal (normograma)', tab: 'matriz',
      estado: normas.length === 0 ? 'bad' : normasCumple === normas.length ? 'ok' : normasCumple > 0 ? 'warn' : 'bad',
      detalle: normas.length === 0 ? 'Sin normas registradas.' : `${normasCumple} de ${normas.length} normas en estado "Cumple".`,
    },
    {
      label: 'Comités (COPASST / Convivencia)', tab: 'comites',
      estado: comiteEstado.tono === 'emerald' ? 'ok' : comiteEstado.tono === 'amber' ? 'warn' : 'bad',
      detalle: comiteEstado.label,
    },
  ]

  return (
    <div className="max-w-7xl">
      <SstCliente
        tab={tab}
        puedeCrear={puedeCrear}
        puedeEditar={puedeEditar}
        verSalud={verSalud}
        headcount={headcount}
        comites={comites.map((c) => ({
          id: c.id, tipo: c.tipo, vigenciaHasta: formatFechaISO(c.vigenciaHasta),
          miembros: c.miembros.map((m) => ({ id: m.id, colaborador: `${m.colaborador.nombres} ${m.colaborador.apellidos}`, rol: m.rol, porEmpleador: m.porEmpleador })),
          reuniones: c.reuniones.map((r) => ({ id: r.id, fecha: formatFechaISO(r.fecha), temas: r.temas, compromisos: r.compromisos, actaDocId: r.actaDocId })),
        }))}
        examenes={examenes.map((e) => ({
          id: e.id, colaboradorId: e.colaboradorId, colaborador: `${e.colaborador.nombres} ${e.colaborador.apellidos}`,
          tipo: e.tipo, fecha: formatFechaISO(e.fecha), concepto: e.concepto,
          vencimiento: e.fechaVencimiento ? formatFechaISO(e.fechaVencimiento) : null,
          vencido: !!e.fechaVencimiento && e.fechaVencimiento < hoy,
          tieneRestricciones: !!e.restricciones,
          documentoId: e.documentoId,
          // Datos clínicos: solo viajan al cliente si el usuario tiene permiso de salud
          recomendaciones: verSalud ? e.recomendaciones : null,
          restricciones: verSalud ? e.restricciones : null,
          seguimientoCerrado: e.seguimientoCerrado,
          seguimientos: verSalud ? e.seguimientos.map((s) => ({ id: s.id, fecha: formatFechaISO(s.fecha), nota: s.nota })) : [],
        }))}
        accidentes={accidentes.map((a) => ({
          id: a.id, colaborador: `${a.colaborador.nombres} ${a.colaborador.apellidos}`, fecha: formatFechaISO(a.fecha),
          descripcion: a.descripcion, parteCuerpo: a.parteCuerpo, diasIncapacidad: a.diasIncapacidad,
          estado: a.estado, furat: a.furatReportado, investigacion: a.investigacion, esIncidente: a.esIncidente,
          documentos: docsAccidentes.filter((d) => d.entidadId === a.id).map((d) => ({ id: d.id, nombre: d.nombre })),
        }))}
        epps={epps.map((e) => ({ id: e.id, nombre: e.nombre }))}
        entregasEpp={entregasEpp.map((e) => ({ id: e.id, colaborador: `${e.colaborador.nombres} ${e.colaborador.apellidos}`, elemento: e.elementoEpp.nombre, cantidad: e.cantidad, fecha: formatFechaISO(e.fechaEntrega), firmado: Boolean(e.firmadoEn), soporteDocId: e.soporteDocId }))}
        peligros={peligros.map((p) => ({
          id: p.id, proceso: p.proceso, peligro: p.peligro, riesgo: p.riesgo, nivel: p.nivel, controles: p.controles,
          rutinaria: p.rutinaria, controlFuente: p.controlFuente, controlMedio: p.controlMedio, controlIndividuo: p.controlIndividuo,
          responsable: p.responsable, fechaRevision: p.fechaRevision ? formatFechaISO(p.fechaRevision) : null,
          sede: p.sedeId ? (sedeNombre.get(p.sedeId) ?? null) : null,
        }))}
        autoeval={autoeval ? {
          id: autoeval.id, anio: autoeval.anio, puntaje: Number(autoeval.puntaje), nivelEstandar: autoeval.nivelEstandar,
          planMejora: autoeval.planMejora, documentoId: autoeval.documentoId,
          acciones: autoeval.acciones.map((a) => ({
            id: a.id, actividad: a.actividad, responsable: a.responsable, fechaLimite: formatFechaISO(a.fechaLimite),
            vencida: !a.cumplida && a.fechaLimite < hoy, recursos: a.recursos, cumplida: a.cumplida,
            cumplidaEn: a.cumplidaEn ? formatFechaISO(a.cumplidaEn) : null, evidenciaDocId: a.evidenciaDocId,
          })),
        } : null}
        sedes={sedes}
        cargos={cargos}
        profesiogramas={profesiogramas.map((p) => ({
          id: p.id, cargoId: p.cargoId, cargo: cargoNombre.get(p.cargoId) ?? '—', riesgosExpuestos: p.riesgosExpuestos,
          examenesRequeridos: p.examenesRequeridos, aptitudesRequeridas: p.aptitudesRequeridas, restricciones: p.restricciones,
        }))}
        planesEmergencia={planesEmergencia.map((p) => ({
          id: p.id, version: p.version, vigenciaDesde: formatFechaISO(p.vigenciaDesde), vigenciaHasta: formatFechaISO(p.vigenciaHasta),
          vencido: p.vigenciaHasta < hoy, documentoId: p.documentoId, sede: p.sedeId ? (sedeNombre.get(p.sedeId) ?? null) : null,
        }))}
        brigadistas={brigadistas.map((b) => ({
          id: b.id, colaborador: `${b.colaborador.nombres} ${b.colaborador.apellidos}`, rol: b.rol,
          sede: b.sedeId ? (sedeNombre.get(b.sedeId) ?? null) : null,
        }))}
        simulacros={simulacros.map((s) => ({
          id: s.id, fecha: formatFechaISO(s.fecha), tipo: s.tipo, participantes: s.participantes, observaciones: s.observaciones,
          documentoId: s.documentoId, sede: s.sedeId ? (sedeNombre.get(s.sedeId) ?? null) : null,
        }))}
        inspecciones={inspecciones.map((i) => ({
          id: i.id, fecha: formatFechaISO(i.fecha), tipo: i.tipo, area: i.area, hallazgos: i.hallazgos, responsable: i.responsable,
          estado: i.estado, fechaCierre: i.fechaCierre ? formatFechaISO(i.fechaCierre) : null, documentoId: i.documentoId,
          sede: i.sedeId ? (sedeNombre.get(i.sedeId) ?? null) : null,
        }))}
        semaforo={semaforo}
        novedadesArl={novedadesArl.map((n) => ({
          id: n.id, colaborador: `${n.colaborador.nombres} ${n.colaborador.apellidos}`, tipo: n.tipo,
          fecha: formatFechaISO(n.fecha), detalle: n.detalle, claseRiesgo: n.claseRiesgo, soporteDocId: n.soporteDocId,
        }))}
        estructura={{
          politica: politicaSgsst ? { id: politicaSgsst.id, titulo: politicaSgsst.titulo, firmadaEn: politicaSgsst.firmadaEn ? formatFechaISO(politicaSgsst.firmadaEn) : null } : null,
          politicasDisponibles,
          responsable: responsableSgsst ? {
            id: responsableSgsst.id, colaborador: `${responsableSgsst.colaborador.nombres} ${responsableSgsst.colaborador.apellidos}`,
            fechaDesignacion: formatFechaISO(responsableSgsst.fechaDesignacion), licenciaSst: responsableSgsst.licenciaSst,
            cursoHoras: responsableSgsst.cursoHoras, cartaDocId: responsableSgsst.cartaDocId,
          } : null,
          plan: planTrabajo ? { id: planTrabajo.id, anio: planTrabajo.anio, documentoId: planTrabajo.documentoId, aprobadoPor: planTrabajo.aprobadoPor, avancePct: planTrabajo.avancePct, notas: planTrabajo.notas } : null,
          anioActual: anio,
        }}
        normas={normas.map((n) => ({
          id: n.id, norma: n.norma, emisor: n.emisor, tema: n.tema, articulos: n.articulos,
          comoCumple: n.comoCumple, cumplimiento: n.cumplimiento, evidenciaDocId: n.evidenciaDocId, responsableRol: n.responsableRol,
        }))}
        indicadores={indicadoresCalculados}
      />
    </div>
  )
}

