import { NextResponse, type NextRequest } from 'next/server'
import { obtenerSesion, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { whereColaboradores, filtroBusquedaColaborador } from '@/server/consultas/colaboradores'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const usuario = await obtenerSesion()
  if (!usuario) return NextResponse.json({ resultados: [] })
  if (!tienePermiso(usuario, 'colaboradores', 'VER')) return NextResponse.json({ resultados: [] })

  // `?id=`: resolver una sola persona ya elegida (p. ej. la que llega por la URL
  // a Terminaciones) para mostrar su nombre; mismo alcance que la búsqueda.
  const id = req.nextUrl.searchParams.get('id')?.trim() ?? ''
  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (!id && q.length < 2) return NextResponse.json({ resultados: [] })

  const base = await whereColaboradores(usuario, id ? { id } : filtroBusquedaColaborador(q), { ignorarSedeActiva: true })

  const colaboradores = await prisma.colaborador.findMany({
    where: base,
    select: { id: true, nombres: true, apellidos: true, numeroDocumento: true, cargo: { select: { nombre: true } } },
    orderBy: [{ apellidos: 'asc' }],
    take: 8,
  })

  return NextResponse.json({
    resultados: colaboradores.map((c) => ({
      id: c.id,
      nombre: `${c.nombres} ${c.apellidos}`,
      detalle: `${c.cargo?.nombre ?? 'Sin cargo'} · ${c.numeroDocumento}`,
    })),
  })
}
