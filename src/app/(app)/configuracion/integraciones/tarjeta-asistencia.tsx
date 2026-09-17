'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Timer, KeyRound, ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Chip, Pill } from '@/components/ui-kit'
import { DialogConectarAsistencia } from '@/components/integraciones/dialog-asistencia'

/** Estado de la conexión con AsistencIA y el botón para conectarla o cambiarla. */
export function TarjetaAsistencia({ conectada, url }: { conectada: boolean; url: string | null }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)

  return (
    <>
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Chip icono={Timer} color="bg-foreground text-background" className="size-10 rounded-[10px]" iconClassName="size-5" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">AsistencIA · control de asistencia</p>
              <p className="text-xs text-muted-foreground">
                {conectada ? `Conectada a ${url}` : 'Horas extra calculadas de las marcaciones de entrada y salida.'}
              </p>
            </div>
            <Pill tone={conectada ? 'ok' : 'warn'}>{conectada ? 'Conectada' : 'Sin conectar'}</Pill>
            <Button size="sm" onClick={() => setAbierto(true)}>
              <KeyRound className="size-4" /> {conectada ? 'Cambiar clave' : 'Conectar'}
            </Button>
          </div>
          <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
            <p>La clave la genera AsistencIA en <b>Ajustes → Mi empresa → Clave de API</b>; solo el administrador la pega aquí.</p>
            <p>Con ella, Nómina lee las horas extra de cada quincena, las trae como novedades y le avisa a AsistencIA qué quedó pagado al cerrar el periodo.</p>
          </div>
          {conectada && (
            <Link href="/nomina/novedades?grupo=horas" className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
              Ver las horas extra en Nómina <ArrowRight className="size-4" />
            </Link>
          )}
        </CardContent>
      </Card>
      {abierto && (
        <DialogConectarAsistencia conectada={conectada} url={url} onClose={() => setAbierto(false)} onDone={() => { setAbierto(false); router.refresh() }} />
      )}
    </>
  )
}
