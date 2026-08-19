import Link from 'next/link'
import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { whereColaboradores } from '@/server/consultas/colaboradores'
import { Encabezado } from '@/components/shell/encabezado'
import { Button } from '@/components/ui/button'
import { Plus, Network, Upload } from 'lucide-react'
import { ListaColaboradores } from './lista-cliente'
import { normalizarTexto } from '@/lib/texto'
import type { Prisma } from '@/generated/prisma/client'

export const metadata = { title: 'Colaboradores · Smart Gadgets RH' }

const VINCULOS = ['TODOS', 'TERMINO_INDEFINIDO', 'TERMINO_FIJO', 'OBRA_LABOR', 'APRENDIZ_SENA', 'OPS'] as const

export default async function ColaboradoresPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; q?: string }>
}) {
  const usuario = await requerirPermiso('colaboradores', 'VER')
  const { tab = 'TODOS', q = '' } = await searchParams
  const puedeCrear = tienePermiso(usuario, 'colaboradores', 'CREAR')

  const baseWhere = await whereColaboradores(usuario)
  const filtros: Prisma.ColaboradorWhereInput = { ...baseWhere }
  if (tab !== 'TODOS') filtros.tipoVinculo = tab as Prisma.ColaboradorWhereInput['tipoVinculo']
  if (q.trim()) {
    filtros.busquedaNormalizada = { contains: normalizarTexto(q) }
  }

  const [colaboradores, conteos] = await Promise.all([
    prisma.colaborador.findMany({
      where: filtros,
      include: { cargo: true, sede: { include: { ciudad: true } } },
      orderBy: [{ apellidos: 'asc' }, { nombres: 'asc' }],
      take: 200,
    }),
    prisma.colaborador.groupBy({
      by: ['tipoVinculo'],
      where: baseWhere,
      _count: true,
    }),
  ])

  const totalPorVinculo: Record<string, number> = {}
  let total = 0
  for (const c of conteos) {
    totalPorVinculo[c.tipoVinculo] = c._count
    total += c._count
  }
  totalPorVinculo['TODOS'] = total

  return (
    <div className="max-w-[1600px]">
      <Encabezado
        titulo="Colaboradores"
        descripcion="Personal de la empresa en todos sus tipos de vinculación."
        acciones={
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/colaboradores/organigrama"><Network className="size-4" /> <span className="hidden sm:inline">Organigrama</span></Link>
            </Button>
            {puedeCrear && (
              <>
                <Button variant="outline" size="sm" asChild>
                  <Link href="/colaboradores/importar"><Upload className="size-4" /> <span className="hidden sm:inline">Importar</span></Link>
                </Button>
                <Button size="sm" asChild>
                  <Link href="/colaboradores/nuevo"><Plus className="size-4" /> Nuevo</Link>
                </Button>
              </>
            )}
          </div>
        }
      />
      <ListaColaboradores
        colaboradores={colaboradores.map((c) => ({
          id: c.id,
          nombres: c.nombres,
          apellidos: c.apellidos,
          tipoDocumento: c.tipoDocumento,
          numeroDocumento: c.numeroDocumento,
          cargo: c.cargo?.nombre ?? null,
          sede: c.sede.nombre,
          ciudad: c.sede.ciudad.nombre,
          tipoVinculo: c.tipoVinculo,
          modalidadTrabajo: c.modalidadTrabajo,
          estado: c.estado,
          fotoPath: c.fotoPath,
        }))}
        tabs={VINCULOS.map((v) => ({ valor: v, conteo: totalPorVinculo[v] ?? 0 }))}
        tabActivo={tab}
        busqueda={q}
      />
    </div>
  )
}
