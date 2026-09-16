'use client'

import { useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { CalendarPlus, FilePen, CirclePause, CirclePlay, UserMinus, Paperclip, Trash2 } from 'lucide-react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Checkbox } from '@/components/ui/checkbox'
import { Spinner } from '@/components/ui/spinner'
import { Card, CardContent } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { agregarProrroga, agregarOtrosi, analizarPdfOtrosi, registrarSuspension, reactivarContrato, eliminarContratoLaboral } from '../acciones'
import { SelectorFirmasPdf, ETIQUETAS_LABORAL, type Posicion } from '@/components/contratos/selector-firmas-pdf'
import { TIPOS_CAMBIO_OTROSI, ETIQUETA_CAMBIO_OTROSI } from '@/lib/otrosi'

type Cat = { cargos: { id: string; nombre: string }[]; sedes: { id: string; nombre: string; ciudad: string }[] }

export function AccionesContrato({
  contratoId, colaboradorId, tipo, estado, numero, puedeEliminar, cargos, sedes,
}: { contratoId: string; colaboradorId: string; tipo: string; estado: string; numero: string; puedeEliminar: boolean } & Cat) {
  const router = useRouter()
  const [dialogo, setDialogo] = useState<'prorroga' | 'otrosi' | 'suspension' | null>(null)
  const [cargando, setCargando] = useState(false)
  const [confirmarBorrado, setConfirmarBorrado] = useState(false)

  async function eliminar() {
    setCargando(true)
    const res = await eliminarContratoLaboral({ id: contratoId })
    setCargando(false)
    if (res.ok) {
      toast.success(`Contrato ${res.datos.numero} eliminado.`)
      router.push(`/colaboradores/${res.datos.colaboradorId}`)
    } else toast.error(res.error)
  }

  async function reactivar() {
    setCargando(true)
    const res = await reactivarContrato({ id: contratoId })
    setCargando(false)
    if (res.ok) { toast.success('Contrato reactivado.'); router.refresh() }
    else toast.error(res.error)
  }

  return (
    <Card><CardContent className="py-4">
      <h3 className="text-sm font-medium mb-3">Acciones</h3>
      <div className="flex flex-wrap gap-2">
        {tipo === 'TERMINO_FIJO' && (
          <Button size="sm" variant="outline" onClick={() => setDialogo('prorroga')}><CalendarPlus className="size-4" /> Prórroga</Button>
        )}
        <Button size="sm" variant="outline" onClick={() => setDialogo('otrosi')}><FilePen className="size-4" /> Otrosí</Button>
        {estado !== 'SUSPENDIDO' ? (
          <Button size="sm" variant="outline" onClick={() => setDialogo('suspension')}><CirclePause className="size-4" /> Suspender</Button>
        ) : (
          <Button size="sm" variant="outline" onClick={reactivar} disabled={cargando}>
            {cargando ? <Spinner /> : <CirclePlay className="size-4" />} Reactivar
          </Button>
        )}
        {/* Terminar vive en su propio módulo (liquidación y paz y salvo), pero
            se llega desde aquí: quien está viendo un contrato vencido no tiene
            por qué saber que la acción está en otra pantalla. */}
        {estado === 'ACTIVO' && (
          <Link
            href={`/terminaciones?colaborador=${colaboradorId}`}
            className={buttonVariants({ size: 'sm', variant: 'outline' })}
          >
            <UserMinus className="size-4" /> Terminar contrato
          </Link>
        )}
      </div>

      {/* Borrar es para el error de registro —PDF a la persona equivocada,
          duplicado—, no para cerrar un contrato: eso va por Terminaciones. Por
          eso queda aparte, abajo, y con confirmación. */}
      {puedeEliminar && (
        <div className="mt-4 border-t pt-3">
          <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setConfirmarBorrado(true)} disabled={cargando}>
            <Trash2 className="size-4" /> Eliminar contrato
          </Button>
          <p className="mt-1 text-xs text-muted-foreground">Solo si se registró por error. Un contrato real se termina desde Terminaciones.</p>
          <AlertDialog open={confirmarBorrado} onOpenChange={setConfirmarBorrado}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Eliminar el contrato {numero}</AlertDialogTitle>
                <AlertDialogDescription>
                  Se borran el registro, su PDF y su autorización de datos, y sus alertas de vencimiento. La ficha
                  del colaborador vuelve al vínculo de los contratos que le queden. No se puede deshacer.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                <AlertDialogAction onClick={eliminar} className="bg-destructive text-white hover:bg-destructive/90">Eliminar</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      )}

      {dialogo === 'prorroga' && <DialogProrroga contratoId={contratoId} onClose={() => setDialogo(null)} onDone={() => { setDialogo(null); router.refresh() }} />}
      {dialogo === 'otrosi' && <DialogOtrosi contratoId={contratoId} cargos={cargos} sedes={sedes} onClose={() => setDialogo(null)} onDone={() => { setDialogo(null); router.refresh() }} />}
      {dialogo === 'suspension' && <DialogSuspension contratoId={contratoId} onClose={() => setDialogo(null)} onDone={() => { setDialogo(null); router.refresh() }} />}
    </CardContent></Card>
  )
}

function DialogProrroga({ contratoId, onClose, onDone }: { contratoId: string; onClose: () => void; onDone: () => void }) {
  const [ini, setIni] = useState('')
  const [fin, setFin] = useState('')
  const [firma, setFirma] = useState('')
  const [g, setG] = useState(false)
  async function guardar() {
    setG(true)
    const res = await agregarProrroga({ contratoId, fechaInicio: ini, fechaFin: fin, fechaFirma: firma })
    setG(false)
    if (res.ok) { toast.success('Prórroga registrada.'); onDone() } else toast.error(res.error)
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Registrar prórroga</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label>Fecha de inicio</Label><Input type="date" value={ini} onChange={(e) => setIni(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Fecha de fin</Label><Input type="date" value={fin} onChange={(e) => setFin(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Fecha de firma</Label><Input type="date" value={firma} onChange={(e) => setFirma(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={g || !ini || !fin}>{g && <Spinner />}Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Posición de arranque de la firma cuando el PDF no permite proponer nada (escaneos). */
const FIRMA_POR_DEFECTO: Omit<Posicion, 'pagina'> = { x: 80, y: 150, ancho: 150, alto: 45 }
/** 3 MB de PDF ≈ 4 MB en base64, el tope del cuerpo de la Server Action. */
const MAX_PDF_BYTES = 3 * 1024 * 1024

/**
 * Registrar un otrosí: qué cambia (con sus valores) más el PDF del otrosí, que
 * el trabajador firma desde su autoservicio con la misma lógica del contrato.
 * No hay descripción libre: el resumen sale de los cambios registrados, y la
 * fecha del otrosí la deduce el servidor (inicio del nuevo periodo, o hoy).
 */
function DialogOtrosi({ contratoId, cargos, sedes, onClose, onDone }: { contratoId: string } & Cat & { onClose: () => void; onDone: () => void }) {
  const [tipos, setTipos] = useState<string[]>([])
  const [salario, setSalario] = useState('')
  const [cargoId, setCargoId] = useState('')
  const [sedeId, setSedeId] = useState('')
  const [modalidad, setModalidad] = useState('')
  // Duración: el nuevo periodo pactado, de inicio a fin.
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  // El PDF del otrosí y dónde firma el trabajador dentro de él.
  const inputPdf = useRef<HTMLInputElement>(null)
  const [pdf, setPdf] = useState<string | null>(null)
  const [nombrePdf, setNombrePdf] = useState('')
  const [paginas, setPaginas] = useState(1)
  const [analizando, setAnalizando] = useState(false)
  const [detectado, setDetectado] = useState<boolean | null>(null)
  const [posiciones, setPosiciones] = useState<Record<'contratista' | 'contratante', Posicion>>({
    contratista: { ...FIRMA_POR_DEFECTO, pagina: 1 },
    contratante: { ...FIRMA_POR_DEFECTO, pagina: 1 },
  })
  const [version, setVersion] = useState(0)
  const [g, setG] = useState(false)

  const duracion = tipos.includes('DURACION')
  const periodoInvertido = Boolean(fechaInicio && fechaFin && fechaFin < fechaInicio)
  const duracionIncompleta = duracion && (!fechaInicio || !fechaFin || periodoInvertido)

  function toggle(v: string, c: boolean) { setTipos((p) => c ? [...p, v] : p.filter((x) => x !== v)) }

  async function alElegirPdf(archivo: File) {
    if (archivo.type !== 'application/pdf') { toast.error('El archivo debe ser un PDF.'); return }
    if (archivo.size > MAX_PDF_BYTES) {
      toast.error(`El PDF pesa ${(archivo.size / 1024 / 1024).toFixed(1)} MB y el máximo son 3 MB. Comprímelo o escanéalo a menor resolución.`)
      return
    }
    const dataUri = await new Promise<string>((res, rej) => {
      const r = new FileReader()
      r.onload = () => res(String(r.result))
      r.onerror = () => rej(new Error('No se pudo leer el archivo'))
      r.readAsDataURL(archivo)
    })
    setPdf(dataUri)
    setNombrePdf(archivo.name)

    // La app propone dónde firma el trabajador leyendo el PDF; un escaneo no
    // propone nada y se marca a mano sobre el documento.
    setAnalizando(true)
    const res = await analizarPdfOtrosi({ pdfBase64: dataUri })
    setAnalizando(false)
    if (!res.ok) { toast.error(res.error ?? 'No se pudo leer el PDF.'); return }
    const d = res.datos as { paginas: number; trabajador: Posicion | null }
    setPaginas(d.paginas)
    // Sin detección se cae a la ÚLTIMA página: es donde va el bloque de firmas.
    setPosiciones((p) => ({ ...p, contratista: d.trabajador ?? { ...FIRMA_POR_DEFECTO, pagina: d.paginas } }))
    setDetectado(!!d.trabajador)
    setVersion((x) => x + 1)
  }

  async function guardar() {
    if (!pdf) { toast.error('Adjunta el PDF del otrosí.'); return }
    setG(true)
    const res = await agregarOtrosi({
      contratoId, tiposCambio: tipos as ('SALARIO')[],
      salarioNuevo: salario ? Number(salario) : undefined,
      cargoNuevoId: cargoId, sedeNuevaId: sedeId,
      modalidadNueva: (modalidad || undefined) as 'PRESENCIAL' | undefined,
      fechaInicioNueva: duracion ? fechaInicio : '',
      fechaFinNueva: duracion ? fechaFin : '',
      pdfBase64: pdf,
      posicionFirma: posiciones.contratista,
    })
    setG(false)
    if (res.ok) {
      toast.success('Otrosí registrado. El trabajador ya puede firmarlo desde su autoservicio y le llegó el aviso.')
      onDone()
    } else toast.error(res.error)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Registrar otrosí</DialogTitle>
          <DialogDescription>
            Sube el PDF del otrosí, ya firmado por la empresa, e indica dónde firma el trabajador:
            lo firmará desde su autoservicio, igual que el contrato.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Tipos de cambio</Label>
            <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
              {TIPOS_CAMBIO_OTROSI.map((t) => (
                <label key={t} className="flex items-center gap-2 text-sm">
                  <Checkbox checked={tipos.includes(t)} onCheckedChange={(c) => toggle(t, Boolean(c))} /> {ETIQUETA_CAMBIO_OTROSI[t]}
                </label>
              ))}
            </div>
          </div>
          {tipos.includes('SALARIO') && <div className="space-y-1.5"><Label htmlFor="otrosi-salario">Nuevo salario</Label><Input id="otrosi-salario" type="number" value={salario} onChange={(e) => setSalario(e.target.value)} /></div>}
          {tipos.includes('CARGO') && (
            <div className="space-y-1.5"><Label>Nuevo cargo</Label>
              <Select value={cargoId || undefined} onValueChange={setCargoId}><SelectTrigger className="w-full"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                <SelectContent>{cargos.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}</SelectContent></Select>
            </div>
          )}
          {tipos.includes('SEDE') && (
            <div className="space-y-1.5"><Label>Nueva sede</Label>
              <Select value={sedeId || undefined} onValueChange={setSedeId}><SelectTrigger className="w-full"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                <SelectContent>{sedes.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre} · {s.ciudad}</SelectItem>)}</SelectContent></Select>
            </div>
          )}
          {tipos.includes('MODALIDAD_TRABAJO') && (
            <div className="space-y-1.5"><Label>Nueva modalidad</Label>
              <Select value={modalidad || undefined} onValueChange={setModalidad}><SelectTrigger className="w-full"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="PRESENCIAL">Presencial</SelectItem><SelectItem value="REMOTO">Remoto</SelectItem>
                  <SelectItem value="HIBRIDO">Híbrido</SelectItem>
                </SelectContent></Select>
            </div>
          )}
          {duracion && (
            <div className="space-y-1.5">
              <Label>Nuevo periodo</Label>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label htmlFor="otrosi-inicio" className="text-xs font-normal text-muted-foreground">Fecha de inicio</Label>
                  <Input id="otrosi-inicio" type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="otrosi-fin" className="text-xs font-normal text-muted-foreground">Fecha de fin</Label>
                  <Input id="otrosi-fin" type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
                </div>
              </div>
              {periodoInvertido && <p className="text-xs text-destructive">La fecha de fin debe ser igual o posterior a la de inicio.</p>}
            </div>
          )}

          {/* El PDF del otrosí: el documento que firma el trabajador. */}
          <div className="space-y-1.5">
            <Label>PDF del otrosí</Label>
            <input
              ref={inputPdf}
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) alElegirPdf(f); e.target.value = '' }}
            />
            <Button type="button" variant="outline" size="sm" className="w-full justify-start" onClick={() => inputPdf.current?.click()} disabled={analizando}>
              <Paperclip className="size-4" />
              <span className="truncate">{nombrePdf || 'Seleccionar el PDF (ya firmado por la empresa)'}</span>
            </Button>
            {analizando && (
              <p className="flex items-center gap-2 text-sm text-muted-foreground"><Spinner className="size-4" /> Leyendo el PDF para proponer dónde va la firma…</p>
            )}
          </div>
          {pdf && !analizando && (
            <>
              <p className="text-xs text-muted-foreground">
                {detectado
                  ? 'Se propuso la posición leyendo el documento. Revisa que el recuadro quede sobre la línea de firma del trabajador.'
                  : 'No se pudo ubicar la línea de firma en este PDF (suele pasar con escaneos). Arrastra el recuadro al lugar correcto.'}
              </p>
              <SelectorFirmasPdf
                key={version}
                pdfDataUri={pdf}
                paginas={paginas}
                valor={posiciones}
                onChange={setPosiciones}
                partes={['contratista']}
                etiquetas={ETIQUETAS_LABORAL}
              />
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={g || tipos.length === 0 || !pdf || analizando || duracionIncompleta}>
            {g && <Spinner />}Guardar y enviar a firma
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DialogSuspension({ contratoId, onClose, onDone }: { contratoId: string; onClose: () => void; onDone: () => void }) {
  const [ini, setIni] = useState('')
  const [fin, setFin] = useState('')
  const [causa, setCausa] = useState('LICENCIA_NO_REMUNERADA')
  const [desc, setDesc] = useState('')
  const [g, setG] = useState(false)
  async function guardar() {
    setG(true)
    const res = await registrarSuspension({ contratoId, fechaInicio: ini, fechaFin: fin, causa: causa as 'OTRO', descripcion: desc })
    setG(false)
    if (res.ok) { toast.success('Suspensión registrada.'); onDone() } else toast.error(res.error)
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Suspender contrato</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5"><Label>Causa</Label>
            <Select value={causa} onValueChange={setCausa}><SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SANCION_DISCIPLINARIA">Sanción disciplinaria</SelectItem>
                <SelectItem value="LICENCIA_NO_REMUNERADA">Licencia no remunerada</SelectItem>
                <SelectItem value="FUERZA_MAYOR">Fuerza mayor</SelectItem>
                <SelectItem value="OTRO">Otro</SelectItem>
              </SelectContent></Select>
          </div>
          <div className="space-y-1.5"><Label>Fecha de inicio</Label><Input type="date" value={ini} onChange={(e) => setIni(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Fecha de fin (opcional)</Label><Input type="date" value={fin} onChange={(e) => setFin(e.target.value)} /></div>
          <div className="space-y-1.5"><Label>Descripción</Label><Textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={2} /></div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={g || !ini}>{g && <Spinner />}Suspender</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
