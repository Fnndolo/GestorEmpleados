import { NextResponse, type NextRequest } from 'next/server'
import { obtenerSesion, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { whereColaboradores, filtroBusquedaColaborador } from '@/server/consultas/colaboradores'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const usuario = await obtenerSesion()
  if (!usuario) return NextResponse.json({ resultados: [] })
  if (!tienePermiso(usuario, 'colaboradores', 'VER')) return NextResponse.json({ resultados: [] })

  const q = req.nextUrl.searchParams.get('q')?.trim() ?? ''
  if (q.length < 2) return NextResponse.json({ resultados: [] })

  const base = await whereColaboradores(usuario, filtroBusquedaColaborador(q), { ignorarSedeActiva: true })

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
