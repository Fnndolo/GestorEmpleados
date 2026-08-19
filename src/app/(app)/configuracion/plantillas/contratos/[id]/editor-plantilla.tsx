'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, Trash2, ArrowUp, ArrowDown, Save, FileText } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Ayuda } from '@/components/ui-kit/ayuda'
import { VARIABLES_PLANTILLA, variablesDesconocidas } from '@/lib/plantilla-ayuda'
import { crearPlantilla, editarPlantilla } from '../acciones'
import { TIPOS_PLANTILLA, ETIQUETA_TIPO_PLANTILLA } from '@/lib/validaciones/plantilla-contrato'

type TipoPlantilla = (typeof TIPOS_PLANTILLA)[number]
type Clausula = { titulo: string; cuerpo: string }
type Valores = {
  id: string
  nombre: string
  tipo: TipoPlantilla
  titulo: string
  intro: string
  cierre: string
  activa: boolean
  clausulas: Clausula[]
}

const NUEVA: Omit<Valores, 'id'> = {
  nombre: '',
  tipo: 'OPS',
  titulo: 'CONTRATO DE PRESTACIÓN DE SERVICIOS',
  intro: 'Entre {{empresa_razon_social}}, NIT {{empresa_nit}}, representada por {{representante_legal}}, y {{contratista_tratamiento}} {{contratista_nombre}}, {{contratista_identificada}} con cédula {{contratista_cc}}, se celebra el presente contrato que se regirá por las siguientes cláusulas:',
  cierre: 'Leído el presente contrato, las partes lo firman en {{ciudad}}, el {{fecha_suscripcion_larga}}.',
  activa: false,
  clausulas: [{ titulo: 'PRIMERA. – OBJETO:', cuerpo: 'El objeto del presente contrato es {{cargo_objeto}}.' }],
}

export function EditorPlantilla({ valores, puedeGuardar }: { valores: Valores | null; puedeGuardar: boolean }) {
  const router = useRouter()
  const [f, setF] = useState<Omit<Valores, 'id'>>(valores ?? NUEVA)
  const [guardando, setGuardando] = useState(false)

  // Variables mal escritas: se imprimirían como {{asi}} en el PDF.
  const textoCompleto = [f.intro, f.cierre, ...f.clausulas.flatMap((c) => [c.titulo, c.cuerpo])].join('\n')
  const desconocidas = variablesDesconocidas(textoCompleto)

  function setClausula(i: number, cambio: Partial<Clausula>) {
    setF({ ...f, clausulas: f.clausulas.map((c, j) => (j === i ? { ...c, ...cambio } : c)) })
  }
  function agregar() {
    setF({ ...f, clausulas: [...f.clausulas, { titulo: '', cuerpo: '' }] })
  }
  function quitar(i: number) {
    setF({ ...f, clausulas: f.clausulas.filter((_, j) => j !== i) })
  }
  function mover(i: number, delta: number) {
    const destino = i + delta
    if (destino < 0 || destino >= f.clausulas.length) return
    const copia = [...f.clausulas]
    ;[copia[i], copia[destino]] = [copia[destino], copia[i]]
    setF({ ...f, clausulas: copia })
  }

  async function guardar() {
    if (!f.nombre.trim()) { toast.error('Ponle un nombre a la plantilla.'); return }
    if (f.clausulas.length === 0) { toast.error('Agrega al menos una cláusula.'); return }
    setGuardando(true)
    const res = valores
      ? await editarPlantilla({ id: valores.id, ...f })
      : await crearPlantilla(f)
    setGuardando(false)
    if (!res.ok) { toast.error(res.error); return }
    toast.success(valores ? 'Plantilla guardada.' : 'Plantilla creada.')
    if (!valores) router.push(`/configuracion/plantillas/contratos/${(res.datos as { id: string }).id}`)
    else router.refresh()
  }

  return (
    <div className="space-y-4">
      {/* Datos generales */}
      <Card><CardContent className="grid gap-3 py-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label>Nombre (interno)</Label>
          <Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} placeholder="OPS estándar 2026" />
        </div>
        <div className="space-y-1.5">
          <Label className="flex items-center gap-1.5">
            Tipo
            <Ayuda texto="Decide en qué parte del sistema se ofrece: prestación de servicios (OPS) o contrato de trabajo." />
          </Label>
          <Select value={f.tipo} onValueChange={(v) => setF({ ...f, tipo: v as TipoPlantilla })}>
            <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
            <SelectContent>
              {TIPOS_PLANTILLA.map((t) => (
                <SelectItem key={t} value={t}>{ETIQUETA_TIPO_PLANTILLA[t]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label>Título del documento</Label>
          <Input value={f.titulo} onChange={(e) => setF({ ...f, titulo: e.target.value })} />
        </div>
        <div className="flex items-center gap-2 sm:col-span-2">
          <Switch checked={f.activa} onCheckedChange={(v) => setF({ ...f, activa: v })} />
          <Label className="flex items-center gap-1.5 font-normal">
            Activa
            <Ayuda texto="Solo las plantillas activas se ofrecen al crear un contrato. Deja inactiva la que estés redactando." />
          </Label>
        </div>
      </CardContent></Card>

      {/* Variables disponibles */}
      <Card><CardContent className="py-4">
        <p className="flex items-center gap-1.5 text-sm font-medium">
          Variables disponibles
          <Ayuda texto="Escríbelas entre llaves dobles donde deba ir el dato. Al generar el contrato se reemplazan por la información real de esa persona." />
        </p>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {VARIABLES_PLANTILLA.map((g) => (
            <div key={g.grupo}>
              <p className="text-xs font-medium text-muted-foreground">{g.grupo}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {g.vars.map((v) => (
                  <button
                    key={v.clave}
                    type="button"
                    title={v.ejemplo}
                    onClick={() => { navigator.clipboard?.writeText(`{{${v.clave}}}`); toast.success(`Copiado {{${v.clave}}}`) }}
                    className="rounded border bg-muted/50 px-1.5 py-0.5 font-mono text-[10px] hover:bg-muted"
                  >
                    {`{{${v.clave}}}`}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
        {desconocidas.length > 0 && (
          <p className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/5 p-2 text-xs text-amber-800 dark:text-amber-300">
            Estas variables no existen y se imprimirían tal cual en el PDF:{' '}
            <span className="font-mono">{desconocidas.map((v) => `{{${v}}}`).join(' ')}</span>
          </p>
        )}
      </CardContent></Card>

      {/* Texto */}
      <Card><CardContent className="space-y-3 py-4">
        <div className="space-y-1.5">
          <Label>Párrafo introductorio</Label>
          <Textarea rows={4} value={f.intro} onChange={(e) => setF({ ...f, intro: e.target.value })} />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label className="flex items-center gap-1.5">
              Cláusulas
              <Ayuda texto="Una línea que empiece con «- » se imprime como viñeta. El orden es el que ves aquí." />
            </Label>
            <Button size="sm" variant="outline" onClick={agregar}><Plus className="size-4" /> Agregar cláusula</Button>
          </div>

          {f.clausulas.map((c, i) => (
            <div key={i} className="rounded-lg border p-3">
              <div className="flex items-start gap-2">
                <span className="mt-2 w-6 shrink-0 text-center text-xs text-muted-foreground">{i + 1}</span>
                <div className="min-w-0 flex-1 space-y-2">
                  <Input
                    value={c.titulo}
                    onChange={(e) => setClausula(i, { titulo: e.target.value })}
                    placeholder="PRIMERA. – OBJETO:"
                  />
                  <Textarea
                    rows={4}
                    value={c.cuerpo}
                    onChange={(e) => setClausula(i, { cuerpo: e.target.value })}
                    placeholder="Texto de la cláusula…"
                  />
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <Button size="icon" variant="ghost" onClick={() => mover(i, -1)} disabled={i === 0} aria-label="Subir">
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => mover(i, 1)} disabled={i === f.clausulas.length - 1} aria-label="Bajar">
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => quitar(i)} disabled={f.clausulas.length === 1} aria-label="Eliminar cláusula">
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-1.5">
          <Label>Párrafo de cierre</Label>
          <Textarea rows={3} value={f.cierre} onChange={(e) => setF({ ...f, cierre: e.target.value })} />
        </div>
      </CardContent></Card>

      <div className="sticky bottom-16 flex flex-wrap justify-end gap-2 border-t bg-background/95 p-3 backdrop-blur lg:bottom-0">
        {valores && (
          <a
            href={`/api/configuracion/membrete/muestra?tipo=plantilla&plantillaId=${valores.id}`}
            target="_blank"
            rel="noreferrer"
            className={buttonVariants({ variant: 'outline', size: 'sm' }) + ' gap-2'}
          >
            <FileText className="size-4" /> Ver muestra en PDF
          </a>
        )}
        <Button size="sm" variant="ghost" onClick={() => router.push('/configuracion/plantillas/contratos')}>Volver</Button>
        {puedeGuardar && (
          <Button size="sm" onClick={guardar} disabled={guardando}>
            {guardando ? <Spinner /> : <Save className="size-4" />} Guardar
          </Button>
        )}
      </div>
    </div>
  )
}
