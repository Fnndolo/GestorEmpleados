'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Timer, KeyRound, ArrowRight, Images } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { cambiarDatoCompartido, enviarFotosAsistencia } from './acciones'
import { Switch } from '@/components/ui/switch'
import { DATOS_COMPARTIDOS, type DatoCompartido } from '@/lib/integraciones'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Chip, Pill } from '@/components/ui-kit'
import { Ayuda } from '@/components/ui-kit/ayuda'
import { DialogConectarAsistencia } from '@/components/integraciones/dialog-asistencia'

/**
 * Una línea por dato compartido, encendido y apagado. La explicación completa
 * (la de lib/integraciones) queda detrás del ⓘ de cada fila.
 */
const CORTO: Record<DatoCompartido, { que: string; apagado: string }> = {
  colaboradores: { que: 'Nombre, cédula, sede y si sigue activo', apagado: 'no llegan ingresos ni retiros' },
  fotos: { que: 'La foto de perfil, en las dos direcciones', apagado: 'cada plataforma con sus fotos' },
  horas: { que: 'Horas extra y recargos para Nómina', apagado: 'horas extra a mano' },
  horarios: { que: 'El horario de cada persona', apagado: 'el horario se cambia en ambas' },
}

/** Estado de la conexión con AsistencIA y el botón para conectarla o cambiarla. */
export function TarjetaAsistencia({ conectada, url, compartidos }: { conectada: boolean; url: string | null; compartidos: Record<string, boolean> }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [enviando, setEnviando] = useState(false)

  const [cambiando, setCambiando] = useState<DatoCompartido | null>(null)
  async function cambiar(dato: DatoCompartido, activo: boolean) {
    setCambiando(dato)
    const res = await cambiarDatoCompartido({ dato, activo })
    setCambiando(null)
    if (!res.ok) { toast.error(res.error); return }
    const titulo = DATOS_COMPARTIDOS.find((d) => d.clave === dato)!.titulo
    toast.success(activo ? `${titulo}: se comparte con AsistencIA.` : `${titulo}: ya no se comparte con AsistencIA.`)
    router.refresh()
  }

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

  const textoBoton = conectada ? 'Cambiar clave' : 'Conectar'

  return (
    <>
      <Card className="py-0">
        <CardContent className="p-3 sm:p-4">
          <div className="flex items-center gap-3">
            {/* En el celular el chip se va: el estado y la llave caben en la fila sin cortar el nombre. */}
            <Chip icono={Timer} color="bg-foreground text-background" className="size-10 rounded-[10px] max-sm:hidden" iconClassName="size-5" />
            <div className="min-w-0 flex-1">
              <p className="flex min-w-0 items-center gap-1.5 text-sm font-bold">
                <span className="truncate">AsistencIA</span>
                <Ayuda
                  etiqueta="Sobre AsistencIA"
                  texto="La clave la genera AsistencIA en Ajustes → Mi empresa → Clave de API; solo el administrador la pega aquí. Con ella, Nómina trae las horas extra de cada quincena como novedades y le avisa a AsistencIA qué quedó pagado al cerrar el periodo."
                />
              </p>
              <p className="truncate text-xs text-muted-foreground" title={conectada ? url ?? undefined : undefined}>
                {conectada ? `Conectada a ${url}` : 'Control de asistencia'}
              </p>
            </div>
            <Pill tone={conectada ? 'ok' : 'warn'}>{conectada ? 'Conectada' : 'Sin conectar'}</Pill>
            <Button size="sm" onClick={() => setAbierto(true)} aria-label={textoBoton} title={textoBoton} className="max-sm:size-8 max-sm:px-0">
              <KeyRound className="size-4" /> <span className="max-sm:sr-only">{textoBoton}</span>
            </Button>
          </div>

          <div className="mt-4 space-y-2">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              Qué se comparte
              <Ayuda
                etiqueta="Sobre qué se comparte"
                texto={`Nunca pasan salarios, contratos, salud, cuentas bancarias, contacto ni documentos. Lo que apagues aquí deja de salir y de entrar, aunque la clave sea correcta.${conectada ? '' : ' Puedes dejarlo listo antes de conectar: se aplica apenas conectes AsistencIA.'}`}
              />
            </p>
            <ul className="divide-y rounded-lg border">
              {DATOS_COMPARTIDOS.map((d) => {
                const activo = compartidos[d.clave] !== false
                return (
                  <li key={d.clave} className="flex items-center gap-3 px-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 text-sm font-medium">
                        {d.titulo}
                        <Ayuda texto={`${d.que} Si se apaga: ${d.siSeApaga.charAt(0).toLowerCase()}${d.siSeApaga.slice(1)}`} etiqueta={`Sobre ${d.titulo.toLowerCase()}`} />
                      </p>
                      {activo
                        ? <p className="truncate text-xs text-muted-foreground">{CORTO[d.clave].que}</p>
                        : <p className="truncate text-xs text-amber-700 dark:text-amber-400">Apagado: {CORTO[d.clave].apagado}</p>}
                    </div>
                    {cambiando === d.clave ? <Spinner /> : (
                      <Switch checked={activo} onCheckedChange={(v) => cambiar(d.clave, v)} disabled={cambiando !== null} aria-label={`Compartir ${d.titulo.toLowerCase()}`} />
                    )}
                  </li>
                )
              })}
            </ul>
          </div>

          {conectada && (
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
              <Button size="sm" onClick={enviarFotos} disabled={enviando || compartidos.fotos === false} title="Manda a AsistencIA la foto de perfil de todos los colaboradores activos">
                {enviando ? <Spinner /> : <Images className="size-4" />} Enviar fotos
              </Button>
              <Link href="/nomina/novedades?grupo=horas" className="inline-flex items-center gap-1 whitespace-nowrap text-sm font-medium text-primary hover:underline">
                Horas extra en Nómina <ArrowRight className="size-4" />
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
