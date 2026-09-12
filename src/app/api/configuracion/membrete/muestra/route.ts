import { NextResponse, type NextRequest } from 'next/server'
import { obtenerSesion, tienePermiso } from '@/server/sesion'
import { renderMuestra, renderMuestraPlantilla, renderMuestraCuentaCobro, TIPOS_MUESTRA, type TipoMuestra } from '@/server/pdf/muestras'
import { respuestaPdf } from '@/server/pdf/respuesta-pdf'

export const runtime = 'nodejs'

/**
 * Documento de muestra con datos ficticios, para revisar cómo queda el membrete
 * (y el texto de cada plantilla) sin crear un contrato de verdad ni ensuciar la base.
 */
export async function GET(req: NextRequest) {
  const usuario = await obtenerSesion()
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!tienePermiso(usuario, 'configuracion', 'VER')) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const tipo = req.nextUrl.searchParams.get('tipo')
  const plantillaId = req.nextUrl.searchParams.get('plantillaId')
  const descargar = req.nextUrl.searchParams.get('descargar') === '1'

  // Muestra de UNA plantilla de contrato concreta, para revisarla desde su editor.
  if (tipo === 'plantilla') {
    if (!plantillaId) return NextResponse.json({ error: 'Falta la plantilla' }, { status: 400 })
    try {
      return respuestaPdf(await renderMuestraPlantilla(plantillaId), 'muestra-plantilla.pdf', descargar)
    } catch (e) {
      console.error('No se pudo generar la muestra de la plantilla:', e)
      return NextResponse.json({ error: 'No se pudo generar la muestra' }, { status: 500 })
    }
  }

  // Muestra de una plantilla de cuenta de cobro (o la de defecto), desde su editor.
  if (tipo === 'cuenta-cobro') {
    try {
      return respuestaPdf(await renderMuestraCuentaCobro(plantillaId), 'muestra-cuenta-cobro.pdf', descargar)
    } catch (e) {
      console.error('No se pudo generar la muestra de la cuenta de cobro:', e)
      return NextResponse.json({ error: 'No se pudo generar la muestra' }, { status: 500 })
    }
  }

  if (!tipo || !TIPOS_MUESTRA.includes(tipo as TipoMuestra)) {
    return NextResponse.json({ error: 'Tipo de muestra desconocido' }, { status: 400 })
  }

  try {
    return respuestaPdf(await renderMuestra(tipo as TipoMuestra), `muestra-${tipo}.pdf`, descargar)
  } catch (e) {
    console.error('No se pudo generar la muestra:', e)
    return NextResponse.json({ error: 'No se pudo generar la muestra' }, { status: 500 })
  }
}
