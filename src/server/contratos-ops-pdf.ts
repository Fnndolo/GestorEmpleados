import 'server-only'
import { createHash } from 'node:crypto'
import { prisma } from '@/lib/db'
import { subirArchivo, leerArchivo } from '@/server/storage'
import { renderContratoOps, type DatosContratoOpsPdf } from '@/server/pdf/contrato-ops'
import { renderAutorizacionDatos, type DatosAutorizacionPdf } from '@/server/pdf/autorizacion-datos'
import { resolverPlantilla, type DatosContrato, type FuncionesCargo, type ClausulaPlantilla } from '@/lib/contrato-variables'
import { pesosALetras, mesesALetras, fechaLarga, fechaLargaLetras } from '@/lib/numero-letras'

/** Snapshot guardado en `ContratoOps.contenidoPdf`: datos del contrato + autorización. */
export type SnapshotContratoOps = DatosContratoOpsPdf & { autorizacion?: DatosAutorizacionPdf }

/** Resultado de generar un PDF: id del Documento y su huella SHA-256 (sello de integridad). */
export type PdfGenerado = { documentoId: string; sha256: string }

/** SHA-256 (hex) del buffer del PDF: sello de integridad para probar no alteración. */
function huella(pdf: Buffer): string {
  return createHash('sha256').update(pdf).digest('hex')
}

/**
 * Construye el snapshot de datos que necesita el PDF del contrato OPS (empresa,
 * plantilla resuelta, encabezado y nombres para las firmas). Se guarda en el
 * contrato (`contenidoPdf`) para poder regenerar el documento firmado más tarde
 * sin re-derivar el formulario.
 */
export async function construirDatosPdfContratoOps(opts: {
  datos: DatosContrato
  plantilla: { titulo: string; intro: string; cierre: string; clausulas: ClausulaPlantilla[] }
  funciones: FuncionesCargo | null
}): Promise<DatosContratoOpsPdf> {
  // El membrete (papel membretado) usa siempre los datos de la configuración.
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
      contratanteNombre: e.razonSocial || '—',
      contratanteRep: e.representanteLegal || '—',
      contratanteNit: e.nit || '—',
      contratanteDir: empresaCfg?.direccion ?? '—',
      contratistaNombre: opts.datos.contratista.nombre ?? '—',
      contratistaCc: opts.datos.contratista.cc ?? '—',
      contratistaDir: opts.datos.contratista.direccion ?? '—',
      contratistaEmail: opts.datos.contratista.email ?? '—',
      tipo: 'Prestación de servicios',
      plazo: c.plazoMeses != null ? mesesALetras(c.plazoMeses) : '—',
      valorTotal: c.valorTotal != null ? pesosALetras(c.valorTotal) : '—',
      honorarios: c.honorarioMensual != null ? pesosALetras(c.honorarioMensual) : '—',
      fechaSuscripcion: c.fechaSuscripcion ? fechaLarga(c.fechaSuscripcion) : '—',
      fechaTerminacion: c.fechaFin ? fechaLarga(c.fechaFin) : '—',
    },
    firmaContratanteNombre: e.representanteLegal || '',
    firmaContratistaNombre: opts.datos.contratista.nombre ?? '',
  }
}

/**
 * Renderiza el PDF del contrato OPS desde el snapshot y lo guarda como Documento.
 * `firmas` incrusta las imágenes de firma de cada parte (para el documento firmado).
 */
export async function generarPdfContratoOps(opts: {
  contratoId: string
  numero: string
  sedeId: string
  usuarioId: string
  datos: DatosContratoOpsPdf
  firmas?: {
    contratanteImg?: string | null
    contratistaImg?: string | null
    contratanteFecha?: string | null
    contratistaFecha?: string | null
  }
  nombreDocumento?: string
}): Promise<PdfGenerado> {
  const pdf = await renderContratoOps({
    ...opts.datos,
    firmaContratanteImg: opts.firmas?.contratanteImg ?? null,
    firmaContratistaImg: opts.firmas?.contratistaImg ?? null,
    firmaContratanteFecha: opts.firmas?.contratanteFecha ?? null,
    firmaContratistaFecha: opts.firmas?.contratistaFecha ?? null,
  })
  const sha256 = huella(pdf)

  const archivo = await subirArchivo(`contratos-ops/${opts.contratoId}`, `contrato-${opts.numero}.pdf`, pdf, 'application/pdf')
  const doc = await prisma.documento.create({
    data: {
      entidadTipo: 'ContratoOps',
      entidadId: opts.contratoId,
      nombre: opts.nombreDocumento ?? `Contrato OPS ${opts.numero}`,
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

/**
 * Construye los datos de la autorización de tratamiento de datos (Ley 1581),
 * que se genera junto al contrato y solo firma el contratista.
 */
export async function construirDatosAutorizacion(opts: {
  datos: DatosContrato
  genero?: string | null
}): Promise<DatosAutorizacionPdf> {
  const empresaCfg = await prisma.configuracionEmpresa.findFirst()
  const d = opts.datos
  const ciudad = d.contrato.ciudad || 'Pasto, Nariño'
  const fecha = d.contrato.fechaSuscripcion ?? new Date().toISOString().slice(0, 10)
  return {
    ciudadFecha: `${ciudad}, ${fechaLargaLetras(fecha)}.`,
    contratistaNombre: d.contratista.nombre ?? '',
    contratistaCc: [d.contratista.cc, d.contratista.ccLugar ? `de ${d.contratista.ccLugar}` : '']
      .filter(Boolean)
      .join(' ')
      .replace(/^CC\.?\s*/i, ''), // el PDF antepone "CC." en la firma
    cargo: (d.contrato.cargoObjeto ?? '').toUpperCase(),
    genero: opts.genero ?? null,
    empresa: {
      razonSocial: d.empresa.razonSocial || empresaCfg?.razonSocial || '',
      nombreComercial: d.empresa.marca || empresaCfg?.nombreComercial || '',
      nit: d.empresa.nit || empresaCfg?.nit || '',
      direccion: empresaCfg?.direccion,
      telefono: empresaCfg?.telefono,
      emailContacto: empresaCfg?.emailContacto,
      sitioWeb: empresaCfg?.sitioWeb,
      domicilio: [ciudad, empresaCfg?.direccion].filter(Boolean).join(', '),
    },
  }
}

/** Renderiza la autorización de datos (con o sin firma) y la guarda como Documento. */
export async function generarPdfAutorizacionDatos(opts: {
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
  const archivo = await subirArchivo(`contratos-ops/${opts.contratoId}`, `autorizacion-datos-${opts.numero}.pdf`, pdf, 'application/pdf')
  const doc = await prisma.documento.create({
    data: {
      entidadTipo: 'ContratoOps',
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

/** Lee una firma guardada en storage y la devuelve como data URI PNG para el PDF. */
export async function leerFirmaComoDataUri(storagePath: string): Promise<string> {
  const buf = await leerArchivo(storagePath)
  return `data:image/png;base64,${buf.toString('base64')}`
}
