import { NextResponse, type NextRequest } from 'next/server'
import { obtenerSesion, tienePermiso } from '@/server/sesion'
import { renderMuestra, renderMuestraPlantilla, TIPOS_MUESTRA, type TipoMuestra } from '@/server/pdf/muestras'

export const runtime = 'nodejs'

/**
 * Documento de muestra con datos ficticios, para revisar cómo queda el membrete
 * en cada formato sin crear un contrato de verdad ni ensuciar la base.
 */
export async function GET(req: NextRequest) {
  const usuario = await obtenerSesion()
  if (!usuario) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  if (!tienePermiso(usuario, 'configuracion', 'VER')) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const tipo = req.nextUrl.searchParams.get('tipo')
  const plantillaId = req.nextUrl.searchParams.get('plantillaId')

  // Muestra de UNA plantilla concreta, para revisarla desde su editor.
  if (tipo === 'plantilla') {
    if (!plantillaId) return NextResponse.json({ error: 'Falta la plantilla' }, { status: 400 })
    try {
      const pdf = await renderMuestraPlantilla(plantillaId)
      return new NextResponse(new Uint8Array(pdf), {
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': 'inline; filename="muestra-plantilla.pdf"',
          'Cache-Control': 'private, no-store',
        },
      })
    } catch (e) {
      console.error('No se pudo generar la muestra de la plantilla:', e)
      return NextResponse.json({ error: 'No se pudo generar la muestra' }, { status: 500 })
    }
  }

  if (!tipo || !TIPOS_MUESTRA.includes(tipo as TipoMuestra)) {
    return NextResponse.json({ error: 'Tipo de muestra desconocido' }, { status: 400 })
  }

  try {
    const pdf = await renderMuestra(tipo as TipoMuestra)
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="muestra-${tipo}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    })
  } catch (e) {
    console.error('No se pudo generar la muestra:', e)
    return NextResponse.json({ error: 'No se pudo generar la muestra' }, { status: 500 })
  }
}
