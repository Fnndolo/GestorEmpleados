'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Timer, KeyRound, ArrowRight, Images } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { enviarFotosAsistencia } from './acciones'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Chip, Pill } from '@/components/ui-kit'
import { DialogConectarAsistencia } from '@/components/integraciones/dialog-asistencia'

/** Estado de la conexión con AsistencIA y el botón para conectarla o cambiarla. */
export function TarjetaAsistencia({ conectada, url }: { conectada: boolean; url: string | null }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [enviando, setEnviando] = useState(false)

  async function enviarFotos() {
    setEnviando(true)
    const res = await enviarFotosAsistencia({})
    setEnviando(false)
    if (!res.ok) { toast.error(res.error, { duration: 8000 }); return }
    const r = res.datos
    toast.success(`${r.enviadas} foto${r.enviadas === 1 ? '' : 's'} enviada${r.enviadas === 1 ? '' : 's'} a AsistencIA${r.sinFoto ? ` · ${r.sinFoto} sin foto aquí` : ''}.`)
    if (r.noExisten.length) {
      toast.warning(`${r.noExisten.length} persona(s) no existen en AsistencIA (créalas allá primero): ${r.noExisten.map((x) => x.nombre).join(', ')}.`, { duration: 10000 })
    }
    if (r.fallidas.length) {
      toast.error(`No se pudieron enviar ${r.fallidas.length}: ${r.fallidas.map((x) => x.nombre).join(', ')}.`, { duration: 10000 })
    }
  }

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
            <p>Con ella, Nómina lee las horas extra de cada quincena, las trae como novedades y le avisa a AsistencIA qué quedó pagado al cerrar el periodo. La foto de perfil que se pone o se quita aquí se replica allá por cédula.</p>
          </div>
          {conectada && (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button size="sm" onClick={enviarFotos} disabled={enviando} title="Manda a AsistencIA la foto de perfil de todos los colaboradores activos">
                {enviando ? <Spinner /> : <Images className="size-4" />} Enviar fotos de perfil
              </Button>
              <Link href="/nomina/novedades?grupo=horas" className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline">
                Ver las horas extra en Nómina <ArrowRight className="size-4" />
              </Link>
            </div>
          )}
        </CardContent>
      </Card>
      {abierto && (
        <DialogConectarAsistencia conectada={conectada} url={url} onClose={() => setAbierto(false)} onDone={() => { setAbierto(false); router.refresh() }} />
      )}
    </>
  )
}
