'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { MailCheck, RotateCw, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { reintentarCorreos, descartarCorreo } from './acciones'

type Mensaje = {
  id: string
  destino: string
  asunto: string
  estado: string
  intentos: number
  error: string | null
  creadoEn: string
}

export function ListaCorreos({ mensajes }: { mensajes: Mensaje[] }) {
  const router = useRouter()
  const [ocupado, setOcupado] = useState<string | null>(null)

  async function reintentar(id?: string) {
    setOcupado(id ?? 'todos')
    const res = await reintentarCorreos({ id })
    setOcupado(null)
    if (!res.ok) { toast.error(res.error); return }
    const { enviados, fallidos } = res.datos
    if (fallidos === 0) toast.success(enviados === 1 ? 'Correo enviado.' : `${enviados} correos enviados.`)
    else toast.error(`${enviados} enviados, ${fallidos} siguen fallando. Revisa el motivo.`)
    router.refresh()
  }

  async function descartar(id: string) {
    setOcupado(id)
    const res = await descartarCorreo({ id })
    setOcupado(null)
    if (!res.ok) { toast.error(res.error); return }
    toast.success('Correo descartado.')
    router.refresh()
  }

  if (mensajes.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
          <MailCheck className="size-8" />
          Todos los correos han salido bien.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button onClick={() => reintentar()} disabled={ocupado !== null}>
          {ocupado === 'todos' ? <Spinner /> : <RotateCw className="size-4" />} Reintentar todos
        </Button>
      </div>
      {mensajes.map((m) => (
        <Card key={m.id}>
          <CardContent className="space-y-2">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-medium">{m.asunto}</p>
                <p className="truncate text-sm text-muted-foreground">Para: {m.destino}</p>
              </div>
              <Badge variant={m.estado === 'FALLIDO' ? 'destructive' : 'secondary'}>
                {m.estado === 'FALLIDO' ? 'Fallido' : 'Pendiente'}
              </Badge>
            </div>
            {m.error && <p className="break-words rounded-md bg-muted p-2 text-xs">{m.error}</p>}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-muted-foreground">
                {new Date(m.creadoEn).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Bogota' })}
                {' · '}{m.intentos} {m.intentos === 1 ? 'intento' : 'intentos'}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={() => descartar(m.id)} disabled={ocupado !== null}>
                  <X className="size-4" /> Descartar
                </Button>
                <Button size="sm" variant="outline" onClick={() => reintentar(m.id)} disabled={ocupado !== null}>
                  {ocupado === m.id ? <Spinner /> : <RotateCw className="size-4" />} Reintentar
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
