'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { accion, ErrorNegocio } from '@/server/accion'
import { parseFechaISO, hoyBogota } from '@/lib/fechas'
import { publicarVencimiento } from '@/server/vencimientos/servicio'
import { avisar, avisarPorRol, usuarioDeColaborador } from '@/server/notificaciones/avisar'
import { sumarDiasHabiles, festivosDeRango } from '@/lib/dias-habiles'

const v = (s: string | undefined | null) => (s && s !== '' ? s : null)

/** Plazo de 5 días HÁBILES desde mañana (excluye domingos y festivos nacionales). */
function limite5DiasHabiles(): Date {
  const hoy = hoyBogota()
  const anio = hoy.getUTCFullYear()
  const festivos = festivosDeRango(anio, anio + 1)
  return sumarDiasHabiles(hoy, 5, festivos)
}

const DOC_ORIGEN: Record<string, 'POLIZA' | 'ARRIENDO' | 'CONVENIO_FINANCIERA' | 'MARCA' | 'DOMINIO_WEB' | 'LICENCIA_SOFTWARE'> = {
  POLIZA: 'POLIZA', ARRIENDO: 'ARRIENDO', CONVENIO_FINANCIERA: 'CONVENIO_FINANCIERA',
  MARCA: 'MARCA', DOMINIO_WEB: 'DOMINIO_WEB', LICENCIA_SOFTWARE: 'LICENCIA_SOFTWARE',
}

export const crearDocumentoLegal = accion(
  {
    modulo: 'juridica',
    accion: 'CREAR',
    schema: z.object({
      categoria: z.enum(['REGLAMENTO_INTERNO', 'POLITICA', 'CONVENIO_FINANCIERA', 'POLIZA', 'ARRIENDO', 'MARCA', 'DOMINIO_WEB', 'LICENCIA_SOFTWARE', 'ACUERDO_TRANSMISION_DATOS', 'PERMISO_ESTABLECIMIENTO', 'OTRO']),
      titulo: z.string().trim().min(2).max(200),
      descripcion: z.string().max(1000).optional(),
      vigenciaFin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
    }),
  },
  async (d) => {
    const doc = await dbAuditado.documentoLegal.create({
      data: { categoria: d.categoria, titulo: d.titulo, descripcion: v(d.descripcion), vigenciaFin: parseFechaISO(d.vigenciaFin || null) },
    })
    // Si tiene vigencia y es de los tipos con vencimiento, publica un Vencimiento
    if (doc.vigenciaFin && DOC_ORIGEN[d.categoria]) {
      await publicarVencimiento({
        origen: DOC_ORIGEN[d.categoria],
        entidadTipo: 'DocumentoLegal',
        entidadId: doc.id,
        titulo: `Vence: ${doc.titulo}`,
        fechaVencimientoISO: d.vigenciaFin as string,
        responsables: [{ rol: 'Jurídica' }],
      })
    }
    revalidatePath('/juridica')
    return { id: doc.id }
  },
)

/**
 * Enlaza un archivo (Documento ya subido) como una nueva versión del documento legal:
 * incrementa el número de versión, marca las anteriores como no vigentes y actualiza
 * el archivo "actual" del documento legal. Reutiliza el almacenamiento existente.
 */
export const vincularVersionDocumentoLegal = accion(
  {
    modulo: 'juridica',
    accion: 'CREAR',
    schema: z.object({
      documentoLegalId: z.uuid(),
      documentoId: z.uuid(),
      cambios: z.string().max(500).optional(),
    }),
  },
  async (d) => {
    const legal = await prisma.documentoLegal.findUniqueOrThrow({
      where: { id: d.documentoLegalId },
      include: { versiones: true },
    })
    const version = legal.versiones.length + 1
    await prisma.versionDocumentoLegal.updateMany({
      where: { documentoLegalId: d.documentoLegalId },
      data: { vigente: false },
    })
    await dbAuditado.versionDocumentoLegal.create({
      data: {
        documentoLegalId: d.documentoLegalId,
        version,
        vigente: true,
        archivoDocId: d.documentoId,
        cambios: v(d.cambios),
      },
    })
    await dbAuditado.documentoLegal.update({
      where: { id: d.documentoLegalId },
      data: { documentoId: d.documentoId },
    })
    revalidatePath('/juridica')
    return { version }
  },
)

export const crearProcesoDisciplinario = accion(
  {
    modulo: 'juridica',
    accion: 'CREAR',
    schema: z.object({ colaboradorId: z.uuid(), asunto: z.string().trim().min(3).max(200), descripcion: z.string().max(1000).optional(), fechaApertura: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  },
  async (d) => {
    const colab = await prisma.colaborador.findUniqueOrThrow({ where: { id: d.colaboradorId }, select: { nombres: true } })
    const p = await dbAuditado.procesoDisciplinario.create({
      data: { colaboradorId: d.colaboradorId, asunto: d.asunto, descripcion: v(d.descripcion), fechaApertura: parseFechaISO(d.fechaApertura)!, etapa: 'CITACION_DESCARGOS', fechaLimite: limite5DiasHabiles() },
    })
    // Etapa de apertura/citación: los soportes de prueba iniciales se anclan a esta etapa.
    const etapaCitacion = await dbAuditado.etapaProceso.create({
      data: { procesoId: p.id, etapa: 'CITACION_DESCARGOS', fecha: parseFechaISO(d.fechaApertura)!, detalle: 'Apertura del proceso y citación a descargos' },
    })
    // Citación a descargos: avisar al colaborador (app + correo) para que entre y presente descargos
    const userId = await usuarioDeColaborador(d.colaboradorId)
    if (userId) {
      await avisar(userId, {
        evento: 'disciplinario_citacion',
        titulo: 'Citación a descargos — proceso disciplinario',
        mensaje: `${colab.nombres}, se abrió un proceso disciplinario por: "${d.asunto}". Tienes derecho a presentar tus descargos dentro de los 5 días hábiles siguientes. Ingresa a Autoservicio para hacerlo.`,
        enlace: '/autoservicio/disciplinarios',
        llamadoAccion: 'Presentar mis descargos',
      })
    }
    revalidatePath('/juridica')
    return { id: p.id, etapaId: etapaCitacion.id }
  },
)

/** El colaborador (empleado) presenta sus propios descargos en el proceso disciplinario. */
export const presentarDescargos = accion(
  { modulo: 'autoservicio', accion: 'CREAR', schema: z.object({ procesoId: z.uuid(), texto: z.string().trim().min(5).max(4000) }) },
  async (d, usuario) => {
    const proceso = await prisma.procesoDisciplinario.findUniqueOrThrow({ where: { id: d.procesoId }, include: { colaborador: { select: { usuarioId: true, nombres: true, apellidos: true } } } })
    if (proceso.colaborador.usuarioId !== usuario.id) throw new ErrorNegocio('Solo el colaborador citado puede presentar sus descargos.')
    if (proceso.cerrado) throw new ErrorNegocio('El proceso ya está cerrado.')

    const etapaDescargos = await dbAuditado.etapaProceso.create({
      data: { procesoId: d.procesoId, etapa: 'DESCARGOS', fecha: hoyBogota(), detalle: `Descargos del colaborador: ${d.texto}` },
    })
    await dbAuditado.procesoDisciplinario.update({ where: { id: d.procesoId }, data: { etapa: 'DESCARGOS', fechaLimite: null } })

    // Avisar a Jurídica/RRHH que el colaborador presentó descargos
    await avisarPorRol(['Jurídica', 'Recursos Humanos', 'Administrador'], {
      evento: 'disciplinario_descargos',
      titulo: 'Descargos presentados',
      mensaje: `${proceso.colaborador.nombres} ${proceso.colaborador.apellidos} presentó sus descargos en el proceso "${proceso.asunto}".`,
      enlace: `/juridica/disciplinarios/${d.procesoId}`,
      llamadoAccion: 'Revisar los descargos',
    })
    revalidatePath('/autoservicio/disciplinarios')
    revalidatePath(`/juridica/disciplinarios/${d.procesoId}`)
    return { ok: true, etapaId: etapaDescargos.id }
  },
)

export const avanzarEtapaDisciplinario = accion(
  {
    modulo: 'juridica',
    accion: 'EDITAR',
    schema: z.object({ procesoId: z.uuid(), etapa: z.enum(['CITACION_DESCARGOS', 'DESCARGOS', 'DECISION', 'RECURSO', 'CERRADO']), fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), detalle: z.string().max(1000).optional() }),
  },
  async (d) => {
    const proceso = await prisma.procesoDisciplinario.findUniqueOrThrow({ where: { id: d.procesoId }, include: { etapas: true, colaborador: { select: { usuarioId: true } } } })
    // Debido proceso: no se puede decidir sin descargos previos
    if (d.etapa === 'DECISION' && !proceso.etapas.some((e) => e.etapa === 'DESCARGOS')) {
      throw new ErrorNegocio('No se puede registrar la decisión sin que consten los descargos (debido proceso).')
    }
    await dbAuditado.etapaProceso.create({ data: { procesoId: d.procesoId, etapa: d.etapa, fecha: parseFechaISO(d.fecha)!, detalle: v(d.detalle) } })
    await dbAuditado.procesoDisciplinario.update({ where: { id: d.procesoId }, data: { etapa: d.etapa, cerrado: d.etapa === 'CERRADO' } })

    // Avisar al colaborador de la nueva actuación (decisión, recurso o cierre)
    const ETAPA_TXT: Record<string, string> = { CITACION_DESCARGOS: 'Citación a descargos', DESCARGOS: 'Descargos', DECISION: 'Decisión', RECURSO: 'Recurso', CERRADO: 'Cierre del proceso' }
    if (proceso.colaborador.usuarioId && d.etapa !== 'DESCARGOS') {
      await avisar(proceso.colaborador.usuarioId, {
        evento: 'disciplinario_avance',
        titulo: `Proceso disciplinario: ${ETAPA_TXT[d.etapa]}`,
        mensaje: `Hay una nueva actuación en el proceso "${proceso.asunto}": ${ETAPA_TXT[d.etapa]}.${d.detalle ? ` ${d.detalle}` : ''}`,
        enlace: '/autoservicio/disciplinarios',
        llamadoAccion: 'Ver el proceso',
      })
    }
    revalidatePath(`/juridica/disciplinarios/${d.procesoId}`)
  },
)

/** Fase 2: RRHH registra la decisión (requiere descargos previos). Abre plazo de apelación de 5 días hábiles. */
export const registrarDecisionDisciplinario = accion(
  { modulo: 'juridica', accion: 'EDITAR', schema: z.object({ procesoId: z.uuid(), decision: z.string().trim().min(5).max(2000) }) },
  async (d) => {
    const proceso = await prisma.procesoDisciplinario.findUniqueOrThrow({
      where: { id: d.procesoId },
      include: { etapas: true, colaborador: { select: { usuarioId: true } } },
    })
    if (proceso.cerrado) throw new ErrorNegocio('El proceso ya está cerrado.')
    if (!proceso.etapas.some((e) => e.etapa === 'DESCARGOS')) throw new ErrorNegocio('No se puede registrar la decisión sin que consten los descargos (debido proceso).')
    if (proceso.etapa === 'DECISION' || proceso.etapa === 'RECURSO') throw new ErrorNegocio('La decisión ya fue registrada.')
    const etapaDecision = await dbAuditado.etapaProceso.create({ data: { procesoId: d.procesoId, etapa: 'DECISION', fecha: hoyBogota(), detalle: d.decision } })
    await dbAuditado.procesoDisciplinario.update({ where: { id: d.procesoId }, data: { etapa: 'DECISION', decision: d.decision, fechaLimite: limite5DiasHabiles() } })
    if (proceso.colaborador.usuarioId) {
      await avisar(proceso.colaborador.usuarioId, {
        evento: 'disciplinario_decision',
        titulo: 'Decisión del proceso disciplinario',
        mensaje: 'Se tomó una decisión en tu proceso. Si no estás de acuerdo, puedes apelar dentro de los 5 días hábiles siguientes desde tu autoservicio.',
        enlace: '/autoservicio/disciplinarios',
        llamadoAccion: 'Ver la decisión / apelar',
      })
    }
    revalidatePath(`/juridica/disciplinarios/${d.procesoId}`)
    return { etapaId: etapaDecision.id }
  },
)

/** Fase 2: el colaborador apela la decisión (requiere etapa DECISION). */
export const apelarDecisionDisciplinario = accion(
  { modulo: 'autoservicio', accion: 'CREAR', schema: z.object({ procesoId: z.uuid(), texto: z.string().trim().min(5).max(4000) }) },
  async (d, usuario) => {
    const proceso = await prisma.procesoDisciplinario.findUniqueOrThrow({
      where: { id: d.procesoId },
      include: { colaborador: { select: { usuarioId: true, nombres: true, apellidos: true } } },
    })
    if (proceso.colaborador.usuarioId !== usuario.id) throw new ErrorNegocio('Solo el colaborador citado puede apelar.')
    if (proceso.cerrado) throw new ErrorNegocio('El proceso ya está cerrado.')
    if (proceso.etapa !== 'DECISION') throw new ErrorNegocio('Solo puedes apelar una vez que se registra la decisión.')
    const etapaRecurso = await dbAuditado.etapaProceso.create({ data: { procesoId: d.procesoId, etapa: 'RECURSO', fecha: hoyBogota(), detalle: `Recurso de apelación del colaborador: ${d.texto}` } })
    await dbAuditado.procesoDisciplinario.update({ where: { id: d.procesoId }, data: { etapa: 'RECURSO', fechaLimite: null } })
    await avisarPorRol(['Jurídica', 'Recursos Humanos', 'Administrador'], {
      evento: 'disciplinario_apelacion',
      titulo: 'Recurso de apelación presentado',
      mensaje: `${proceso.colaborador.nombres} ${proceso.colaborador.apellidos} apeló la decisión del proceso "${proceso.asunto}".`,
      enlace: `/juridica/disciplinarios/${d.procesoId}`,
      llamadoAccion: 'Resolver el recurso',
    })
    revalidatePath('/autoservicio/disciplinarios')
    revalidatePath(`/juridica/disciplinarios/${d.procesoId}`)
    return { ok: true, etapaId: etapaRecurso.id }
  },
)

/** Cierra el proceso (desde DECISION o RECURSO). Registra la resolución final opcional. */
export const cerrarDisciplinario = accion(
  { modulo: 'juridica', accion: 'EDITAR', schema: z.object({ procesoId: z.uuid(), detalle: z.string().max(2000).optional() }) },
  async (d) => {
    const proceso = await prisma.procesoDisciplinario.findUniqueOrThrow({ where: { id: d.procesoId }, include: { colaborador: { select: { usuarioId: true } } } })
    if (proceso.cerrado) throw new ErrorNegocio('El proceso ya está cerrado.')
    if (proceso.etapa !== 'DECISION' && proceso.etapa !== 'RECURSO') throw new ErrorNegocio('Solo se puede cerrar después de registrar la decisión.')
    await dbAuditado.etapaProceso.create({ data: { procesoId: d.procesoId, etapa: 'CERRADO', fecha: hoyBogota(), detalle: v(d.detalle) } })
    await dbAuditado.procesoDisciplinario.update({ where: { id: d.procesoId }, data: { etapa: 'CERRADO', cerrado: true, fechaLimite: null } })
    if (proceso.colaborador.usuarioId) {
      await avisar(proceso.colaborador.usuarioId, { evento: 'disciplinario_cerrado', titulo: 'Proceso disciplinario cerrado', mensaje: `Tu proceso disciplinario fue cerrado.${d.detalle ? ` ${d.detalle}` : ''}`, enlace: '/autoservicio/disciplinarios', llamadoAccion: 'Ver el proceso' })
    }
    revalidatePath(`/juridica/disciplinarios/${d.procesoId}`)
  },
)

/** Enlaza el acta/acuerdo final (Documento ya subido) al proceso disciplinario. */
export const vincularActaDisciplinario = accion(
  { modulo: 'juridica', accion: 'EDITAR', schema: z.object({ procesoId: z.uuid(), documentoId: z.uuid() }) },
  async (d) => {
    await dbAuditado.procesoDisciplinario.update({ where: { id: d.procesoId }, data: { documentoActaId: d.documentoId } })
    revalidatePath(`/juridica/disciplinarios/${d.procesoId}`)
  },
)

// La creación de denuncias anti-acoso se hace desde el autoservicio del colaborador
// (confidencial, sin auditar el autor): ver `autoservicio/juridica-acciones.ts`.
// Aquí solo se gestionan (investigar/resolver/archivar).

/** Anti-acoso — paso 1: iniciar investigación (RECIBIDA → EN_INVESTIGACION). */
export const iniciarInvestigacionDenuncia = accion(
  { modulo: 'juridica', accion: 'EDITAR', schema: z.object({ id: z.uuid() }) },
  async (d) => {
    const den = await prisma.denunciaAcoso.findUniqueOrThrow({ where: { id: d.id }, select: { estado: true } })
    if (den.estado !== 'RECIBIDA') throw new ErrorNegocio('Solo se puede iniciar la investigación de una denuncia recién recibida.')
    await dbAuditado.denunciaAcoso.update({ where: { id: d.id }, data: { estado: 'EN_INVESTIGACION' } })
    revalidatePath(`/juridica/denuncias/${d.id}`)
    revalidatePath('/juridica')
  },
)

/** Anti-acoso — paso final: resolver (EN_INVESTIGACION → RESUELTA). Requiere conclusión. */
export const resolverDenuncia = accion(
  { modulo: 'juridica', accion: 'EDITAR', schema: z.object({ id: z.uuid(), resolucion: z.string().trim().min(5).max(2000) }) },
  async (d) => {
    const den = await prisma.denunciaAcoso.findUniqueOrThrow({ where: { id: d.id }, select: { estado: true } })
    if (den.estado !== 'EN_INVESTIGACION') throw new ErrorNegocio('Solo se puede resolver una denuncia que esté en investigación.')
    await dbAuditado.denunciaAcoso.update({ where: { id: d.id }, data: { estado: 'RESUELTA', resolucion: d.resolucion } })
    revalidatePath(`/juridica/denuncias/${d.id}`)
    revalidatePath('/juridica')
  },
)

/** Anti-acoso — archivar (desde RECIBIDA o EN_INVESTIGACION). Requiere motivo. */
export const archivarDenuncia = accion(
  { modulo: 'juridica', accion: 'EDITAR', schema: z.object({ id: z.uuid(), motivo: z.string().trim().min(5).max(2000) }) },
  async (d) => {
    const den = await prisma.denunciaAcoso.findUniqueOrThrow({ where: { id: d.id }, select: { estado: true } })
    if (den.estado === 'RESUELTA' || den.estado === 'ARCHIVADA') throw new ErrorNegocio('La denuncia ya está cerrada.')
    await dbAuditado.denunciaAcoso.update({ where: { id: d.id }, data: { estado: 'ARCHIVADA', resolucion: d.motivo } })
    revalidatePath(`/juridica/denuncias/${d.id}`)
    revalidatePath('/juridica')
  },
)

/** Enlaza el acuerdo/resolución final (Documento ya subido) a la denuncia. */
export const vincularResolucionDenuncia = accion(
  { modulo: 'juridica', accion: 'EDITAR', schema: z.object({ id: z.uuid(), documentoId: z.uuid() }) },
  async (d) => {
    await dbAuditado.denunciaAcoso.update({ where: { id: d.id }, data: { documentoResolucionId: d.documentoId } })
    revalidatePath(`/juridica/denuncias/${d.id}`)
  },
)

export const registrarAutorizacionDatos = accion(
  { modulo: 'juridica', accion: 'CREAR', schema: z.object({ colaboradorId: z.uuid(), finalidad: z.string().trim().min(3).max(500), fechaAutorizacion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }) },
  async (d) => {
    const creada = await dbAuditado.autorizacionDatos.create({ data: { colaboradorId: d.colaboradorId, finalidad: d.finalidad, fechaAutorizacion: parseFechaISO(d.fechaAutorizacion)! } })
    revalidatePath('/juridica')
    return { id: creada.id }
  },
)

export const crearConsultaReclamo = accion(
  {
    modulo: 'juridica',
    accion: 'CREAR',
    schema: z.object({ tipo: z.enum(['CONSULTA', 'RECLAMO']), titular: z.string().trim().min(2).max(150), descripcion: z.string().trim().min(5).max(1000), fechaRadicacion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  },
  async (d) => {
    // Plazo legal en días HÁBILES (Ley 1581): consulta 10, reclamo 15.
    const fechaRad = parseFechaISO(d.fechaRadicacion)!
    const anio = fechaRad.getUTCFullYear()
    const festivos = festivosDeRango(anio, anio + 1)
    const fechaLimite = sumarDiasHabiles(fechaRad, d.tipo === 'CONSULTA' ? 10 : 15, festivos)
    await dbAuditado.consultaReclamoDatos.create({
      data: { tipo: d.tipo, titular: d.titular, descripcion: d.descripcion, fechaRadicacion: fechaRad, fechaLimite, estado: 'ABIERTO' },
    })
    revalidatePath('/juridica')
  },
)

/**
 * Registra un llamado de atención: medida correctiva, no una sanción.
 *
 * No abre descargos ni plazos —eso es lo que lo distingue del proceso
 * disciplinario (art. 115 CST, que exige oír al trabajador antes de sancionar)—.
 * Su valor está en quedar como antecedente: tres llamados por lo mismo son lo
 * que después sustenta que la falta fue reiterada. Por eso solo se notifica al
 * colaborador; no se le pide firma.
 */
export const crearLlamadoAtencion = accion(
  {
    modulo: 'juridica',
    accion: 'CREAR',
    schema: z.object({
      colaboradorId: z.uuid(),
      tipo: z.enum(['VERBAL', 'ESCRITO']),
      motivo: z.string().trim().min(3).max(200),
      detalle: z.string().max(2000).optional(),
      fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    }),
  },
  async (d, usuario) => {
    const colab = await prisma.colaborador.findUniqueOrThrow({
      where: { id: d.colaboradorId },
      select: { nombres: true, tipoVinculo: true },
    })
    // El poder disciplinario es el indicio más fuerte de subordinación: dejarlo
    // registrado contra un contratista es prueba en contra en un pleito por
    // contrato realidad. El botón ya lo bloquea, pero la regla vive aquí.
    if (colab.tipoVinculo === 'OPS') {
      throw new ErrorNegocio('En prestación de servicios no se registran llamados de atención: los incumplimientos se manejan por las cláusulas del contrato.')
    }
    const ll = await dbAuditado.llamadoAtencion.create({
      data: {
        colaboradorId: d.colaboradorId,
        tipo: d.tipo,
        motivo: d.motivo,
        detalle: v(d.detalle),
        fecha: parseFechaISO(d.fecha)!,
        creadoPorId: usuario.id,
      },
    })
    const userId = await usuarioDeColaborador(d.colaboradorId)
    if (userId) {
      await avisar(userId, {
        evento: 'llamado_atencion',
        titulo: `Llamado de atención ${d.tipo === 'VERBAL' ? 'verbal' : 'escrito'}`,
        mensaje: `${colab.nombres}, se registró un llamado de atención por: "${d.motivo}". No es una sanción y no requiere que presentes descargos, pero queda en tu historial.`,
        enlace: '/autoservicio/disciplinarios',
        llamadoAccion: 'Ver mi historial',
      })
    }
    revalidatePath(`/colaboradores/${d.colaboradorId}`)
    revalidatePath('/juridica')
    return { id: ll.id }
  },
)

/**
 * Borra un llamado de atención registrado por equivocación.
 *
 * Se permite porque un llamado no tiene etapas ni actos del colaborador de por
 * medio: no hay nada que se pierda al borrarlo, salvo el antecedente mismo. La
 * auditoría conserva el rastro de quién lo quitó.
 */
export const eliminarLlamadoAtencion = accion(
  { modulo: 'juridica', accion: 'ELIMINAR', schema: z.object({ id: z.uuid() }) },
  async (d) => {
    const ll = await prisma.llamadoAtencion.findUniqueOrThrow({ where: { id: d.id }, select: { colaboradorId: true } })
    await dbAuditado.llamadoAtencion.delete({ where: { id: d.id } })
    revalidatePath(`/colaboradores/${ll.colaboradorId}`)
    revalidatePath('/juridica')
  },
)
