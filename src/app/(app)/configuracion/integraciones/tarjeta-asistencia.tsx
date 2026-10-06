'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Timer, KeyRound, ArrowRight, Images, ChevronRight, RefreshCw } from 'lucide-react'
import { Spinner } from '@/components/ui/spinner'
import { cambiarDatoCompartido, enviarFotosAsistencia } from './acciones'
import { importarHorariosAsistencia } from '@/app/(app)/horarios/acciones'
import { Switch } from '@/components/ui/switch'
import { DATOS_COMPARTIDOS, type DatoCompartido } from '@/lib/integraciones'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Chip, Pill } from '@/components/ui-kit'
import { Ayuda } from '@/components/ui-kit/ayuda'
import { DialogConectarAsistencia } from '@/components/integraciones/dialog-asistencia'

/** Estado de la conexión con AsistencIA y el botón para conectarla o cambiarla. */
export function TarjetaAsistencia({ conectada, url, compartidos }: { conectada: boolean; url: string | null; compartidos: Record<string, boolean> }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [enviando, setEnviando] = useState(false)

  const [cambiando, setCambiando] = useState<DatoCompartido | null>(null)
  const [datoAbierto, setDatoAbierto] = useState<DatoCompartido | null>(null)
  const [sincronizando, setSincronizando] = useState(false)
  const encendidos = DATOS_COMPARTIDOS.filter((d) => compartidos[d.clave] !== false).length

  // Trae de AsistencIA las plantillas y el horario de cada persona (lo mismo que
  // «Recuperar de AsistencIA» en Horarios). Lo distinto queda como cambio desde hoy.
  async function sincronizarHorarios() {
    setSincronizando(true)
    const res = await importarHorariosAsistencia({})
    setSincronizando(false)
    if (!res.ok) { toast.error(res.error, { duration: 10000 }); return }
    const r = res.datos
    toast.success(`Horarios sincronizados: ${r.personasActualizadas} persona${r.personasActualizadas === 1 ? '' : 's'} actualizada${r.personasActualizadas === 1 ? '' : 's'}, ${r.personasIguales} ya estaban igual, ${r.plantillasNuevas} plantilla${r.plantillasNuevas === 1 ? '' : 's'} nueva${r.plantillasNuevas === 1 ? '' : 's'}.`, { duration: 8000 })
    if (r.sinFicha.length) toast.warning(`En AsistencIA sin ficha activa aquí: ${r.sinFicha.join(', ')}.`, { duration: 10000 })
    router.refresh()
  }
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

          {/* Qué se comparte: una cajita cerrada con el resumen; dentro, un acordeón
              por dato con su interruptor y la acción que le toca (enviar fotos,
              ver las horas, sincronizar horarios). */}
          <details className="group/comparte mt-3 rounded-lg border">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 text-sm [&::-webkit-details-marker]:hidden">
              <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-open/comparte:rotate-90" />
              <span className="font-semibold">Qué se comparte</span>
              <Ayuda
                etiqueta="Sobre qué se comparte"
                texto={`Nunca pasan salarios, contratos, salud, cuentas bancarias, contacto ni documentos. Lo que apagues deja de salir y de entrar, aunque la clave sea correcta.${conectada ? '' : ' Puedes dejarlo listo antes de conectar.'}`}
              />
              <span className="ml-auto text-xs text-muted-foreground">{encendidos} de {DATOS_COMPARTIDOS.length}</span>
            </summary>
            <ul className="divide-y border-t">
              {DATOS_COMPARTIDOS.map((d) => {
                const activo = compartidos[d.clave] !== false
                const abiertoDato = datoAbierto === d.clave
                return (
                  <li key={d.clave}>
                    <div className="flex items-center gap-2 px-3 py-2">
                      <button type="button" onClick={() => setDatoAbierto(abiertoDato ? null : d.clave)} aria-expanded={abiertoDato} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                        <ChevronRight className={`size-3.5 shrink-0 text-muted-foreground transition-transform ${abiertoDato ? 'rotate-90' : ''}`} />
                        <span className="truncate text-sm">{d.titulo}</span>
                        {!activo && <span className="shrink-0 text-xs text-amber-700 dark:text-amber-400">Apagado</span>}
                      </button>
                      {cambiando === d.clave ? <Spinner /> : (
                        <Switch checked={activo} onCheckedChange={(v) => cambiar(d.clave, v)} disabled={cambiando !== null} aria-label={`Compartir ${d.titulo.toLowerCase()}`} />
                      )}
                    </div>
                    {abiertoDato && (
                      <div className="space-y-2 px-3 pb-3 pl-8 text-xs text-muted-foreground">
                        <p>{d.que}</p>
                        <p className={activo ? undefined : 'text-amber-700 dark:text-amber-400'}>Si se apaga: {d.siSeApaga.charAt(0).toLowerCase() + d.siSeApaga.slice(1)}</p>
                        {d.clave === 'fotos' && (
                          <Button size="sm" variant="outline" onClick={enviarFotos} disabled={!conectada || !activo || enviando}>
                            {enviando ? <Spinner /> : <Images className="size-4" />} Enviar todas las fotos
                          </Button>
                        )}
                        {d.clave === 'horas' && conectada && activo && (
                          <Link href="/nomina/novedades?grupo=horas" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                            Ver las horas extra en Nómina <ArrowRight className="size-3.5" />
                          </Link>
                        )}
                        {d.clave === 'horarios' && (
                          <Button size="sm" variant="outline" onClick={sincronizarHorarios} disabled={!conectada || !activo || sincronizando}>
                            {sincronizando ? <Spinner /> : <RefreshCw className="size-4" />} Sincronizar horarios
                          </Button>
                        )}
                        {(d.clave === 'fotos' || d.clave === 'horarios') && (!conectada || !activo) && (
                          <p>{!conectada ? 'Conecta AsistencIA para usarlo.' : 'Enciéndelo para usarlo.'}</p>
                        )}
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </details>
        </CardContent>
      </Card>
      {abierto && (
        <DialogConectarAsistencia conectada={conectada} url={url} onClose={() => setAbierto(false)} onDone={() => { setAbierto(false); router.refresh() }} />
      )}
    </>
  )
}
