'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { accion } from '@/server/accion'
import { obtenerPdfAdjunto, borrarPdfTemporal } from '@/server/archivos-temporales'
import { enviarPreaviso, quitarPreaviso, editarPreaviso } from '@/server/preavisos'

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
