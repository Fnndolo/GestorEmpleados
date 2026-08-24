'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { accion, ErrorNegocio } from '@/server/accion'
import { ErrorPermiso } from '@/server/sesion'
import { permisoDestino, duenoPuedeAdjuntar, type DestinoDocumento } from '@/server/documentos-adjuntos'
import { generarDesprendibleDeLiquidacion } from '@/server/nomina/desprendibles'
import { generarRecibidoDotacion } from '@/server/dotacion'
import { generarRecibidoEpp } from '@/server/epp'
import { generarPdfCuentaCobro } from '@/server/cuentas-cobro'
import { generarActa } from './activos/acciones'

/** Destinos que el sistema SABE generar desde plantilla. */
const GENERABLES = [
  'desprendible', 'cuentaCobro', 'actaEntregaActivo', 'actaDevolucionActivo',
  'recibidoDotacion', 'soporteEpp',
] as const

export type DestinoGenerable = (typeof GENERABLES)[number]

/**
 * Rehace el documento desde la plantilla del sistema.
 *
 * Es la otra mitad de `adjuntarDocumentoGenerado`: en cada sitio se puede
 * elegir entre el documento que arma la plataforma y uno propio. Sirve también
 * para volver atrás — alguien subió el suyo y luego quiere el de plantilla.
 */
export const regenerarDocumento = accion(
  {
    modulo: 'documentos',
    accion: 'VER',
    schema: z.object({
      destino: z.enum(GENERABLES),
      id: z.uuid(),
      /** Plantilla con la que armarlo. Opcional: sin ella se usa la de por defecto. */
      plantillaId: z.union([z.uuid(), z.literal('')]).optional(),
    }),
  },
  async (d, usuario) => {
    const destino = d.destino as DestinoDocumento
    const { modulo, accion: acc } = permisoDestino(destino)
    const porModulo = usuario.permisos.some((p) => p.modulo === modulo && p.accion === acc)
    if (!porModulo) {
      // Misma regla que al adjuntar: el dueño puede rehacer lo suyo mientras el
      // trámite siga abierto (su cuenta de cobro).
      const comoDueno = await duenoPuedeAdjuntar(destino, d.id, usuario.colaboradorId)
      if (comoDueno !== 'si') throw new ErrorPermiso(modulo, acc)
    }

    let documentoId: string
    switch (d.destino) {
      case 'desprendible':
        documentoId = await generarDesprendibleDeLiquidacion(d.id, usuario.id)
        break
      case 'cuentaCobro': {
        // Con plantilla elegida se respeta; sin ella se usa la de por defecto,
        // porque la cuenta no guarda con cuál se armó la vez anterior.
        let plantillaId = d.plantillaId || null
        if (!plantillaId) {
          const porDefecto = await prisma.plantillaCuentaCobro.findFirst({
            where: { activa: true },
            orderBy: [{ esDefecto: 'desc' }, { nombre: 'asc' }],
            select: { id: true },
          })
          plantillaId = porDefecto?.id ?? null
        }
        documentoId = await generarPdfCuentaCobro(d.id, plantillaId, usuario.id)
        break
      }
      case 'recibidoDotacion':
        documentoId = await generarRecibidoDotacion(d.id, usuario.id)
        break
      case 'soporteEpp':
        documentoId = await generarRecibidoEpp(d.id, usuario.id)
        break
      case 'actaEntregaActivo':
      case 'actaDevolucionActivo': {
        const asig = await prisma.asignacionActivo.findUniqueOrThrow({
          where: { id: d.id },
          select: { activoId: true, colaboradorId: true, loteId: true },
        })
        // El acta cubre todo el lote cuando la entrega se hizo en un solo acto.
        const hermanas = asig.loteId
          ? await prisma.asignacionActivo.findMany({ where: { loteId: asig.loteId }, orderBy: { creadoEn: 'asc' }, select: { id: true, activoId: true } })
          : [{ id: d.id, activoId: asig.activoId }]
        const tipo = d.destino === 'actaEntregaActivo' ? 'entrega' : 'devolucion'
        documentoId = await generarActa(tipo, hermanas.map((h) => h.activoId), asig.colaboradorId, usuario.id)
        const campo = tipo === 'entrega' ? 'actaEntregaDocId' : 'actaDevolucionDocId'
        await prisma.asignacionActivo.updateMany({
          where: { id: { in: hermanas.map((h) => h.id) } },
          data: { [campo]: documentoId },
        })
        break
      }
      default:
        throw new ErrorNegocio('Este documento no se genera desde plantilla.')
    }

    for (const ruta of ['/colaboradores', '/contratos', '/activos', '/nomina', '/sst', '/autoservicio']) {
      revalidatePath(ruta)
    }
    return { documentoId }
  },
)
