import { requerirPermiso } from '@/server/sesion'
import { tramiteAplica, NoAplica } from '../no-aplica'
import { prisma } from '@/lib/db'
import { formatFechaCorta } from '@/lib/fechas'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { GraduationCap } from 'lucide-react'

export const metadata = { title: 'Mis capacitaciones · Smart Gadgets RH' }

const TIPO: Record<string, string> = { INDUCCION: 'Inducción', REINDUCCION: 'Reinducción', FORMACION: 'Formación', SST: 'SST' }

/** Historial de formación del colaborador — RIT art. 95: cada trabajador puede consultar su historial. */
export default async function MisCapacitacionesPage() {
  const usuario = await requerirPermiso('autoservicio', 'VER')

  if (!usuario.colaboradorId) {
    return (
      <div className="max-w-5xl">
        <Encabezado titulo="Mis capacitaciones" descripcion="" />
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          Tu usuario no está vinculado a una ficha de colaborador.
        </CardContent></Card>
      </div>
    )
  }

  if (!(await tramiteAplica(usuario.colaboradorId, 'capacitaciones'))) {
    return <NoAplica titulo="Mis capacitaciones" motivo="Las capacitaciones de la empresa aplican a la relación laboral. Si necesitas una constancia de formación, escribe a Talento Humano." />
  }

  const asistencias = await prisma.asistenciaCapacitacion.findMany({
    where: { colaboradorId: usuario.colaboradorId },
    include: { capacitacion: true },
    orderBy: { capacitacion: { fecha: 'desc' } },
  })

  const horas = asistencias.reduce((t, a) => t + Number(a.capacitacion.duracionHoras ?? 0), 0)

  return (
    <div className="max-w-5xl">
      <Encabezado
        titulo="Mis capacitaciones"
        descripcion={`Tu historial de formación (RIT art. 95)${horas > 0 ? ` · ${horas} horas acumuladas` : ''}.`}
      />
      {asistencias.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
          <GraduationCap className="size-8" /><p>Aún no tienes capacitaciones registradas.</p>
        </CardContent></Card>
      ) : (
        <Card><CardContent className="divide-y p-0">
          {asistencias.map((a) => (
            <div key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-violet-500/12 text-violet-600 dark:text-violet-400">
                <GraduationCap className="size-[18px]" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{a.capacitacion.titulo}</p>
                <p className="text-xs text-muted-foreground">
                  {formatFechaCorta(a.capacitacion.fecha)}
                  {a.capacitacion.duracionHoras ? ` · ${Number(a.capacitacion.duracionHoras)}h` : ''}
                  {a.capacitacion.facilitador ? ` · ${a.capacitacion.facilitador}` : ''}
                </p>
              </div>
              <Badge variant="outline">{TIPO[a.capacitacion.tipo]}</Badge>
              {a.evaluacion != null && (
                <Badge variant="secondary" className="tabular-nums">Nota: {Number(a.evaluacion)}</Badge>
              )}
            </div>
          ))}
        </CardContent></Card>
      )}
    </div>
  )
}
