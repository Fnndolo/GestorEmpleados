import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { hoyBogota } from '@/lib/fechas'
import { CalendarioLegalAnual } from './calendario-legal-anual'

export const metadata = { title: 'Calendario legal · Smart Gadgets RH' }

export default async function CalendarioLegalPage({ searchParams }: { searchParams: Promise<{ anio?: string }> }) {
  const { anio: anioParam } = await searchParams
  const usuario = await requerirPermiso('calendario_legal', 'VER')
  const puedeEditar = tienePermiso(usuario, 'calendario_legal', 'EDITAR')
  const puedeGenerar = tienePermiso(usuario, 'calendario_legal', 'CREAR')

  const hoyD = hoyBogota()
  const hoy = { anio: hoyD.getUTCFullYear(), mes: hoyD.getUTCMonth() + 1, dia: hoyD.getUTCDate() }
  const anio = anioParam && /^\d{4}$/.test(anioParam) ? Number(anioParam) : hoy.anio

  const [ocurrencias, totalObligaciones] = await Promise.all([
    prisma.ocurrenciaObligacion.findMany({
      where: { fechaLimite: { gte: new Date(Date.UTC(anio, 0, 1)), lte: new Date(Date.UTC(anio, 11, 31)) } },
      include: { obligacion: { select: { nombre: true, categoria: true, fuenteLegal: true } } },
      orderBy: { fechaLimite: 'asc' },
    }),
    prisma.obligacionLegal.count({ where: { activa: true } }),
  ])

  const items = ocurrencias.map((o) => ({
    id: o.id,
    mes: o.fechaLimite.getUTCMonth() + 1,
    dia: o.fechaLimite.getUTCDate(),
    nombre: o.obligacion.nombre,
    categoria: o.obligacion.categoria,
    fuente: o.obligacion.fuenteLegal,
    cumplida: o.estado === 'CUMPLIDA',
    vencida: o.estado !== 'CUMPLIDA' && o.fechaLimite < hoyD,
  }))

  return (
    <div className="mx-auto max-w-5xl">
      <Encabezado
        titulo="Calendario de obligaciones legales"
        descripcion={`${totalObligaciones} obligaciones recurrentes (societarias, tributarias, laborales, habeas data y SST) con alertas automáticas. Haz clic en un mes para verlo en detalle.`}
      />
      <CalendarioLegalAnual anio={anio} items={items} hoy={hoy} puedeEditar={puedeEditar} puedeGenerar={puedeGenerar} />
    </div>
  )
}
