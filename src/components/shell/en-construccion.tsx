import { Construction } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'

export function EnConstruccion({ fase, descripcion }: { fase?: string; descripcion?: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-muted">
          <Construction className="size-7 text-muted-foreground" />
        </div>
        <div>
          <p className="font-medium">Módulo en construcción</p>
          <p className="text-sm text-muted-foreground max-w-md">
            {descripcion ?? 'Esta sección se habilita en una fase posterior del despliegue.'}
            {fase && ` (${fase})`}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
