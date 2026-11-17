'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { accion } from '@/server/accion'
import { obtenerPdfAdjunto, borrarPdfTemporal } from '@/server/archivos-temporales'
import { enviarPreaviso, quitarPreaviso, editarPreaviso } from '@/server/preavisos'
import { contarPaginas } from '@/server/pdf/firma-en-pdf'

/** Enviar un preaviso para que la persona lo descargue, lo firme por fuera y lo devuelva. */
export const enviarPreavisoContrato = accion(
  {
    modulo: 'contratos',
    accion: 'EDITAR',
    schema: z.object({
      contratoId: z.uuid(),
      nombre: z.string().trim().min(3, 'Escribe el nombre del documento.').max(120),
      mensaje: z.string().trim().max(500).optional().or(z.literal('')),
      pdfRef: z.string().min(16).max(2000),
    }),
  },
  async (d, usuario) => {
    const pdf = await obtenerPdfAdjunto({ pdfRef: d.pdfRef }, usuario.id, 'El documento está vacío.')
    await enviarPreaviso({ contratoId: d.contratoId, nombre: d.nombre, mensaje: d.mensaje || null, pdf, usuarioId: usuario.id })
    await borrarPdfTemporal(d.pdfRef, usuario.id)
    revalidatePath(`/contratos/${d.contratoId}`)
    revalidatePath('/autoservicio/contratos')
    return { ok: true }
  },
)

/** Quitar un preaviso enviado por error (con el PDF que haya devuelto la persona). */
export const eliminarPreavisoContrato = accion(
  { modulo: 'contratos', accion: 'EDITAR', schema: z.object({ id: z.uuid() }) },
  async (d) => {
    const p = await quitarPreaviso(d.id)
    revalidatePath(`/contratos/${p.contratoId}`)
    revalidatePath('/autoservicio/contratos')
    return { ok: true }
  },
)

/** Corregir un preaviso enviado: nombre, mensaje o el PDF. */
export const editarPreavisoContrato = accion(
  {
    modulo: 'contratos',
    accion: 'EDITAR',
    schema: z.object({
      id: z.uuid(),
      nombre: z.string().trim().min(3, 'Escribe el nombre del documento.').max(120),
      mensaje: z.string().trim().max(500).optional().or(z.literal('')),
      pdfRef: z.string().min(16).max(2000).nullish(),
    }),
  },
  async (d, usuario) => {
    const pdf = d.pdfRef ? await obtenerPdfAdjunto({ pdfRef: d.pdfRef }, usuario.id, 'El documento está vacío.') : null
    const p = await editarPreaviso({ id: d.id, nombre: d.nombre, mensaje: d.mensaje || null, pdf, usuarioId: usuario.id })
    if (d.pdfRef) await borrarPdfTemporal(d.pdfRef, usuario.id)
    revalidatePath(`/contratos/${p.contratoId}`)
    revalidatePath('/autoservicio/contratos')
    return { ok: true }
  },
)

/** Contrato OPS → Acciones → Enviar documento para firmar. */
export const enviarDocumentoFirmaOps = accion(
  {
    modulo: 'contratos',
    accion: 'EDITAR',
    schema: z.object({
      contratoOpsId: z.uuid(),
      nombre: z.string().trim().min(3, 'Escribe el nombre del documento.').max(120),
      pdfRef: z.string().min(16).max(2000),
      posicionFirma: z.object({ pagina: z.number().int().min(1), x: z.number(), y: z.number(), ancho: z.number().positive(), alto: z.number().positive() }),
    }),
  },
  async (d, usuario) => {
    const pdf = await obtenerPdfAdjunto({ pdfRef: d.pdfRef }, usuario.id, 'El documento está vacío.')
    await enviarPreaviso({ contratoOpsId: d.contratoOpsId, nombre: d.nombre, mensaje: null, pdf, usuarioId: usuario.id, firmaEnApp: true, posicionFirma: d.posicionFirma })
    await borrarPdfTemporal(d.pdfRef, usuario.id)
    revalidatePath(`/contratos/ops/${d.contratoOpsId}`)
    revalidatePath('/autoservicio/contratos')
    return { ok: true }
  },
)

/** Cuántas páginas tiene el PDF subido, para ubicar la firma. */
export const analizarPdfParaFirma = accion(
  { modulo: 'contratos', accion: 'EDITAR', schema: z.object({ pdfRef: z.string().min(16).max(2000) }) },
  async (d, usuario) => {
    const pdf = await obtenerPdfAdjunto({ pdfRef: d.pdfRef }, usuario.id, 'El documento está vacío.')
    return { paginas: await contarPaginas(pdf) }
  },
)
