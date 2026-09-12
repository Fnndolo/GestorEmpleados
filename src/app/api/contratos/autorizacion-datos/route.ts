import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { obtenerSesion, tienePermiso } from '@/server/sesion'
import { datosAutorizacionDeColaborador } from '@/server/contratos-autorizacion-datos'
import { renderAutorizacionDatos } from '@/server/pdf/autorizacion-datos'
import { respuestaPdf } from '@/server/pdf/respuesta-pdf'

export const runtime = 'nodejs'

/**
 * Vista previa de la autorización de tratamiento de datos (Ley 1581) tal como
 * la generará la app para un colaborador, ANTES de crear el contrato.
 *
 * No guarda nada: es para que quien da de alta el contrato vea qué va a firmar
 * el titular, con su nombre y cédula reales y no los de una muestra. Los datos
 * que aún no existen en la base (rol, ciudad, fecha) llegan por la URL desde el
 * formulario; el resto sale de la ficha.
 */
const consulta = z.object({
  colaboradorId: z.uuid(),
  vinculo: z.enum(['OPS', 'LABORAL']).default('OPS'),
  cargo: z.string().max(200).optional(),
  ciudad: z.string().max(80).optional(),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  descargar: z.string().optional(),
})

export async function GET(req: NextRequest) {
  const usuario = await obtenerSesion()
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!tienePermiso(usuario, 'contratos', 'CREAR')) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const q = consulta.safeParse(Object.fromEntries(req.nextUrl.searchParams))
  if (!q.success) return NextResponse.json({ error: 'Parámetros inválidos' }, { status: 400 })

  try {
    const datos = await datosAutorizacionDeColaborador({
      colaboradorId: q.data.colaboradorId,
      vinculo: q.data.vinculo,
      contrato: { cargoObjeto: q.data.cargo, ciudad: q.data.ciudad, fechaSuscripcion: q.data.fecha },
    })
    const pdf = await renderAutorizacionDatos(datos)
    return respuestaPdf(pdf, 'autorizacion-datos-vista-previa.pdf', q.data.descargar === '1')
  } catch (e) {
    console.error('No se pudo generar la vista previa de la autorización de datos:', e)
    return NextResponse.json({ error: 'No se pudo generar la vista previa' }, { status: 500 })
  }
}
