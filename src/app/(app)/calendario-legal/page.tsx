import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { CalendarClock } from 'lucide-react'
import { hoyBogota, formatFechaISO } from '@/lib/fechas'
import { CalendarioCliente } from './calendario-cliente'

export const metadata = { title: 'Calendario legal · Smart Gadgets RH' }

const CATEGORIA: Record<string, string> = {
  SOCIETARIO: 'Societario', TRIBUTARIO: 'Tributario', LABORAL: 'Laboral', HABEAS_DATA: 'Habeas data',
  COMERCIAL: 'Comercial', SST: 'SST', CONTRACTUAL: 'Contractual',
}

export default async function CalendarioLegalPage() {
  const usuario = await requerirPermiso('calendario_legal', 'VER')
  const puedeEditar = tienePermiso(usuario, 'calendario_legal', 'EDITAR')
  const puedeGenerar = tienePermiso(usuario, 'calendario_legal', 'CREAR')

  const hoy = hoyBogota()
  const [pendientes, totalObligaciones] = await Promise.all([
    prisma.ocurrenciaObligacion.findMany({
      where: { estado: { not: 'CUMPLIDA' } },
      include: { obligacion: true, },
      orderBy: { fechaLimite: 'asc' },
      take: 200,
    }),
    prisma.obligacionLegal.count({ where: { activa: true } }),
  ])

  const items = pendientes.map((o) => {
    const dias = Math.round((o.fechaLimite.getTime() - hoy.getTime()) / 86_400_000)
    return {
      id: o.id,
      nombre: o.obligacion.nombre,
      categoria: CATEGORIA[o.obligacion.categoria] ?? o.obligacion.categoria,
      fechaLimite: formatFechaISO(o.fechaLimite),
      fuente: o.obligacion.fuenteLegal,
      dias,
      vencida: o.fechaLimite < hoy,
    }
  })

  return (
    <div className="mx-auto max-w-4xl">
      <Encabezado
        titulo="Calendario de obligaciones legales"
        descripcion={`${totalObligaciones} obligaciones recurrentes (societarias, tributarias, laborales, habeas data y SST) con alertas automáticas.`}
      />
      {items.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
          <CalendarClock className="size-8" />
          <p>No hay obligaciones próximas. Genera el calendario para las siguientes fechas.</p>
        </CardContent></Card>
      ) : null}
      <CalendarioCliente items={items} puedeEditar={puedeEditar} puedeGenerar={puedeGenerar} />
    </div>
  )
}
