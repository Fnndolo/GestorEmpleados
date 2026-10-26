'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'
import { prisma } from '@/lib/db'
import { dbAuditado, auditar } from '@/lib/auditoria'
import { accion, ErrorNegocio } from '@/server/accion'
import { avisar, avisarPorRol, usuarioDeColaborador } from '@/server/notificaciones/avisar'
import { nombreCorto, fechaBreve } from '@/lib/notificaciones/texto'
import { fmtCOP } from '@/lib/moneda'
import { borrarPdfTemporal, leerArchivoTemporal } from '@/server/archivos-temporales'
import { eliminarDocumento, guardarDocumento } from '@/server/documentos'
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

    const celebracionId = existente?.id ?? randomUUID()
    // El PDF de indicaciones se archiva aparte: nunca puede contar como una
    // factura ni permitir que el encargado entregue sin comprobantes.
    const anteriores = d.indicacionesPdfRef ? await prisma.documento.findMany({
      where: { entidadTipo: 'IndicacionesCumpleanos', entidadId: celebracionId }, select: { id: true },
    }) : []
    let documentoNuevo: string | null = null
    let c: { id: string }
    try {
      if (d.indicacionesPdfRef) {
        const archivo = await leerArchivoTemporal(d.indicacionesPdfRef, usuario.id)
        if (archivo.mimeType !== 'application/pdf') throw new ErrorNegocio('El documento de indicaciones debe ser un PDF.')
        const doc = await guardarDocumento(usuario, {
          entidadTipo: 'IndicacionesCumpleanos', entidadId: celebracionId,
          nombre: archivo.nombre ?? 'Indicaciones del cumpleaños',
        }, { nombre: 'indicaciones.pdf', mimeType: 'application/pdf', contenido: archivo.contenido })
        documentoNuevo = doc.id
      }
      c = existente
        ? await dbAuditado.celebracionCumpleanos.update({
          where: { id: existente.id },
          // Cambia el encargado: el recordatorio vuelve a tocarle al nuevo.
          data: { encargadoId: d.encargadoId, nota, asignadaPorId: usuario.id, ...(existente.encargadoId !== d.encargadoId ? { recordatorioEnviadoEn: null } : {}) },
        })
        : await dbAuditado.celebracionCumpleanos.create({
          data: { id: celebracionId, colaboradorId: d.colaboradorId, anio: d.anio, fecha, encargadoId: d.encargadoId, nota, asignadaPorId: usuario.id },
        })
    } catch (e) {
      if (documentoNuevo) await eliminarDocumento(documentoNuevo).catch(() => {})
      throw e
    }

    // Reemplazar solo después de guardar: un fallo conserva el PDF anterior.
    for (const doc of anteriores) await eliminarDocumento(doc.id).catch((e) => console.error('No se pudo retirar el PDF de indicaciones anterior:', e))
    await borrarPdfTemporal(d.indicacionesPdfRef, usuario.id)

    if (!existente || existente.encargadoId !== d.encargadoId) {
      await avisarEncargadoAsignado({ encargadoId: d.encargadoId, homenajeadoId: d.colaboradorId, fecha, nota }).catch(() => {})
    }
    revalidatePath('/cumpleanos')
    revalidatePath('/autoservicio')
    return { id: c.id }
  },
)

const cambiarEncargadoSchema = z.object({
  id: z.uuid(),
  encargadoId: z.uuid('Elige al encargado'),
  nota: z.string().trim().max(500, 'Las indicaciones no pueden superar los 500 caracteres.').optional().or(z.literal('')),
  indicacionesPdfRef: z.string().min(16).max(2000).optional(),
})

/**
 * Cambia el encargado (o corrige las indicaciones) de una celebración abierta,
 * incluso si ya entregó facturas: el nuevo las ve en su autoservicio y las
 * completa. Se le avisa al nuevo y al anterior. Cerrada no se toca.
 */
export const cambiarEncargadoCumpleanos = accion(
  { modulo: 'bienestar', accion: 'EDITAR', schema: cambiarEncargadoSchema },
  async (d, usuario) => {
    const c = await prisma.celebracionCumpleanos.findUniqueOrThrow({ where: { id: d.id } })
    if (c.estado === 'CERRADA') throw new ErrorNegocio('Ese cumpleaños ya se celebró y se cerró: no se puede cambiar el encargado.')
    if (c.colaboradorId === d.encargadoId) throw new ErrorNegocio('Nadie organiza su propio cumpleaños: elige a otra persona como encargada.')
    const encargado = await prisma.colaborador.findUnique({ where: { id: d.encargadoId }, select: { estado: true } })
    if (!encargado || encargado.estado !== 'ACTIVO') throw new ErrorNegocio('El encargado debe ser un colaborador activo.')
    if (!(await usuarioDeColaborador(d.encargadoId))) {
      throw new ErrorNegocio('El encargado no tiene usuario de acceso, así que no podría subir las facturas desde su autoservicio. Créale el acceso primero.')
    }

    const nota = d.nota?.trim() || null
    const cambiaEncargado = c.encargadoId !== d.encargadoId
    const anteriores = d.indicacionesPdfRef ? await prisma.documento.findMany({
      where: { entidadTipo: 'IndicacionesCumpleanos', entidadId: c.id }, select: { id: true },
    }) : []
    let documentoNuevo: string | null = null
    try {
      if (d.indicacionesPdfRef) {
        const archivo = await leerArchivoTemporal(d.indicacionesPdfRef, usuario.id)
        if (archivo.mimeType !== 'application/pdf') throw new ErrorNegocio('El documento de indicaciones debe ser un PDF.')
        const doc = await guardarDocumento(usuario, {
          entidadTipo: 'IndicacionesCumpleanos', entidadId: c.id,
          nombre: archivo.nombre ?? 'Indicaciones del cumpleaños',
        }, { nombre: 'indicaciones.pdf', mimeType: 'application/pdf', contenido: archivo.contenido })
        documentoNuevo = doc.id
      }
      await dbAuditado.celebracionCumpleanos.update({
        where: { id: c.id },
        // Cambia el encargado: el recordatorio vuelve a tocarle al nuevo.
        data: { encargadoId: d.encargadoId, nota, asignadaPorId: usuario.id, ...(cambiaEncargado ? { recordatorioEnviadoEn: null } : {}) },
      })
    } catch (e) {
      if (documentoNuevo) await eliminarDocumento(documentoNuevo).catch(() => {})
      throw e
    }
    for (const doc of anteriores) await eliminarDocumento(doc.id).catch((e) => console.error('No se pudo retirar el PDF de indicaciones anterior:', e))
    await borrarPdfTemporal(d.indicacionesPdfRef, usuario.id)

    if (cambiaEncargado) {
      await avisarEncargadoAsignado({ encargadoId: d.encargadoId, homenajeadoId: c.colaboradorId, fecha: c.fecha, nota }).catch(() => {})
      const homenajeado = await prisma.colaborador.findUnique({ where: { id: c.colaboradorId }, select: { nombres: true, apellidos: true } })
      const uidAnterior = await usuarioDeColaborador(c.encargadoId)
      if (uidAnterior) {
        await avisar(uidAnterior, {
          evento: 'cumpleanos_encargado_asignado',
          titulo: `Ya no tienes a cargo el cumpleaños de ${homenajeado ? nombreCorto(homenajeado.nombres, homenajeado.apellidos) : 'tu compañero'}`,
          mensaje: `${fechaBreve(c.fecha)} · Talento Humano se lo encargó a otra persona. No tienes que hacer nada más.`,
          enlace: '/autoservicio',
        }).catch(() => {})
      }
    }
    revalidatePath('/cumpleanos')
    revalidatePath('/autoservicio')
    return { ok: true }
  },
)

/**
 * Cancela un encargo, con el motivo (queda en auditoría). Si el encargado ya
 * había subido facturas, se conservan como documentos en el expediente del
 * homenajeado (ocultas en su autoservicio) y la celebración desaparece: el
 * modelo no tiene un estado CANCELADA. Se le avisa al encargado.
 */
export const cancelarCelebracionCumpleanos = accion(
  { modulo: 'bienestar', accion: 'ELIMINAR', schema: z.object({ id: z.uuid(), motivo: z.string().trim().min(5, 'Explica por qué se cancela.').max(300) }) },
  async (d) => {
    const c = await prisma.celebracionCumpleanos.findUniqueOrThrow({
      where: { id: d.id },
      include: { colaborador: { select: { nombres: true, apellidos: true, sedeId: true } } },
    })
    if (c.estado === 'CERRADA') throw new ErrorNegocio('Ese cumpleaños ya se celebró y se cerró: no se puede cancelar.')

    const facturas = await prisma.documento.findMany({ where: { entidadTipo: 'CelebracionCumpleanos', entidadId: d.id }, select: { id: true, nombre: true } })
    // Las facturas son soporte de un gasto real: no se borran, pasan al
    // expediente del homenajeado (sin mostrarse en su autoservicio).
    for (const f of facturas) {
      await dbAuditado.documento.update({
        where: { id: f.id },
        data: {
          entidadTipo: 'Colaborador', entidadId: c.colaboradorId, sedeId: c.colaborador.sedeId, ocultoAutoservicio: true,
          nombre: `Factura cumpleaños ${c.anio} (encargo cancelado) · ${f.nombre}`,
          descripcion: `Encargo cancelado por Talento Humano: ${d.motivo}`,
        },
      })
    }
    await dbAuditado.celebracionCumpleanos.delete({ where: { id: d.id } })
    const indicaciones = await prisma.documento.findMany({ where: { entidadTipo: 'IndicacionesCumpleanos', entidadId: d.id }, select: { id: true } })
    for (const doc of indicaciones) await eliminarDocumento(doc.id).catch((e) => console.error('No se pudo retirar el PDF del encargo cancelado:', e))
    await auditar('ELIMINAR', 'CelebracionCumpleanos', { registroId: d.id, descripcion: `Anulado: ${d.motivo}${facturas.length ? ` · ${facturas.length} factura(s) pasaron al expediente del homenajeado` : ''}` })

    const uid = await usuarioDeColaborador(c.encargadoId)
    if (uid) {
      await avisar(uid, {
        evento: 'cumpleanos_encargado_asignado',
        titulo: `Se canceló el encargo del cumpleaños de ${nombreCorto(c.colaborador.nombres, c.colaborador.apellidos)}`,
        mensaje: `${fechaBreve(c.fecha)} · Motivo: ${d.motivo}${facturas.length ? ' · Las facturas que subiste quedaron archivadas.' : ''}`,
        enlace: '/autoservicio',
      }).catch(() => {})
    }
    revalidatePath('/cumpleanos')
    revalidatePath('/autoservicio')
    return { ok: true }
  },
)

// Sin facturas se exige una nota corta. El modelo no tiene dónde guardarla (su
// `nota` son las indicaciones de TH), así que queda en la auditoría y en el aviso a TH.
const entregarConNotaSchema = entregarFacturasSchema.extend({
  nota: z.string().trim().max(300, 'La nota no puede superar los 300 caracteres.').optional(),
})

/**
 * El encargado, desde su autoservicio, da por entregadas las facturas que ya
 * subió (con `/api/documentos/subir`, entidad `CelebracionCumpleanos`) y anota
 * lo que gastó. Solo él puede hacerlo, y solo sobre su propio encargo. Puede
 * entregar sin facturas explicando por qué, y seguir subiendo facturas después
 * (vuelve a llamar aquí) mientras TH no cierre la celebración.
 */
export const entregarFacturasCumpleanos = accion(
  { modulo: 'autoservicio', accion: 'CREAR', schema: entregarConNotaSchema },
  async (d, usuario) => {
    const c = await prisma.celebracionCumpleanos.findUnique({
      where: { id: d.id },
      include: { colaborador: { select: { nombres: true, apellidos: true } }, encargado: { select: { nombres: true, apellidos: true } } },
    })
    if (!c || !usuario.colaboradorId || c.encargadoId !== usuario.colaboradorId) {
      throw new ErrorNegocio('Este cumpleaños no está a tu cargo.')
    }
    if (c.estado === 'CERRADA') throw new ErrorNegocio('Talento Humano ya cerró esta celebración.')
    const facturas = await prisma.documento.count({ where: { entidadTipo: 'CelebracionCumpleanos', entidadId: d.id } })
    const nota = d.nota?.trim() || null
    if (facturas === 0 && (!nota || nota.length < 5)) {
      throw new ErrorNegocio('No hay facturas: escribe una nota corta explicando por qué (p. ej. no entregaron factura, lo pagó otra persona).')
    }

    await dbAuditado.celebracionCumpleanos.update({
      where: { id: d.id },
      data: {
        estado: 'FACTURAS_ENTREGADAS',
        valorReportado: d.valorTotal ?? null,
        facturasEntregadasEn: new Date(),
        motivoDevolucion: null,
      },
    })
    if (facturas === 0) {
      await auditar('EDITAR', 'CelebracionCumpleanos', { registroId: d.id, descripcion: `Entregado sin facturas: ${nota}` })
      // Mismos roles que avisarFacturasEntregadas (src/server/cumpleanos.ts), con la explicación.
      await avisarPorRol(['Recursos Humanos', 'Administrador'], {
        titulo: `${nombreCorto(c.encargado.nombres, c.encargado.apellidos)} entregó sin facturas el cumpleaños de ${nombreCorto(c.colaborador.nombres, c.colaborador.apellidos)}`,
        mensaje: `${d.valorTotal != null ? `${fmtCOP(d.valorTotal)} · ` : ''}Motivo: ${nota} · Acéptalo o devuélvelo en Cumpleaños.`,
        enlace: '/cumpleanos',
        llamadoAccion: 'Revisar',
        evento: 'cumpleanos_facturas_entregadas',
        colaboradorId: c.encargadoId,
      }).catch(() => {})
    } else {
      await avisarFacturasEntregadas({ encargadoId: c.encargadoId, homenajeadoId: c.colaboradorId, valor: d.valorTotal ?? null }).catch(() => {})
    }
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
