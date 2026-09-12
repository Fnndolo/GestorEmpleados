'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { accion, ErrorNegocio } from '@/server/accion'
import { usuarioDeColaborador } from '@/server/notificaciones/avisar'
import { asignarEncargadoSchema, entregarFacturasSchema, revisarFacturasSchema } from '@/lib/validaciones/cumpleanos'
import {
  cumpleanosEnAnio, avisarEncargadoAsignado, avisarFacturasEntregadas, avisarFacturasRevisadas,
} from '@/server/cumpleanos'

/**
 * Cumpleaños: TH encarga, el encargado entrega facturas, TH revisa. Ver
 * `src/server/cumpleanos.ts` para el porqué del flujo.
 */

/**
 * Le encarga a alguien el cumpleaños de una persona en un año. Si ya había
 * encargado y la celebración sigue abierta, se cambia (y se le avisa al nuevo).
 */
export const asignarEncargadoCumpleanos = accion(
  { modulo: 'bienestar', accion: 'CREAR', schema: asignarEncargadoSchema },
  async (d, usuario) => {
    if (d.colaboradorId === d.encargadoId) {
      throw new ErrorNegocio('Nadie organiza su propio cumpleaños: elige a otra persona como encargada.')
    }
    const [homenajeado, encargado] = await Promise.all([
      prisma.colaborador.findUnique({ where: { id: d.colaboradorId }, select: { estado: true, fechaNacimiento: true } }),
      prisma.colaborador.findUnique({ where: { id: d.encargadoId }, select: { estado: true } }),
    ])
    if (!homenajeado?.fechaNacimiento) throw new ErrorNegocio('Esa persona no tiene fecha de nacimiento en su ficha.')
    if (homenajeado.estado !== 'ACTIVO') throw new ErrorNegocio('Esa persona ya no está activa.')
    if (!encargado || encargado.estado !== 'ACTIVO') throw new ErrorNegocio('El encargado debe ser un colaborador activo.')
    // Sin usuario no le llega el aviso ni puede subir las facturas: mejor saberlo ahora.
    if (!(await usuarioDeColaborador(d.encargadoId))) {
      throw new ErrorNegocio('El encargado no tiene usuario de acceso, así que no podría subir las facturas desde su autoservicio. Créale el acceso primero.')
    }

    const fecha = cumpleanosEnAnio(homenajeado.fechaNacimiento, d.anio)
    const nota = d.nota?.trim() || null
    const existente = await prisma.celebracionCumpleanos.findUnique({
      where: { colaboradorId_anio: { colaboradorId: d.colaboradorId, anio: d.anio } },
      select: { id: true, estado: true, encargadoId: true },
    })
    if (existente?.estado === 'CERRADA') throw new ErrorNegocio('Ese cumpleaños ya se celebró y se cerró.')
    if (existente?.estado === 'FACTURAS_ENTREGADAS') {
      throw new ErrorNegocio('El encargado ya entregó las facturas: revísalas antes de cambiar nada.')
    }

    const c = existente
      ? await dbAuditado.celebracionCumpleanos.update({
          where: { id: existente.id },
          // Cambia el encargado: el recordatorio vuelve a tocarle al nuevo.
          data: { encargadoId: d.encargadoId, nota, asignadaPorId: usuario.id, ...(existente.encargadoId !== d.encargadoId ? { recordatorioEnviadoEn: null } : {}) },
        })
      : await dbAuditado.celebracionCumpleanos.create({
          data: { colaboradorId: d.colaboradorId, anio: d.anio, fecha, encargadoId: d.encargadoId, nota, asignadaPorId: usuario.id },
        })

    if (!existente || existente.encargadoId !== d.encargadoId) {
      await avisarEncargadoAsignado({ encargadoId: d.encargadoId, homenajeadoId: d.colaboradorId, fecha, nota }).catch(() => {})
    }
    revalidatePath('/cumpleanos')
    return { id: c.id }
  },
)

/** Deshace un encargo que no llegó a nada: sin facturas subidas. */
export const cancelarCelebracionCumpleanos = accion(
  { modulo: 'bienestar', accion: 'ELIMINAR', schema: z.object({ id: z.uuid() }) },
  async (d) => {
    const c = await prisma.celebracionCumpleanos.findUniqueOrThrow({ where: { id: d.id } })
    if (c.estado !== 'ASIGNADA') throw new ErrorNegocio('Ya hay facturas entregadas: revísalas en vez de cancelar.')
    const facturas = await prisma.documento.count({ where: { entidadTipo: 'CelebracionCumpleanos', entidadId: d.id } })
    if (facturas > 0) throw new ErrorNegocio('El encargado ya subió archivos; no se puede cancelar.')
    await dbAuditado.celebracionCumpleanos.delete({ where: { id: d.id } })
    revalidatePath('/cumpleanos')
    return { ok: true }
  },
)

/**
 * El encargado, desde su autoservicio, da por entregadas las facturas que ya
 * subió (con `/api/documentos/subir`, entidad `CelebracionCumpleanos`) y anota
 * lo que gastó. Solo él puede hacerlo, y solo sobre su propio encargo.
 */
export const entregarFacturasCumpleanos = accion(
  { modulo: 'autoservicio', accion: 'CREAR', schema: entregarFacturasSchema },
  async (d, usuario) => {
    const c = await prisma.celebracionCumpleanos.findUnique({ where: { id: d.id } })
    if (!c || !usuario.colaboradorId || c.encargadoId !== usuario.colaboradorId) {
      throw new ErrorNegocio('Este cumpleaños no está a tu cargo.')
    }
    if (c.estado === 'CERRADA') throw new ErrorNegocio('Talento Humano ya cerró esta celebración.')
    const facturas = await prisma.documento.count({ where: { entidadTipo: 'CelebracionCumpleanos', entidadId: d.id } })
    if (facturas === 0) throw new ErrorNegocio('Sube al menos una factura antes de entregar.')

    await dbAuditado.celebracionCumpleanos.update({
      where: { id: d.id },
      data: {
        estado: 'FACTURAS_ENTREGADAS',
        valorReportado: d.valorTotal ?? null,
        facturasEntregadasEn: new Date(),
        motivoDevolucion: null,
      },
    })
    await avisarFacturasEntregadas({ encargadoId: c.encargadoId, homenajeadoId: c.colaboradorId, valor: d.valorTotal ?? null }).catch(() => {})
    revalidatePath('/autoservicio')
    revalidatePath('/cumpleanos')
    return { ok: true }
  },
)

/** Talento Humano acepta las facturas (cierra) o las devuelve con motivo. */
export const revisarFacturasCumpleanos = accion(
  { modulo: 'bienestar', accion: 'EDITAR', schema: revisarFacturasSchema },
  async (d, usuario) => {
    const c = await prisma.celebracionCumpleanos.findUniqueOrThrow({ where: { id: d.id } })
    if (c.estado !== 'FACTURAS_ENTREGADAS') throw new ErrorNegocio('No hay facturas pendientes de revisar en esta celebración.')

    const aceptadas = d.decision === 'ACEPTAR'
    const motivo = aceptadas ? null : d.motivo?.trim() || null
    await dbAuditado.celebracionCumpleanos.update({
      where: { id: d.id },
      data: aceptadas
        ? { estado: 'CERRADA', cerradaEn: new Date(), cerradaPorId: usuario.id, motivoDevolucion: null }
        : { estado: 'ASIGNADA', motivoDevolucion: motivo },
    })
    await avisarFacturasRevisadas({ encargadoId: c.encargadoId, homenajeadoId: c.colaboradorId, aceptadas, motivo }).catch(() => {})
    revalidatePath('/cumpleanos')
    revalidatePath('/autoservicio')
    return { ok: true, aceptadas }
  },
)
