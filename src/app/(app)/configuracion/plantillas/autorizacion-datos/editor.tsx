'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Save, RotateCcw, FileText, Eye, PencilLine } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  autorizacionPorDefecto, VARIABLES_AUTORIZACION, type DatosAutorizacion, type PlantillaAutorizacion, type VinculoAutorizacion,
} from '@/lib/plantillas-documento/autorizacion-datos'
import { PreviewAutorizacion } from '@/components/plantillas/preview-autorizacion'
import { VisorPdf } from '@/components/documentos/visor-pdf'
import { guardarPlantillaAutorizacion, restaurarPlantillaAutorizacion } from './acciones'

/** Datos ficticios (y se nota) para la vista previa; los de la empresa son reales. */
const MUESTRA = {
  ciudadFecha: 'Ciudad de muestra, uno (01) de enero de 2026.',
  nombre: 'NOMBRE DE MUESTRA APELLIDO APELLIDO',
  cedula: '1.000.000.000 de Ciudad (X)',
  cargo: 'CARGO DE MUESTRA',
}

export function EditorAutorizacion({
  vinculo, plantilla, personalizada, puedeEditar, empresa,
}: {
  /** Qué autorización se edita: cada vínculo tiene la suya. */
  vinculo: VinculoAutorizacion
  plantilla: PlantillaAutorizacion
  personalizada: boolean
  puedeEditar: boolean
  empresa: DatosAutorizacion['empresa']
}) {
  const router = useRouter()
  const [titulo, setTitulo] = useState(plantilla.titulo)
  const [contenido, setContenido] = useState(plantilla.contenido)
  const [genero, setGenero] = useState<'FEMENINO' | 'MASCULINO'>('FEMENINO')
  const [guardando, setGuardando] = useState(false)
  // Móvil: alterna entre editar y ver el documento (en xl se muestran ambos).
  const [vista, setVista] = useState<'editar' | 'preview'>('editar')
  const area = useRef<HTMLTextAreaElement>(null)

  const cambiado = titulo !== plantilla.titulo || contenido !== plantilla.contenido
  const valido = titulo.trim().length >= 3 && contenido.trim().length >= 20

  /** Inserta {{clave}} donde está el cursor del texto. */
  function insertar(clave: string) {
    const token = `{{${clave}}}`
    const el = area.current
    if (!el) { setContenido((c) => c + token); return }
    const inicio = el.selectionStart ?? contenido.length
    const fin = el.selectionEnd ?? inicio
    setContenido(contenido.slice(0, inicio) + token + contenido.slice(fin))
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(inicio + token.length, inicio + token.length)
    })
  }

  async function guardar() {
    setGuardando(true)
    const res = await guardarPlantillaAutorizacion({ vinculo, titulo, contenido })
    setGuardando(false)
    if (res.ok) {
      toast.success('Texto guardado. Aplica desde el próximo documento que se genere.')
      router.refresh()
    } else toast.error(res.error)
  }

  async function restaurar() {
    if (!confirm('¿Volver al texto que trae la aplicación? Se pierde el texto personalizado guardado.')) return
    setGuardando(true)
    const res = await restaurarPlantillaAutorizacion({ vinculo })
    setGuardando(false)
    if (res.ok) {
      const defecto = autorizacionPorDefecto(vinculo)
      setTitulo(defecto.titulo)
      setContenido(defecto.contenido)
      toast.success('Se restauró el texto de la aplicación.')
      router.refresh()
    } else toast.error(res.error)
  }

  const datos: DatosAutorizacion = { ...MUESTRA, genero, vinculo, empresa }

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {/* Pestañas Editar / Vista previa — solo en pantallas menores a xl */}
      <div className="flex gap-1.5 rounded-lg border bg-muted/40 p-1 xl:hidden">
        <button type="button" onClick={() => setVista('editar')} className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium', vista === 'editar' ? 'bg-card shadow-sm' : 'text-muted-foreground')}>
          <PencilLine className="size-4" /> Editar
        </button>
        <button type="button" onClick={() => setVista('preview')} className={cn('flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium', vista === 'preview' ? 'bg-card shadow-sm' : 'text-muted-foreground')}>
          <Eye className="size-4" /> Vista previa
        </button>
      </div>

      {/* min-w-0 en las celdas: una celda de grid no encoge por debajo de su contenido, y
          la hoja (816 px) no se escalaba al ancho del celular. */}
      <div className={cn('min-w-0 self-start', vista === 'preview' && 'hidden xl:block')}>
        <Card><CardContent className="space-y-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={personalizada ? 'default' : 'secondary'}>{personalizada ? 'Personalizado' : 'De la app'}</Badge>
            {cambiado && <Badge variant="outline">Sin guardar</Badge>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="autorizacion-titulo">Título</Label>
            <Input id="autorizacion-titulo" value={titulo} onChange={(e) => setTitulo(e.target.value)} disabled={!puedeEditar} spellCheck lang="es" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="autorizacion-contenido">Contenido</Label>
            <Textarea
              id="autorizacion-contenido"
              ref={area}
              rows={18}
              value={contenido}
              onChange={(e) => setContenido(e.target.value)}
              disabled={!puedeEditar}
              spellCheck lang="es"
              className="text-sm leading-relaxed"
            />
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Variables</p>
            <div className="flex flex-wrap gap-1.5">
              {VARIABLES_AUTORIZACION.map((v) => (
                <button
                  key={v.clave}
                  type="button"
                  title={v.descripcion}
                  disabled={!puedeEditar}
                  onClick={() => insertar(v.clave)}
                  className="rounded-md border bg-muted/40 px-2 py-0.5 font-mono text-[11px] transition-colors hover:bg-accent disabled:opacity-60"
                >
                  {`{{${v.clave}}}`}
                </button>
              ))}
            </div>
            {/* Instrucciones y qué es cada variable: plegadas, para que el editor no sea un muro de texto. */}
            <details className="mt-2 text-[11px] text-muted-foreground">
              <summary className="cursor-pointer select-none font-medium text-foreground">¿Cómo dar formato?</summary>
              <p className="mt-1.5">
                Cada línea es un párrafo. <code>**negrita**</code>, <code>__subrayado__</code>. Listas: <code>- </code> viñeta, <code>✓ </code> casilla, <code>1. </code> numeración; <code>~ </code> letra pequeña bajo la firma.
                 Los datos se llenan solos con las variables; la firma la agrega la app.
              </p>
            <ul className="mt-1.5 grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
              {VARIABLES_AUTORIZACION.map((v) => (
                <li key={v.clave}><span className="font-mono text-foreground">{v.clave}</span> · {v.descripcion}</li>
              ))}
            </ul>
            </details>
          </div>

          {puedeEditar && (
            <div className="flex flex-wrap justify-end gap-2">
              {/* Solo ícono en el celular. */}
              <Button variant="ghost" size="sm" onClick={restaurar} disabled={guardando || (!personalizada && !cambiado)} aria-label="Volver al texto de la aplicación" title="Volver al texto de la aplicación">
                <RotateCcw className="size-4" /> <span className="hidden sm:inline">Texto de la aplicación</span>
              </Button>
              <Button size="sm" onClick={guardar} disabled={guardando || !cambiado || !valido} aria-label="Guardar" title="Guardar">
                {guardando ? <Spinner /> : <Save className="size-4" />} <span className="hidden sm:inline">Guardar</span>
              </Button>
            </div>
          )}
        </CardContent></Card>
      </div>

      <div className={cn('min-w-0 space-y-2', vista === 'editar' && 'hidden xl:block')}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Select value={genero} onValueChange={(v) => setGenero(v as 'FEMENINO' | 'MASCULINO')}>
              <SelectTrigger size="sm" className="h-7 w-auto text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="FEMENINO">Femenino</SelectItem>
                <SelectItem value="MASCULINO">Masculino</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {/* El PDF real (texto guardado + datos de muestra) se abre aquí mismo, en el visor embebido. */}
          <VisorPdf
            url={`/api/configuracion/membrete/muestra?tipo=${vinculo === 'LABORAL' ? 'autorizacion-laboral' : 'autorizacion'}`}
            titulo={`Muestra · Autorización de datos · ${vinculo === 'LABORAL' ? 'Contrato laboral' : 'Contrato OPS'}`}
            className={buttonVariants({ size: 'sm' })}
          >
            <FileText className="size-4" /> <span className="hidden sm:inline">PDF de muestra{cambiado ? ' (texto guardado)' : ''}</span>
          </VisorPdf>
        </div>
        {/* Vive dentro de una ventana emergente que ya hace scroll: sin sticky ni alto fijo. */}
        <div className="rounded-lg border bg-muted/30 p-3">
          <PreviewAutorizacion plantilla={{ titulo, contenido }} datos={datos} />
        </div>
      </div>
    </div>
  )
}
