import { requerirSesion } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Gavel } from 'lucide-react'
import { formatFechaLarga } from '@/lib/fechas'
import { Descargos } from './descargos'

export const metadata = { title: 'Mis procesos disciplinarios · Smart Gadgets RH' }

const ETAPA: Record<string, string> = { CITACION_DESCARGOS: 'Citación a descargos', DESCARGOS: 'Descargos presentados', DECISION: 'Decisión', RECURSO: 'Recurso', CERRADO: 'Cerrado' }

export default async function MisDisciplinariosPage() {
  const usuario = await requerirSesion()

  if (!usuario.colaboradorId) {
    return (
      <div className="mx-auto max-w-3xl">
        <Encabezado titulo="Mis procesos disciplinarios" />
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Tu usuario no está vinculado a una ficha de colaborador.</CardContent></Card>
      </div>
    )
  }

  const procesos = await prisma.procesoDisciplinario.findMany({
    where: { colaboradorId: usuario.colaboradorId },
    include: { etapas: { orderBy: { fecha: 'asc' } } },
    orderBy: { creadoEn: 'desc' },
  })

  return (
    <div className="mx-auto max-w-3xl">
      <Encabezado titulo="Mis procesos disciplinarios" descripcion="Aquí puedes ver los procesos en tu contra y presentar tus descargos (derecho de defensa)." />
      {procesos.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground"><Gavel className="size-8" /><p>No tienes procesos disciplinarios.</p></CardContent></Card>
      ) : (
        <div className="space-y-4">
          {procesos.map((p) => {
            const yaPresentoDescargos = p.etapas.some((e) => e.etapa === 'DESCARGOS')
            const puedePresentar = !p.cerrado && !yaPresentoDescargos
            return (
              <Card key={p.id}>
                <CardContent className="py-4">
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <p className="font-medium">{p.asunto}</p>
                    <Badge variant={p.cerrado ? 'secondary' : 'default'}>{ETAPA[p.etapa]}</Badge>
                  </div>
                  {p.descripcion && <p className="text-sm text-muted-foreground mb-3">{p.descripcion}</p>}
                  {p.etapas.length > 0 && (
                    <ol className="space-y-2 border-l pl-4 mb-3">
                      {p.etapas.map((e) => (
                        <li key={e.id} className="relative text-sm">
                          <span className="absolute -left-[21px] top-1 size-2.5 rounded-full bg-primary" />
                          <span className="font-medium">{ETAPA[e.etapa]}</span> · <span className="text-muted-foreground">{formatFechaLarga(e.fecha)}</span>
                          {e.detalle && <p className="text-xs text-muted-foreground">{e.detalle}</p>}
                        </li>
                      ))}
                    </ol>
                  )}
                  {puedePresentar ? (
                    <Descargos procesoId={p.id} />
                  ) : yaPresentoDescargos ? (
                    <p className="text-xs text-emerald-600">Ya presentaste tus descargos. El área encargada continuará con el proceso.</p>
                  ) : (
                    <p className="text-xs text-muted-foreground">Proceso cerrado.</p>
                  )}
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
