'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { accion, ErrorNegocio } from '@/server/accion'
import { ErrorPermiso } from '@/server/sesion'
import { adjuntarDocumento, permisoDestino, duenoPuedeAdjuntar, motivoCerrado, type DestinoDocumento } from '@/server/documentos-adjuntos'

const DESTINOS = [
  'certificacion', 'desprendible', 'cuentaCobro',
  'actaEntregaActivo', 'actaDevolucionActivo', 'recibidoDotacion', 'soporteEpp',
  'prorroga', 'otrosi',
] as const

const schema = z.object({
  destino: z.enum(DESTINOS),
  id: z.uuid(),
  pdfBase64: z.string().min(1, 'Adjunta el PDF').startsWith('data:application/pdf', 'El archivo debe ser un PDF'),
  nombre: z.string().trim().max(200).optional().or(z.literal('')),
})

/**
 * Adjunta un PDF propio en un destino donde el sistema normalmente genera uno.
 *
 * El permiso depende del destino —no es lo mismo tocar un desprendible que un
 * acta de EPP—, así que se valida adentro contra el registro en vez de fijar un
 * módulo único en el envoltorio. `accion()` sigue encargándose de la sesión, la
 * validación zod y el contexto de auditoría.
 */
export const adjuntarDocumentoGenerado = accion(
  // El envoltorio solo exige poder VER documentos —el permiso más básico, que
  // hasta un contratista tiene sobre lo suyo—: la autorización de verdad se
  // decide abajo, por destino. Poner aquí 'documentos:CREAR' dejaría fuera al
  // contratista antes de llegar a la comprobación de dueño.
  { modulo: 'documentos', accion: 'VER', schema },
  async (d, usuario) => {
    const destino = d.destino as DestinoDocumento
    const { modulo, accion: acc } = permisoDestino(destino)
    const porModulo = usuario.permisos.some((p) => p.modulo === modulo && p.accion === acc)
    if (!porModulo) {
      // Segunda vía: el dueño del registro. Es lo que deja al contratista subir
      // SU cuenta de cobro sin darle permisos sobre el módulo de contratos.
      const comoDueno = await duenoPuedeAdjuntar(destino, d.id, usuario.colaboradorId)
      if (comoDueno === 'ya-cerrado') throw new ErrorNegocio(motivoCerrado(destino))
      if (comoDueno === 'no-es-suyo') throw new ErrorPermiso(modulo, acc)
    }

    const res = await adjuntarDocumento({
      destino,
      id: d.id,
      pdfBase64: d.pdfBase64,
      nombre: d.nombre,
      usuarioId: usuario.id,
    })

    // Las pantallas que muestran estos documentos son varias; se refrescan las
    // que de verdad los listan.
    for (const ruta of ['/colaboradores', '/contratos', '/activos', '/nomina', '/sst', '/autoservicio']) {
      revalidatePath(ruta)
    }
    return res
  },
)
