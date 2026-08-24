import 'server-only'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { subirArchivo, eliminarArchivo } from '@/server/storage'
import type { UsuarioSesion } from '@/server/sesion'
import { tienePermiso } from '@/server/sesion'
import { parseFechaISO, formatFechaISO } from '@/lib/fechas'
import { publicarVencimiento, cancelarVencimiento } from '@/server/vencimientos/servicio'

const NIVEL_PERMISO: Record<string, { modulo: string }> = {
  SST_MEDICO: { modulo: 'colaboradores_salud' },
  RRHH: { modulo: 'colaboradores' },
  JURIDICA: { modulo: 'juridica' },
  ADMIN: { modulo: 'configuracion' },
}

/** ¿El usuario puede ver un documento con cierto nivel de acceso? */
export function puedeVerNivel(usuario: UsuarioSesion, nivel: string): boolean {
  if (nivel === 'GENERAL') return true
  const regla = NIVEL_PERMISO[nivel]
  if (!regla) return true
  return tienePermiso(usuario, regla.modulo as Parameters<typeof tienePermiso>[1], 'VER')
}

type DatosSubida = {
  entidadTipo: string
  entidadId: string
  tipoDocumentoId?: string | null
  nombre: string
  descripcion?: string | null
  fechaVencimiento?: string | null
  sedeId?: string | null
}

export async function guardarDocumento(
  usuario: UsuarioSesion,
  datos: DatosSubida,
  archivo: { nombre: string; mimeType: string; contenido: Buffer },
) {
  // Nivel de acceso heredado del tipo de documento (si hay)
  let nivelAcceso: 'GENERAL' | 'RRHH' | 'SST_MEDICO' | 'JURIDICA' | 'ADMIN' = 'GENERAL'
  if (datos.tipoDocumentoId) {
    const td = await prisma.tipoDocumento.findUnique({ where: { id: datos.tipoDocumentoId } })
    if (td) nivelAcceso = td.nivelAcceso
  }
  // El certificado de un examen médico es dato de salud (Ley 1581): acceso
  // restringido aunque no se haya elegido un tipo de documento con ese nivel.
  if (datos.entidadTipo === 'ExamenMedico' && nivelAcceso === 'GENERAL') nivelAcceso = 'SST_MEDICO'

  const prefijo = `${datos.entidadTipo.toLowerCase()}/${datos.entidadId}`
  const subido = await subirArchivo(prefijo, archivo.nombre, archivo.contenido, archivo.mimeType)

  const doc = await dbAuditado.documento.create({
    data: {
      entidadTipo: datos.entidadTipo,
      entidadId: datos.entidadId,
      tipoDocumentoId: datos.tipoDocumentoId || null,
      nombre: datos.nombre,
      descripcion: datos.descripcion || null,
      bucket: subido.bucket,
      storagePath: subido.storagePath,
      mimeType: subido.mimeType,
      tamanoBytes: subido.tamanoBytes,
      fechaVencimiento: parseFechaISO(datos.fechaVencimiento),
      nivelAcceso,
      sedeId: datos.sedeId || null,
      subidoPorId: usuario.id,
    },
  })

  // Si el documento tiene fecha de vencimiento, publica un Vencimiento (alertas)
  if (doc.fechaVencimiento) {
    const tipoNombre = doc.tipoDocumentoId
      ? (await prisma.tipoDocumento.findUnique({ where: { id: doc.tipoDocumentoId } }))?.nombre
      : null

    let tituloAdicional = ''
    if (datos.entidadTipo === 'Colaborador') {
      const colab = await prisma.colaborador.findUnique({ where: { id: datos.entidadId } })
      if (colab) {
        tituloAdicional = ` — ${colab.nombres} ${colab.apellidos}`
      }
    }

    await publicarVencimiento({
      origen: 'DOCUMENTO',
      entidadTipo: 'Documento',
      entidadId: doc.id,
      titulo: `${tipoNombre ?? doc.nombre}${tituloAdicional}`,
      detalle: doc.descripcion,
      fechaVencimientoISO: formatFechaISO(doc.fechaVencimiento),
      sedeId: doc.sedeId,
    })
  }

  return doc
}

/**
 * Todo campo del esquema que apunta a un Documento.
 *
 * Al borrar un documento hay que limpiarlos: si no, el registro que lo señala
 * —una liquidación, un acta, una norma— queda apuntando a algo que ya no
 * existe, y su botón de descarga falla sin explicación. La lista se saca del
 * esquema; si mañana aparece un campo nuevo, hay que añadirlo aquí.
 */
const CAMPOS_QUE_APUNTAN: { modelo: string; campo: string }[] = [
  { modelo: 'accionMejoraSst', campo: 'evidenciaDocId' },
  { modelo: 'asignacionActivo', campo: 'actaDevolucionDocId' },
  { modelo: 'asignacionActivo', campo: 'actaEntregaDocId' },
  { modelo: 'autoevaluacionSst', campo: 'documentoId' },
  { modelo: 'autorizacionDatos', campo: 'documentoId' },
  { modelo: 'certificacionLaboral', campo: 'documentoId' },
  { modelo: 'cuentaCobroOps', campo: 'documentoId' },
  { modelo: 'documentoLegal', campo: 'documentoId' },
  { modelo: 'entregaDotacion', campo: 'recibidoDocId' },
  { modelo: 'entregaEpp', campo: 'soporteDocId' },
  { modelo: 'etapaProceso', campo: 'documentoId' },
  { modelo: 'examenMedico', campo: 'documentoId' },
  { modelo: 'inspeccionSst', campo: 'documentoId' },
  { modelo: 'liquidacionDefinitiva', campo: 'documentoId' },
  { modelo: 'liquidacionNomina', campo: 'documentoId' },
  { modelo: 'normaMatrizLegal', campo: 'evidenciaDocId' },
  { modelo: 'novedadArl', campo: 'soporteDocId' },
  { modelo: 'ocurrenciaObligacion', campo: 'evidenciaDocId' },
  { modelo: 'otrosiContrato', campo: 'documentoId' },
  { modelo: 'pazYSalvo', campo: 'documentoId' },
  { modelo: 'planEmergencia', campo: 'documentoId' },
  { modelo: 'planTrabajoSst', campo: 'documentoId' },
  { modelo: 'planillaPila', campo: 'documentoId' },
  { modelo: 'prorrogaContrato', campo: 'documentoId' },
  { modelo: 'responsableSgsst', campo: 'cartaDocId' },
  { modelo: 'reunionComite', campo: 'actaDocId' },
  { modelo: 'simulacro', campo: 'documentoId' },
  { modelo: 'versionDocumentoLegal', campo: 'archivoDocId' },
]

/** Ids de documentos que ya "pertenecen" a otro módulo del sistema. */
export async function documentosDeOtroModulo(colaboradorId: string): Promise<Set<string>> {
  const [liq, asig, dot, epp, cert, exam] = await Promise.all([
    prisma.liquidacionNomina.findMany({ where: { colaboradorId }, select: { documentoId: true } }),
    prisma.asignacionActivo.findMany({ where: { colaboradorId }, select: { actaEntregaDocId: true, actaDevolucionDocId: true } }),
    prisma.entregaDotacion.findMany({ where: { colaboradorId }, select: { recibidoDocId: true } }),
    prisma.entregaEpp.findMany({ where: { colaboradorId }, select: { soporteDocId: true } }),
    prisma.certificacionLaboral.findMany({ where: { colaboradorId }, select: { documentoId: true } }),
    prisma.examenMedico.findMany({ where: { colaboradorId }, select: { documentoId: true } }),
  ])
  const ids = [
    ...liq.map((x) => x.documentoId),
    ...asig.flatMap((x) => [x.actaEntregaDocId, x.actaDevolucionDocId]),
    ...dot.map((x) => x.recibidoDocId),
    ...epp.map((x) => x.soporteDocId),
    ...cert.map((x) => x.documentoId),
    ...exam.map((x) => x.documentoId),
  ]
  return new Set(ids.filter((x): x is string => Boolean(x)))
}

export async function eliminarDocumento(id: string) {
  const doc = await prisma.documento.findUnique({ where: { id } })
  if (!doc) return
  await cancelarVencimiento('Documento', doc.id, 'DOCUMENTO')

  // Antes de borrarlo, se sueltan las referencias. `updateMany` no falla cuando
  // ninguna fila coincide, así que recorrer los 28 campos es barato y evita
  // tener que adivinar de quién era el documento.
  /* eslint-disable @typescript-eslint/no-explicit-any -- delegado elegido por nombre */
  for (const { modelo, campo } of CAMPOS_QUE_APUNTAN) {
    const delegado = (prisma as any)[modelo]
    if (!delegado?.updateMany) continue
    await delegado.updateMany({ where: { [campo]: id }, data: { [campo]: null } })
  }
  /* eslint-enable @typescript-eslint/no-explicit-any */

  await eliminarArchivo(doc.storagePath)
  await dbAuditado.documento.delete({ where: { id } })
}
