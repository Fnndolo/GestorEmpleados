import 'server-only'
import { createHash } from 'node:crypto'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { subirArchivo } from '@/server/storage'
import { ErrorNegocio } from '@/server/accion'
import { eliminarDocumento } from '@/server/documentos'
import type { ModuloClave, Accion } from '@/lib/permisos/modulos'

/**
 * Adjuntar un PDF propio donde el sistema normalmente GENERA uno.
 *
 * La plataforma arma sus documentos desde plantilla, pero un contrato puede
 * necesitar una cláusula que la plantilla no contempla, o el documento puede
 * venir ya firmado en físico. Programar cada excepción tomaría días; subir el
 * PDF toma un minuto. Por eso, en todo lugar donde se genera un documento hay
 * también la opción de aportarlo.
 *
 * Un solo registro describe cada destino —qué tabla, qué campo, qué permiso—
 * para no repetir nueve veces la misma acción con distinto nombre.
 */

export type DestinoDocumento =
  | 'certificacion'
  | 'desprendible'
  | 'cuentaCobro'
  | 'actaEntregaActivo'
  | 'actaDevolucionActivo'
  | 'recibidoDotacion'
  | 'soporteEpp'
  | 'prorroga'
  | 'otrosi'

type Definicion = {
  /** Nombre legible, para el documento y los mensajes. */
  etiqueta: string
  /** Módulo y acción que se exigen para adjuntar. */
  modulo: ModuloClave
  accion: Accion
  /** Nombre del delegado de Prisma y campo que apunta al Documento. */
  modelo: string
  campo: string
  /** `entidadTipo` con que se archiva el Documento. */
  entidadTipo: string
  /**
   * De quién es el documento. `colaborador` lo archiva en el expediente de la
   * persona —es donde lo buscan— y `propia` lo deja colgado de la entidad.
   */
  archivarEn: 'colaborador' | 'propia'
  /**
   * El DUEÑO del registro puede adjuntar aunque no tenga el permiso del módulo.
   * Solo aplica donde el documento lo emite él —su cuenta de cobro—, no donde lo
   * emite la empresa: un colaborador no reemplaza el acta que le entregó RRHH.
   */
  duenoPuede?: boolean
  /** Estados en los que ya NO se puede tocar (el trámite está resuelto). */
  estadosCerrados?: string[]
}

const DESTINOS: Record<DestinoDocumento, Definicion> = {
  certificacion: {
    etiqueta: 'Certificación laboral', modulo: 'colaboradores', accion: 'CREAR',
    modelo: 'certificacionLaboral', campo: 'documentoId', entidadTipo: 'Colaborador', archivarEn: 'colaborador',
  },
  desprendible: {
    etiqueta: 'Desprendible de pago', modulo: 'nomina', accion: 'EDITAR',
    modelo: 'liquidacionNomina', campo: 'documentoId', entidadTipo: 'Colaborador', archivarEn: 'colaborador',
  },
  cuentaCobro: {
    etiqueta: 'Cuenta de cobro', modulo: 'contratos', accion: 'EDITAR',
    modelo: 'cuentaCobroOps', campo: 'documentoId', entidadTipo: 'CuentaCobroOps', archivarEn: 'propia',
    // La radica el contratista: puede subir la suya mientras nadie la haya
    // aprobado, pagado o rechazado. Después ya es un documento cerrado.
    duenoPuede: true,
    estadosCerrados: ['APROBADA', 'PAGADA', 'RECHAZADA'],
  },
  actaEntregaActivo: {
    etiqueta: 'Acta de entrega de activo', modulo: 'activos', accion: 'EDITAR',
    modelo: 'asignacionActivo', campo: 'actaEntregaDocId', entidadTipo: 'Colaborador', archivarEn: 'colaborador',
  },
  actaDevolucionActivo: {
    etiqueta: 'Acta de devolución de activo', modulo: 'activos', accion: 'EDITAR',
    modelo: 'asignacionActivo', campo: 'actaDevolucionDocId', entidadTipo: 'Colaborador', archivarEn: 'colaborador',
  },
  recibidoDotacion: {
    etiqueta: 'Recibido de dotación', modulo: 'activos', accion: 'EDITAR',
    modelo: 'entregaDotacion', campo: 'recibidoDocId', entidadTipo: 'Colaborador', archivarEn: 'colaborador',
  },
  soporteEpp: {
    etiqueta: 'Recibido de EPP', modulo: 'sst', accion: 'EDITAR',
    modelo: 'entregaEpp', campo: 'soporteDocId', entidadTipo: 'Colaborador', archivarEn: 'colaborador',
  },
  prorroga: {
    etiqueta: 'Prórroga de contrato', modulo: 'contratos', accion: 'EDITAR',
    modelo: 'prorrogaContrato', campo: 'documentoId', entidadTipo: 'Contrato', archivarEn: 'propia',
  },
  otrosi: {
    etiqueta: 'Otrosí de contrato', modulo: 'contratos', accion: 'EDITAR',
    modelo: 'otrosiContrato', campo: 'documentoId', entidadTipo: 'Contrato', archivarEn: 'propia',
  },
}

export function definicionDestino(destino: DestinoDocumento): Definicion {
  return DESTINOS[destino]
}

/** Permiso que hace falta para adjuntar en cada destino (lo usa la Server Action). */
export function permisoDestino(destino: DestinoDocumento): { modulo: ModuloClave; accion: Accion } {
  const d = DESTINOS[destino]
  return { modulo: d.modulo, accion: d.accion }
}

/* eslint-disable @typescript-eslint/no-explicit-any -- el delegado de Prisma se
   elige por nombre en tiempo de ejecución; el registro de arriba garantiza que
   el par (modelo, campo) existe. */
type Delegado = { findUnique: (args: any) => Promise<any>; update: (args: any) => Promise<any> }
const delegado = (nombre: string): Delegado => (prisma as any)[nombre]
const delegadoAuditado = (nombre: string): Delegado => (dbAuditado as any)[nombre]
/* eslint-enable @typescript-eslint/no-explicit-any */

/**
 * Guarda el PDF aportado y lo deja como documento vigente de la entidad.
 *
 * Si ya había uno —generado antes, o una versión anterior de este mismo—, se
 * borra: el campo representa "el documento que vale", y dejar los dos en el
 * expediente solo genera dudas sobre cuál es el bueno.
 */
export async function adjuntarDocumento(opts: {
  destino: DestinoDocumento
  /** Id del registro (la liquidación, la asignación, la prórroga…). */
  id: string
  /** PDF como data URI base64. */
  pdfBase64: string
  usuarioId: string
  /** Nombre para el expediente; si falta, se usa la etiqueta del destino. */
  nombre?: string | null
}): Promise<{ documentoId: string }> {
  const def = DESTINOS[opts.destino]

  const base64 = opts.pdfBase64.split(',')[1] ?? ''
  const pdf = Buffer.from(base64, 'base64')
  if (pdf.byteLength === 0) throw new ErrorNegocio('El PDF adjunto está vacío.')

  const registro = await delegado(def.modelo).findUnique({ where: { id: opts.id } })
  if (!registro) throw new ErrorNegocio(`No se encontró el registro de ${def.etiqueta.toLowerCase()}.`)

  // Dónde se archiva: en el expediente de la persona o colgado de la entidad.
  const entidadId = def.archivarEn === 'colaborador'
    ? (registro.colaboradorId as string | undefined)
    : opts.id
  if (!entidadId) throw new ErrorNegocio('El registro no está asociado a un colaborador.')

  const sedeId = (registro.sedeId as string | undefined) ?? null
  const sha256 = createHash('sha256').update(pdf).digest('hex')
  const archivo = await subirArchivo(
    `${def.entidadTipo.toLowerCase()}/${entidadId}`,
    `${opts.destino}-${opts.id}.pdf`,
    pdf,
    'application/pdf',
  )
  const doc = await dbAuditado.documento.create({
    data: {
      entidadTipo: def.entidadTipo,
      entidadId,
      nombre: (opts.nombre && opts.nombre.trim()) || `${def.etiqueta} (adjuntado)`,
      bucket: archivo.bucket,
      storagePath: archivo.storagePath,
      mimeType: 'application/pdf',
      tamanoBytes: archivo.tamanoBytes,
      sha256,
      nivelAcceso: 'GENERAL',
      sedeId,
      subidoPorId: opts.usuarioId,
    },
  })

  const anterior = registro[def.campo] as string | null | undefined
  await delegadoAuditado(def.modelo).update({
    where: { id: opts.id },
    data: { [def.campo]: doc.id },
  })
  // El anterior se borra DESPUÉS de reapuntar el campo: si algo falla antes, se
  // queda el viejo, que es mejor que quedarse sin ninguno.
  if (anterior && anterior !== doc.id) await eliminarDocumento(anterior).catch(() => {})

  return { documentoId: doc.id }
}

/**
 * ¿Puede este colaborador adjuntar aquí por ser el dueño del registro?
 *
 * Es la excepción que permite al contratista subir SU cuenta de cobro sin
 * darle permiso sobre el módulo de contratos. Exige tres cosas: que el destino
 * la contemple, que el registro sea suyo y que el trámite siga abierto.
 */
export async function duenoPuedeAdjuntar(
  destino: DestinoDocumento,
  id: string,
  colaboradorId: string | null,
): Promise<'si' | 'no-es-suyo' | 'ya-cerrado'> {
  const def = DESTINOS[destino]
  if (!def.duenoPuede || !colaboradorId) return 'no-es-suyo'

  const registro = await delegado(def.modelo).findUnique({ where: { id } })
  if (!registro || registro.colaboradorId !== colaboradorId) return 'no-es-suyo'
  // Se distingue del caso anterior a propósito: que el trámite esté cerrado no
  // es un problema de permisos y merece un mensaje que explique qué pasó.
  if (def.estadosCerrados?.includes(registro.estado as string)) return 'ya-cerrado'
  return 'si'
}

/** Motivo por el que el dueño ya no puede adjuntar, para explicarlo en pantalla. */
export function motivoCerrado(destino: DestinoDocumento): string {
  const def = DESTINOS[destino]
  return `${def.etiqueta} ya fue aprobada, pagada o rechazada: su documento no se puede reemplazar.`
}
