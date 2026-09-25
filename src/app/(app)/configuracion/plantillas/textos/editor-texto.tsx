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
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { TEXTOS, type ClaveTexto, type TextoDocumento } from '@/lib/plantillas-documento/textos'
import { PreviewTexto } from '@/components/plantillas/preview-texto'
import { VisorPdf } from '@/components/documentos/visor-pdf'
import { guardarPlantillaTexto, restaurarPlantillaTexto } from './acciones'

export type EmpresaPreview = {
  razonSocial: string
  nombreComercial: string
  nit: string
  direccion?: string | null
  telefono?: string | null
  emailContacto?: string | null
}

/**
 * Editor de uno de los textos de documento (actas de Mis entregas, orden de
 * pago de horas extra, certificaciones): título y contenido con variables,
 * vista previa al instante con datos de muestra y PDF de muestra con el texto
 * guardado. Es el mismo editor para todos; lo que cambia es la definición
 * (`TEXTOS[clave]`): variables, si lleva tabla y qué variantes se pueden ver.
 */
export function EditorTexto({
  clave, plantilla, personalizada, puedeEditar, empresa,
}: {
  clave: ClaveTexto
  plantilla: TextoDocumento
  personalizada: boolean
  puedeEditar: boolean
  empresa: EmpresaPreview
}) {
  const def = TEXTOS[clave]
  const router = useRouter()
  const [titulo, setTitulo] = useState(plantilla.titulo)
  const [contenido, setContenido] = useState(plantilla.contenido)
  const [usaMembrete, setUsaMembrete] = useState(plantilla.usaMembrete)
  const [variante, setVariante] = useState(def.variantes[0]?.valor ?? '')
  const [guardando, setGuardando] = useState(false)
  // Móvil: alterna entre editar y ver el documento (en xl se muestran ambos).
  const [vista, setVista] = useState<'editar' | 'preview'>('editar')
  const area = useRef<HTMLTextAreaElement>(null)

  const cambiado = titulo !== plantilla.titulo || contenido !== plantilla.contenido || usaMembrete !== plantilla.usaMembrete
  const valido = titulo.trim().length >= 3 && contenido.trim().length >= 5
  const id = clave.toLowerCase().replace(/_/g, '-')

  /** Inserta un trozo donde está el cursor del texto. */
  function insertar(token: string, enLineaAparte = false) {
    const el = area.current
    if (!el) { setContenido((c) => c + token); return }
    const inicio = el.selectionStart ?? contenido.length
    const fin = el.selectionEnd ?? inicio
    let trozo = token
    if (enLineaAparte) {
      const antes = contenido.slice(0, inicio)
      const despues = contenido.slice(fin)
      trozo = `${antes && !antes.endsWith('\n') ? '\n' : ''}${token}${despues && !despues.startsWith('\n') ? '\n' : ''}`
    }
    setContenido(contenido.slice(0, inicio) + trozo + contenido.slice(fin))
    requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(inicio + trozo.length, inicio + trozo.length)
    })
  }

  async function guardar() {
    setGuardando(true)
    const res = await guardarPlantillaTexto({ clave, titulo, contenido, usaMembrete })
    setGuardando(false)
    if (res.ok) {
      toast.success('Texto guardado. Aplica desde el próximo documento que se genere.')
      router.refresh()
    } else toast.error(res.error)
  }

  async function restaurar() {
    if (!confirm('¿Volver al texto que trae la aplicación? Se pierde el texto personalizado guardado.')) return
    setGuardando(true)
    const res = await restaurarPlantillaTexto({ clave })
    setGuardando(false)
    if (res.ok) {
      setTitulo(def.defecto.titulo)
      setContenido(def.defecto.contenido)
      setUsaMembrete(def.membrete)
      toast.success('Se restauró el texto de la aplicación.')
      router.refresh()
    } else toast.error(res.error)
  }

  const urlMuestra = `/api/configuracion/membrete/muestra?tipo=texto&clave=${clave}${variante ? `&variante=${variante}` : ''}`

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

          {/* Papel membretado o encabezado sencillo: se ve al instante en la vista previa. */}
          <div className="flex items-start justify-between gap-3 rounded-lg border bg-muted/30 px-3 py-2.5">
            <div className="min-w-0">
              <Label htmlFor={`${id}-membrete`} className="text-sm font-medium">Papel membretado</Label>
              <p className="text-xs text-muted-foreground">{usaMembrete ? 'Con logo y pie de contacto' : 'Encabezado sencillo con nombre y NIT'}</p>
            </div>
            <Switch id={`${id}-membrete`} checked={usaMembrete} onCheckedChange={setUsaMembrete} disabled={!puedeEditar} aria-label="Usar papel membretado" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${id}-titulo`}>Título</Label>
            <Input id={`${id}-titulo`} value={titulo} onChange={(e) => setTitulo(e.target.value)} disabled={!puedeEditar} spellCheck lang="es" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`${id}-contenido`}>Contenido</Label>
            <Textarea
              id={`${id}-contenido`}
              ref={area}
              rows={def.tabla ? 12 : 14}
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
              {def.tabla && (
                <button
                  type="button"
                  title={def.tabla}
                  disabled={!puedeEditar}
                  onClick={() => insertar('[tabla]', true)}
                  className="rounded-md border border-primary/30 bg-primary/5 px-2 py-0.5 font-mono text-[11px] transition-colors hover:bg-accent disabled:opacity-60"
                >
                  [tabla]
                </button>
              )}
              {def.variables.map((v) => (
                <button
                  key={v.clave}
                  type="button"
                  title={v.descripcion}
                  disabled={!puedeEditar}
                  onClick={() => insertar(`{{${v.clave}}}`)}
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
                Lo que va entre <code>[[ ]]</code> solo sale si sus variables tienen valor.{def.tabla && <> <code>[tabla]</code> marca dónde va la tabla.</>} {def.fijo}
              </p>
              <ul className="mt-1.5 grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
              {def.tabla && <li><span className="font-mono text-foreground">[tabla]</span> · {def.tabla}</li>}
              {def.variables.map((v) => (
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
            {def.variantes.length > 0 && (
              <Select value={variante} onValueChange={setVariante}>
                <SelectTrigger size="sm" className="h-7 w-auto text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {def.variantes.map((v) => <SelectItem key={v.valor} value={v.valor}>{v.etiqueta}</SelectItem>)}
                </SelectContent>
              </Select>
            )}
          </div>
          {/* El PDF real (texto guardado + datos de muestra) se abre aquí mismo, en el visor embebido. */}
          <VisorPdf url={urlMuestra} titulo={`Muestra · ${def.nombre}`} className={buttonVariants({ size: 'sm' })}>
            <FileText className="size-4" /> <span className="hidden sm:inline">PDF de muestra{cambiado ? ' (texto guardado)' : ''}</span>
          </VisorPdf>
        </div>
        {/* Vive dentro de una ventana emergente que ya hace scroll: sin sticky ni alto fijo. */}
        <div className="rounded-lg border bg-muted/30 p-3">
          <PreviewTexto clave={clave} plantilla={{ titulo, contenido }} membrete={usaMembrete} variante={variante} empresa={empresa} />
        </div>
      </div>
    </div>
  )
}
