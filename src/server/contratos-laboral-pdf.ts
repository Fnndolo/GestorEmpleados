import 'server-only'
import { createHash } from 'node:crypto'
import { prisma } from '@/lib/db'
import { subirArchivo } from '@/server/storage'
import { renderContratoLaboral, type DatosContratoLaboralPdf } from '@/server/pdf/contrato-laboral'
import { renderAutorizacionDatos, type DatosAutorizacionPdf } from '@/server/pdf/autorizacion-datos'
import { resolverPlantilla, type DatosContrato, type FuncionesCargo, type ClausulaPlantilla } from '@/lib/contrato-variables'
import { pesosALetras, mesesALetras, fechaLarga } from '@/lib/numero-letras'

/**
 * Snapshot guardado en `Contrato.contenidoPdf`: datos resueltos del PDF + autorización
 * + la plantilla FUENTE (texto con {{variables}} y funciones tal como quedó editado al
 * crear), para poder reabrir el contrato en el mismo formulario de creación.
 */
export type SnapshotContratoLaboral = DatosContratoLaboralPdf & {
  autorizacion?: DatosAutorizacionPdf
  plantillaFuente?: {
    titulo: string
    intro: string
    cierre: string
    clausulas: ClausulaPlantilla[]
    funciones: FuncionesCargo | null
  }
}

export type PdfGenerado = { documentoId: string; sha256: string }

function huella(pdf: Buffer): string {
  return createHash('sha256').update(pdf).digest('hex')
}

const TIPO_LABEL: Record<string, string> = {
  TERMINO_FIJO: 'TERMINO FIJO',
  TERMINO_INDEFINIDO: 'TERMINO INDEFINIDO',
  OBRA_LABOR: 'OBRA O LABOR',
  APRENDIZAJE_SENA: 'APRENDIZAJE SENA',
  PRACTICA: 'PRÁCTICA',
}

/**
 * Construye el snapshot del PDF del contrato laboral (empresa, plantilla resuelta,
 * tabla de encabezado EMPLEADOR/EMPLEADO y nombres para las firmas). Se guarda en
 * `Contrato.contenidoPdf` para regenerar el documento firmado sin re-derivar.
 */
export async function construirDatosPdfContratoLaboral(opts: {
  datos: DatosContrato
  tipoContrato: string
  plantilla: { titulo: string; intro: string; cierre: string; clausulas: ClausulaPlantilla[] }
  funciones: FuncionesCargo | null
}): Promise<DatosContratoLaboralPdf> {
  const empresaCfg = await prisma.configuracionEmpresa.findFirst()

  const resuelta = resolverPlantilla(opts.plantilla, opts.datos, opts.funciones)
  const c = opts.datos.contrato
  const e = opts.datos.empresa

  return {
    empresa: {
      razonSocial: e.razonSocial || empresaCfg?.razonSocial || '',
      nombreComercial: e.marca || empresaCfg?.nombreComercial || '',
      nit: e.nit || empresaCfg?.nit || '',
      direccion: empresaCfg?.direccion,
      telefono: empresaCfg?.telefono,
      emailContacto: empresaCfg?.emailContacto,
      sitioWeb: empresaCfg?.sitioWeb,
    },
    plantilla: resuelta,
    encabezado: {
      empleadorNombre: e.razonSocial || '—',
      empleadorRep: e.representanteLegal || '—',
      empleadorNit: e.nit || '—',
      empleadorDir: empresaCfg?.direccion ?? '—',
      tipoContrato: TIPO_LABEL[opts.tipoContrato] ?? opts.tipoContrato,
      salario: c.salarioMensual != null ? pesosALetras(c.salarioMensual) : '—',
      auxTransporte: c.auxTransporte != null && c.auxTransporte > 0 ? pesosALetras(c.auxTransporte) : 'No aplica',
      empleadoNombre: opts.datos.contratista.nombre ?? '—',
      empleadoCc: opts.datos.contratista.cc ?? '—',
      empleadoDir: opts.datos.contratista.direccion ?? '—',
      empleadoEmail: opts.datos.contratista.email ?? '—',
      duracion: c.plazoMeses != null ? mesesALetras(c.plazoMeses) : c.fechaFin ? '—' : 'Indefinida',
      fechaInicio: c.fechaInicio ? fechaLarga(c.fechaInicio) : '—',
      fechaFin: c.fechaFin ? fechaLarga(c.fechaFin) : 'No aplica',
    },
    firmaEmpleadorNombre: e.representanteLegal || '',
    firmaEmpleadoNombre: opts.datos.contratista.nombre ?? '',
    firmaEmpleadoCc: [opts.datos.contratista.cc, opts.datos.contratista.ccLugar ? `de ${opts.datos.contratista.ccLugar}` : '']
      .filter(Boolean)
      .join(' '),
  }
}

/** Renderiza el PDF del contrato laboral desde el snapshot y lo guarda como Documento. */
export async function generarPdfContratoLaboral(opts: {
  contratoId: string
  numero: string
  sedeId: string
  usuarioId: string
  datos: DatosContratoLaboralPdf
  firmas?: {
    empleadorImg?: string | null
    empleadoImg?: string | null
    empleadorFecha?: string | null
    empleadoFecha?: string | null
  }
  nombreDocumento?: string
}): Promise<PdfGenerado> {
  const pdf = await renderContratoLaboral({
    ...opts.datos,
    firmaEmpleadorImg: opts.firmas?.empleadorImg ?? null,
    firmaEmpleadoImg: opts.firmas?.empleadoImg ?? null,
    firmaEmpleadorFecha: opts.firmas?.empleadorFecha ?? null,
    firmaEmpleadoFecha: opts.firmas?.empleadoFecha ?? null,
  })
  const sha256 = huella(pdf)

  const archivo = await subirArchivo(`contratos/${opts.contratoId}`, `contrato-${opts.numero}.pdf`, pdf, 'application/pdf')
  const doc = await prisma.documento.create({
    data: {
      entidadTipo: 'Contrato',
      entidadId: opts.contratoId,
      nombre: opts.nombreDocumento ?? `Contrato laboral ${opts.numero}`,
      bucket: archivo.bucket,
      storagePath: archivo.storagePath,
      mimeType: 'application/pdf',
      tamanoBytes: archivo.tamanoBytes,
      sha256,
      nivelAcceso: 'GENERAL',
      sedeId: opts.sedeId,
      subidoPorId: opts.usuarioId,
    },
  })
  return { documentoId: doc.id, sha256 }
}

/** Renderiza la autorización de datos (Ley 1581) del empleado y la guarda como Documento del contrato laboral. */
export async function generarPdfAutorizacionDatosLaboral(opts: {
  contratoId: string
  numero: string
  sedeId: string
  usuarioId: string
  datos: DatosAutorizacionPdf
  firmaImg?: string | null
  firmaFecha?: string | null
  nombreDocumento?: string
}): Promise<PdfGenerado> {
  const fechaFirma = opts.firmaImg ? opts.firmaFecha ?? fechaLarga(new Date().toISOString().slice(0, 10)) : null
  const pdf = await renderAutorizacionDatos(opts.datos, opts.firmaImg ?? null, fechaFirma)
  const sha256 = huella(pdf)
  const archivo = await subirArchivo(`contratos/${opts.contratoId}`, `autorizacion-datos-${opts.numero}.pdf`, pdf, 'application/pdf')
  const doc = await prisma.documento.create({
    data: {
      entidadTipo: 'Contrato',
      entidadId: opts.contratoId,
      nombre: opts.nombreDocumento ?? `Autorización de datos ${opts.numero}`,
      bucket: archivo.bucket,
      storagePath: archivo.storagePath,
      mimeType: 'application/pdf',
      tamanoBytes: archivo.tamanoBytes,
      sha256,
      nivelAcceso: 'GENERAL',
      sedeId: opts.sedeId,
      subidoPorId: opts.usuarioId,
    },
  })
  return { documentoId: doc.id, sha256 }
}
