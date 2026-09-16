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

      <div className={cn('self-start', vista === 'preview' && 'hidden xl:block')}>
        <Card><CardContent className="space-y-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">Texto del documento</p>
            <Badge variant={personalizada ? 'default' : 'secondary'}>{personalizada ? 'Personalizado' : 'De la aplicación'}</Badge>
            {cambiado && <Badge variant="outline">Cambios sin guardar</Badge>}
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
            <p className="text-xs text-muted-foreground">
              Cada línea es un párrafo. Para resaltar, escribe <code>**negrita**</code> o <code>__subrayado__</code>.
              Para listas, empieza la línea con <code>- </code> (viñeta), <code>✓ </code> (casilla) o <code>1. </code> (numeración);
              con <code>~ </code> la línea va en letra pequeña debajo de la firma.
              Los datos de la persona y de la empresa se llenan solos con las variables; el bloque de firma lo agrega la app.
            </p>
          </div>

          <div>
            <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Variables (clic para insertar)</p>
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
            <ul className="mt-2 grid gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground sm:grid-cols-2">
              {VARIABLES_AUTORIZACION.map((v) => (
                <li key={v.clave}><span className="font-mono text-foreground">{v.clave}</span> · {v.descripcion}</li>
              ))}
            </ul>
          </div>

          {puedeEditar && (
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="ghost" size="sm" onClick={restaurar} disabled={guardando || (!personalizada && !cambiado)}>
                <RotateCcw className="size-4" /> Texto de la aplicación
              </Button>
              <Button size="sm" onClick={guardar} disabled={guardando || !cambiado || !valido}>
                {guardando ? <Spinner /> : <Save className="size-4" />} Guardar
              </Button>
            </div>
          )}
        </CardContent></Card>
      </div>

      <div className={cn('space-y-2', vista === 'editar' && 'hidden xl:block')}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span>Vista previa con datos de muestra</span>
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
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            <FileText className="size-4" /> PDF de muestra{cambiado ? ' (texto guardado)' : ''}
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
