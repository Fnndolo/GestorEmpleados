'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import imageCompression from 'browser-image-compression'
import { toast } from 'sonner'
import {
  Upload, FileText, Image as ImageIcon, Trash2, ExternalLink, CircleCheck, TriangleAlert, Clock,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent } from '@/components/ui/card'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatFechaCorta } from '@/lib/fechas'
import { borrarDocumento } from '@/app/(app)/colaboradores/documentos-acciones'

type Doc = {
  id: string; nombre: string; tipoDocumentoNombre: string | null; mimeType: string
  tamanoBytes: number; fechaVencimiento: string | null; creadoEn: string
}
type TipoDoc = { id: string; nombre: string; requiereVencimiento: boolean }

/** Misma clasificación que "Mis documentos" (autoservicio): por nombre o tipo del catálogo. */
const CATEGORIAS = ['Expediente', 'Contratos', 'Desprendibles', 'Certificaciones', 'Actas', 'Otros']
function categoriaDe(d: Doc): string {
  const n = d.nombre.toLowerCase()
  if (n.includes('desprendible') || n.includes('nómina')) return 'Desprendibles'
  if (n.includes('certificación') || n.includes('certificado laboral')) return 'Certificaciones'
  if (n.includes('acta') || n.includes('recibido de dotación')) return 'Actas'
  if (n.includes('contrato') || n.includes('otrosí') || n.includes('autorización de datos')) return 'Contratos'
  if (d.tipoDocumentoNombre) return 'Expediente'
  return 'Otros'
}
type ItemSemaforo = { nombre: string; obligatorio: boolean; estado: 'al_dia' | 'falta' | 'vencido' | 'por_vencer' }

export function GestorDocumentos({
  entidadTipo, entidadId, sedeId, documentos, tiposDocumento, semaforo, puedeEditar,
}: {
  entidadTipo: string; entidadId: string; sedeId: string | null
  documentos: Doc[]; tiposDocumento: TipoDoc[]; semaforo: ItemSemaforo[]; puedeEditar: boolean
}) {
  const router = useRouter()
  const [subiendo, setSubiendo] = useState(false)
  const [dialogo, setDialogo] = useState(false)
  const [eliminar, setEliminar] = useState<Doc | null>(null)
  const [filtro, setFiltro] = useState('Todos')

  const obligatoriosFaltantes = semaforo.filter((s) => s.obligatorio && s.estado === 'falta').length
  const categorias = CATEGORIAS.filter((c) => documentos.some((d) => categoriaDe(d) === c))
  const visibles = filtro === 'Todos' ? documentos : documentos.filter((d) => categoriaDe(d) === filtro)

  return (
    <div className="space-y-6">
      {/* Semáforo documental */}
      {semaforo.length > 0 && (
        <Card>
          <CardContent className="py-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-medium">Semáforo documental</h3>
              {obligatoriosFaltantes === 0 ? (
                <Badge className="bg-emerald-600">Completo</Badge>
              ) : (
                <Badge variant="destructive">{obligatoriosFaltantes} obligatorio(s) faltante(s)</Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              {semaforo.map((s) => (
                <span
                  key={s.nombre}
                  className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs"
                >
                  <IconoEstado estado={s.estado} />
                  {s.nombre}
                  {s.obligatorio && <span className="text-destructive">*</span>}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Documentos */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium">Documentos ({documentos.length})</h3>
          {puedeEditar && (
            <Button size="sm" onClick={() => setDialogo(true)}>
              <Upload className="size-4" /> Subir documento
            </Button>
          )}
        </div>
        {categorias.length > 1 && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {['Todos', ...categorias].map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setFiltro(c)}
                className={
                  filtro === c
                    ? 'rounded-full bg-foreground px-3 py-1 text-xs font-semibold text-background'
                    : 'rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent'
                }
              >
                {c}
                <span className="ml-1 tabular-nums opacity-60">
                  {c === 'Todos' ? documentos.length : documentos.filter((d) => categoriaDe(d) === c).length}
                </span>
              </button>
            ))}
          </div>
        )}
        {visibles.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center border rounded-lg border-dashed">
            {filtro === 'Todos' ? 'Aún no hay documentos cargados.' : `No hay documentos en "${filtro}".`}
          </p>
        ) : (
          <div className="grid gap-2">
            {visibles.map((d) => (
              <Card key={d.id}>
                <CardContent className="flex items-center gap-3 py-3">
                  {d.mimeType.startsWith('image/') ? <ImageIcon className="size-5 text-muted-foreground shrink-0" /> : <FileText className="size-5 text-muted-foreground shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{d.nombre}</p>
                    <p className="text-xs text-muted-foreground">
                      {d.tipoDocumentoNombre ?? 'Sin clasificar'} · {(d.tamanoBytes / 1024).toFixed(0)} KB
                      {d.fechaVencimiento && ` · vence ${formatFechaCorta(new Date(d.fechaVencimiento))}`}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" asChild aria-label="Ver">
                    <a href={`/api/documentos/${d.id}`} target="_blank" rel="noreferrer"><ExternalLink className="size-4" /></a>
                  </Button>
                  {puedeEditar && (
                    <Button variant="ghost" size="icon" onClick={() => setEliminar(d)} aria-label="Eliminar">
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {dialogo && (
        <DialogSubir
          entidadTipo={entidadTipo}
          entidadId={entidadId}
          sedeId={sedeId}
          tiposDocumento={tiposDocumento}
          subiendo={subiendo}
          setSubiendo={setSubiendo}
          onClose={() => setDialogo(false)}
          onSubido={() => { setDialogo(false); router.refresh() }}
        />
      )}

      {eliminar && (
        <AlertDialog open onOpenChange={(o) => !o && setEliminar(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Eliminar «{eliminar.nombre}»</AlertDialogTitle>
              <AlertDialogDescription>El archivo se borrará permanentemente.</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={async () => {
                  const res = await borrarDocumento({ id: eliminar.id, entidadId })
                  if (res.ok) { toast.success('Documento eliminado.'); router.refresh() }
                  else toast.error(res.error)
                  setEliminar(null)
                }}
              >Eliminar</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}
    </div>
  )
}

function IconoEstado({ estado }: { estado: ItemSemaforo['estado'] }) {
  if (estado === 'al_dia') return <CircleCheck className="size-3.5 text-emerald-600" />
  if (estado === 'por_vencer') return <Clock className="size-3.5 text-amber-500" />
  if (estado === 'vencido') return <TriangleAlert className="size-3.5 text-destructive" />
  return <TriangleAlert className="size-3.5 text-muted-foreground" />
}

function DialogSubir({
  entidadTipo, entidadId, sedeId, tiposDocumento, subiendo, setSubiendo, onClose, onSubido,
}: {
  entidadTipo: string; entidadId: string; sedeId: string | null; tiposDocumento: TipoDoc[]
  subiendo: boolean; setSubiendo: (b: boolean) => void; onClose: () => void; onSubido: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [archivo, setArchivo] = useState<File | null>(null)
  const [nombre, setNombre] = useState('')
  const [tipoDocumentoId, setTipoDocumentoId] = useState('')
  const [fechaVencimiento, setFechaVencimiento] = useState('')

  const tipoSel = tiposDocumento.find((t) => t.id === tipoDocumentoId)

  async function onSeleccion(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setArchivo(f)
    if (!nombre) setNombre(f.name.replace(/\.[^.]+$/, ''))
  }

  async function subir() {
    if (!archivo) { toast.error('Selecciona un archivo.'); return }
    setSubiendo(true)
    try {
      let aSubir: File = archivo
      if (archivo.type.startsWith('image/')) {
        aSubir = await imageCompression(archivo, { maxWidthOrHeight: 1600, maxSizeMB: 1.5, useWebWorker: true })
      }
      const fd = new FormData()
      fd.append('archivo', aSubir, archivo.name)
      fd.append('entidadTipo', entidadTipo)
      fd.append('entidadId', entidadId)
      fd.append('nombre', nombre || archivo.name)
      if (tipoDocumentoId) fd.append('tipoDocumentoId', tipoDocumentoId)
      if (fechaVencimiento) fd.append('fechaVencimiento', fechaVencimiento)
      if (sedeId) fd.append('sedeId', sedeId)

      const resp = await fetch('/api/documentos/subir', { method: 'POST', body: fd })
      const json = await resp.json()
      if (!resp.ok) throw new Error(json.error ?? 'Error')
      toast.success('Documento subido.')
      onSubido()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'No se pudo subir.')
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Subir documento</DialogTitle>
          <DialogDescription>PDF o imagen (máx. 25 MB). Las fotos se comprimen automáticamente.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Archivo</Label>
            <input
              ref={inputRef}
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              onChange={onSeleccion}
              className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-primary-foreground"
            />
          </div>
          {/* El catálogo de tipos solo aplica donde hay clasificación (expediente del
              colaborador). Donde no se pasan tipos (p. ej. anexos de contrato) no se
              muestra un selector vacío: basta el nombre/descripción. */}
          {tiposDocumento.length > 0 && (
            <div className="space-y-1.5">
              <Label>Tipo de documento</Label>
              <Select value={tipoDocumentoId || undefined} onValueChange={setTipoDocumentoId}>
                <SelectTrigger className="w-full"><SelectValue placeholder="— Sin clasificar —" /></SelectTrigger>
                <SelectContent>
                  {tiposDocumento.map((t) => <SelectItem key={t.id} value={t.id}>{t.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Nombre / descripción</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} />
          </div>
          {tipoSel?.requiereVencimiento && (
            <div className="space-y-1.5">
              <Label>Fecha de vencimiento</Label>
              <Input type="date" value={fechaVencimiento} onChange={(e) => setFechaVencimiento(e.target.value)} />
              <p className="text-xs text-muted-foreground">Generará alertas automáticas de vencimiento.</p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={subir} disabled={subiendo || !archivo}>
            {subiendo ? <Spinner /> : <Upload className="size-4" />} Subir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
