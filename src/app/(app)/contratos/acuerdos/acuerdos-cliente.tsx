'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { MAX_PDF_BYTES, mensajePdfPesado, subirPdfTemporal } from '@/lib/archivos'
import { Plus, Pencil, Mail, Upload, Check, X, UserPlus, FileText, RefreshCw, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { VisorPdf } from '@/components/documentos/visor-pdf'
import { Textarea } from '@/components/ui/textarea'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Ayuda } from '@/components/ui-kit/ayuda'
import { Pill, type PillTone } from '@/components/ui-kit'
import { Encabezado } from '@/components/shell/encabezado'
import { rangoBreve } from '@/lib/notificaciones/texto'
import { BotonEliminar } from '@/components/ui-kit/boton-eliminar'
import { crearAcuerdo, editarAcuerdo, enviarAcuerdo, subirAcuerdoFirmado, decidirAcuerdo, convertirEnColaborador, eliminarAcuerdo, regenerarPdfAcuerdo } from './acciones'
import type { AcuerdoEvaluacionInput } from '@/lib/validaciones/acuerdo-evaluacion'
import { mensajeError } from '@/lib/errores-accion'

type Acuerdo = {
  id: string; numero: string; nombre: string; documento: string; email: string
  cargoEvaluado: string; sedeNombre: string; fechaInicio: string; fechaFin: string
  estado: string; enviado: boolean; firmado: boolean; colaboradorId: string | null
  documentos: { id: string; nombre: string }[]
  // Valores crudos para reabrir el formulario al editar.
  nombres: string; apellidos: string; tipoDocumento: string; numeroDocumento: string
  lugarExpedicionDoc: string; direccion: string; celular: string
  cargoId: string; sedeId: string; ciudadFirma: string; observaciones: string
}
type Opcion = { id: string; nombre: string }

const ESTADO: Record<string, { texto: string; tone: PillTone }> = {
  EN_EVALUACION: { texto: 'En evaluación', tone: 'warn' },
  APROBADO: { texto: 'Aprobada', tone: 'ok' },
  NO_APROBADO: { texto: 'No aprobada', tone: 'bad' },
}

/** Un dato del panel desplegado: rótulo pequeño encima del valor. */
function Dato({ label, valor, ancho }: { label: string; valor: string; ancho?: boolean }) {
  return (
    <div className={cn('min-w-0', ancho && 'sm:col-span-2')}>
      <dt className="text-[10.5px] font-bold uppercase tracking-wider text-muted-foreground">{label}</dt>
      <dd className="break-words">{valor}</dd>
    </div>
  )
}

/** Nombre técnico del campo → el rótulo que se ve en el formulario. */
const ETIQUETAS_CAMPO: Record<string, string> = {
  nombres: 'Nombres',
  apellidos: 'Apellidos',
  tipoDocumento: 'Tipo de documento',
  numeroDocumento: 'Número de documento',
  lugarExpedicionDoc: 'Expedido en',
  direccion: 'Dirección',
  email: 'Correo',
  celular: 'Celular',
  cargoEvaluado: 'Cargo a evaluar',
  cargoId: 'Cargo del catálogo',
  sedeId: 'Sede',
  fechaInicio: 'Inicio de la evaluación',
  fechaFin: 'Fin de la evaluación',
  ciudadFirma: 'Ciudad de firma',
  observaciones: 'Observaciones',
}

const TIPOS_DOC = ['CC', 'CE', 'TI', 'PASAPORTE', 'PPT'] as const
const NINGUNO = '__ninguno__'

type Formulario = {
  nombres: string; apellidos: string; tipoDocumento: string; numeroDocumento: string
  lugarExpedicionDoc: string; direccion: string; email: string; celular: string
  cargoEvaluado: string; cargoId: string; sedeId: string
  fechaInicio: string; fechaFin: string; ciudadFirma: string; observaciones: string
}
const VACIO: Formulario = {
  nombres: '', apellidos: '', tipoDocumento: 'CC', numeroDocumento: '', lugarExpedicionDoc: '',
  direccion: '', email: '', celular: '', cargoEvaluado: '', cargoId: '', sedeId: '',
  fechaInicio: '', fechaFin: '', ciudadFirma: '', observaciones: '',
}

/**
 * Por qué NO se puede borrar esta evaluación, o null si sí se puede. El botón
 * queda visible pero inerte con el motivo, en vez de desaparecer sin explicar.
 */
function motivoNoEliminar(a: Acuerdo): string | null {
  if (a.colaboradorId) return 'No se puede eliminar: de esta evaluación ya nació una ficha de colaborador.'
  if (a.firmado) {
    return 'No se puede eliminar: el aspirante ya devolvió el acuerdo firmado y ese documento es la evidencia de que existió. Márcala como no aprobada si el proceso no siguió.'
  }
  if (a.estado !== 'EN_EVALUACION') return 'No se puede eliminar una evaluación que ya fue aprobada o rechazada.'
  return null
}

export function AcuerdosCliente({
  puedeCrear, puedeEditar, puedeAprobar, puedeCrearColaborador, puedeEliminar, acuerdos, cargos, sedes,
}: {
  puedeCrear: boolean; puedeEditar: boolean; puedeAprobar: boolean
  puedeCrearColaborador: boolean; puedeEliminar: boolean
  acuerdos: Acuerdo[]; cargos: Opcion[]; sedes: Opcion[]
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [editando, setEditando] = useState<Acuerdo | null>(null)
  const [guardando, setGuardando] = useState(false)
  const [f, setF] = useState<Formulario>(VACIO)
  const [ocupado, setOcupado] = useState<string | null>(null)
  // Una sola fila desplegada a la vez: la lista se lee mejor y el panel
  // abierto es el que se está mirando.
  const [abierta, setAbierta] = useState<string | null>(null)
  const [convertir, setConvertir] = useState<Acuerdo | null>(null)
  const [sedeConversion, setSedeConversion] = useState('')
  const [fechaIngreso, setFechaIngreso] = useState('')

  async function guardar() {
    if (!f.nombres.trim() || !f.apellidos.trim()) { toast.error('Indica nombres y apellidos.'); return }
    // El documento identifica al aspirante y sale impreso en el acuerdo; sin
    // esta comprobación el fallo llegaba desde el servidor sin decir cuál era.
    if (f.numeroDocumento.trim().length < 4) { toast.error('Indica el número de documento.'); return }
    if (!f.email.trim()) { toast.error('Indica el correo: por ahí se envía el acuerdo.'); return }
    if (!f.cargoEvaluado.trim()) { toast.error('Indica el cargo a evaluar.'); return }
    if (!f.fechaInicio || !f.fechaFin) { toast.error('Indica las fechas de la evaluación.'); return }
    if (f.fechaFin < f.fechaInicio) { toast.error('La fecha de fin no puede ser anterior a la de inicio.'); return }

    const payload: AcuerdoEvaluacionInput = {
      nombres: f.nombres, apellidos: f.apellidos,
      tipoDocumento: f.tipoDocumento as AcuerdoEvaluacionInput['tipoDocumento'],
      numeroDocumento: f.numeroDocumento, lugarExpedicionDoc: f.lugarExpedicionDoc,
      direccion: f.direccion, email: f.email, celular: f.celular,
      cargoEvaluado: f.cargoEvaluado, cargoId: f.cargoId, sedeId: f.sedeId,
      fechaInicio: f.fechaInicio, fechaFin: f.fechaFin, ciudadFirma: f.ciudadFirma,
      aniosConfidencialidad: 2, observaciones: f.observaciones,
    }
    setGuardando(true)
    const res = editando
      ? await editarAcuerdo({ id: editando.id, ...payload })
      : await crearAcuerdo(payload)
    setGuardando(false)
    if (!res.ok) { toast.error(mensajeError(res, ETIQUETAS_CAMPO), { duration: 8000 }); return }

    if (editando) {
      // Si ya se había enviado, el PDF que tiene el aspirante quedó viejo: hay
      // que decirlo, no dejar que se entere cuando devuelva una firma inservible.
      const d = res.datos as { reenviar?: boolean }
      toast.success(
        d.reenviar
          ? 'Acuerdo actualizado. Se generó un PDF nuevo y se anuló el enlace anterior: vuelve a enviarlo.'
          : 'Acuerdo actualizado.',
        { duration: d.reenviar ? 8000 : 4000 },
      )
    } else toast.success('Acuerdo creado. Ya puedes enviarlo para firma.')

    setAbierto(false); setEditando(null); setF(VACIO); router.refresh()
  }

  function abrirNuevo() {
    setEditando(null)
    setF(VACIO)
    setAbierto(true)
  }

  function abrirEditar(a: Acuerdo) {
    setEditando(a)
    setF({
      nombres: a.nombres, apellidos: a.apellidos, tipoDocumento: a.tipoDocumento,
      numeroDocumento: a.numeroDocumento, lugarExpedicionDoc: a.lugarExpedicionDoc,
      direccion: a.direccion, email: a.email, celular: a.celular,
      cargoEvaluado: a.cargoEvaluado, cargoId: a.cargoId, sedeId: a.sedeId,
      fechaInicio: a.fechaInicio, fechaFin: a.fechaFin,
      ciudadFirma: a.ciudadFirma, observaciones: a.observaciones,
    })
    setAbierto(true)
  }

  async function regenerar(a: Acuerdo) {
    setOcupado(a.id)
    const res = await regenerarPdfAcuerdo({ id: a.id })
    setOcupado(null)
    if (!res.ok) { toast.error(res.error); return }
    const d = res.datos as { habiaEnviado?: boolean }
    // Si ya se había enviado, el aspirante tiene en su correo el PDF anterior:
    // conviene reenviarlo para que firme el que corresponde al formato nuevo.
    toast.success(
      d.habiaEnviado
        ? 'PDF regenerado. El aspirante tiene el anterior en su correo: reenvíalo para que firme este.'
        : 'PDF regenerado con el formato vigente.',
      { duration: d.habiaEnviado ? 8000 : 4000 },
    )
    router.refresh()
  }

  async function enviar(a: Acuerdo) {
    setOcupado(a.id)
    const res = await enviarAcuerdo({ id: a.id })
    setOcupado(null)
    if (res.ok) { toast.success(`Acuerdo enviado a ${a.email}.`); router.refresh() }
    else toast.error(res.error)
  }

  async function subirFirmado(a: Acuerdo, file: File) {
    if (file.size > MAX_PDF_BYTES) { toast.error(mensajePdfPesado(file.size)); return }
    setOcupado(a.id)
    let pdfRef: string
    try {
      pdfRef = await subirPdfTemporal(file)
    } catch (e) {
      setOcupado(null); toast.error(e instanceof Error ? e.message : 'No se pudo subir el PDF.'); return
    }
    const res = await subirAcuerdoFirmado({ id: a.id, pdfRef })
    setOcupado(null)
    if (res.ok) { toast.success('Acuerdo firmado cargado.'); router.refresh() }
    else toast.error(res.error)
  }

  async function decidir(a: Acuerdo, aprobado: boolean) {
    if (!confirm(aprobado ? `¿Aprobar la evaluación de ${a.nombre}?` : `¿Marcar como NO aprobada la evaluación de ${a.nombre}?`)) return
    setOcupado(a.id)
    const res = await decidirAcuerdo({ id: a.id, aprobado, observaciones: '' })
    setOcupado(null)
    if (res.ok) { toast.success(aprobado ? 'Evaluación aprobada.' : 'Evaluación marcada como no aprobada.'); router.refresh() }
    else toast.error(res.error)
  }

  async function eliminar(a: Acuerdo) {
    if (!confirm(`¿Eliminar la evaluación ${a.numero} de ${a.nombre}? Se borra también su PDF y no se puede deshacer.`)) return
    setOcupado(a.id)
    const res = await eliminarAcuerdo({ id: a.id })
    setOcupado(null)
    if (res.ok) { toast.success('Evaluación eliminada.'); router.refresh() }
    else toast.error(res.error)
  }

  async function hacerConversion() {
    if (!convertir) return
    if (!sedeConversion) { toast.error('Selecciona la sede.'); return }
    if (!fechaIngreso) { toast.error('Indica la fecha de ingreso.'); return }
    setGuardando(true)
    const res = await convertirEnColaborador({ id: convertir.id, sedeId: sedeConversion, fechaIngreso })
    setGuardando(false)
    if (res.ok) {
      toast.success('Ficha creada. Ya puedes crearle el contrato OPS desde Contratación.')
      setConvertir(null); setSedeConversion(''); setFechaIngreso('')
      router.refresh()
    } else toast.error(res.error)
  }

  return (
    <>
      <Encabezado
        enLinea
        volver
        titulo="Evaluación previa"
        acciones={puedeCrear && (
          <Button size="sm" onClick={abrirNuevo}>
            <Plus className="size-4" /> Nueva
          </Button>
        )}
      />

      <Card><CardContent className="divide-y p-0">
        {acuerdos.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Aún no hay acuerdos de evaluación.
          </p>
        ) : acuerdos.map((a) => {
          const est = ESTADO[a.estado] ?? ESTADO.EN_EVALUACION
          const trabajando = ocupado === a.id
          const expandida = abierta === a.id
          const enEvaluacion = a.estado === 'EN_EVALUACION'

          // Botones sueltos, para armar con ellos la fila y el panel sin repetir.
          const bEditar = puedeEditar && enEvaluacion && (
            <Button size="icon" disabled={trabajando} onClick={() => abrirEditar(a)} aria-label="Editar" title="Editar">
              <Pencil className="size-4" />
            </Button>
          )
          const bRegenerar = puedeEditar && (
            <Button size="icon" disabled={trabajando} onClick={() => regenerar(a)} aria-label="Regenerar PDF" title="Regenerar el PDF con el formato vigente">
              <RefreshCw className="size-4" />
            </Button>
          )
          const bEnviar = puedeEditar && enEvaluacion && (
            <Button size="sm" disabled={trabajando} onClick={() => enviar(a)} title={a.enviado ? 'Reenviar al correo del aspirante' : 'Enviar al correo del aspirante'}>
              {trabajando ? <Spinner /> : <Mail className="size-4" />} {a.enviado ? 'Reenviar' : 'Enviar'}
            </Button>
          )
          const bSubir = puedeEditar && enEvaluacion && (
            <Button size="sm" asChild disabled={trabajando}>
              <label className="cursor-pointer" title="Subir el acuerdo firmado (PDF)">
                <Upload className="size-4" /> {a.firmado ? 'Subir otro' : 'Subir firmado'}
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => { const file = e.target.files?.[0]; if (file) subirFirmado(a, file); e.target.value = '' }}
                />
              </label>
            </Button>
          )
          const bDecidir = puedeAprobar && enEvaluacion && (
            <>
              <Button size="sm" disabled={trabajando} onClick={() => decidir(a, false)}>
                <X className="size-4" /> No aprobar
              </Button>
              <Button size="sm" disabled={trabajando} onClick={() => decidir(a, true)}>
                <Check className="size-4" /> Aprobar
              </Button>
            </>
          )
          const bFicha = puedeCrearColaborador && a.estado === 'APROBADO' && !a.colaboradorId && (
            <Button size="sm" onClick={() => { setConvertir(a); setSedeConversion(''); setFechaIngreso('') }}>
              <UserPlus className="size-4" /> Crear ficha
            </Button>
          )
          const bEliminar = puedeEliminar && (
            <BotonEliminar onEliminar={() => eliminar(a)} etiqueta="Eliminar evaluación" motivoBloqueo={motivoNoEliminar(a)} />
          )

          // Lo que toca hacer ahora, siempre a la vista; lo demás, al desplegar.
          const principal = !enEvaluacion ? bFicha : a.firmado ? bDecidir : <>{bEnviar}{bSubir}</>

          return (
            <div key={a.id} className="p-3">
              <button
                type="button"
                onClick={() => setAbierta(expandida ? null : a.id)}
                aria-expanded={expandida}
                className="flex w-full items-center gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-bold">{a.nombre}</span>
                    <Pill tone={est.tone}>{est.texto}</Pill>
                    {/* En qué va el papel: un solo dato, el más avanzado. */}
                    {a.colaboradorId
                      ? <Pill tone="muted">Ya es colaborador</Pill>
                      : a.firmado
                        ? <Pill tone="muted">Firmado</Pill>
                        : a.enviado
                          ? <Pill tone="muted">Enviado</Pill>
                          : enEvaluacion && <Pill tone="muted">Sin enviar</Pill>}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                    {a.cargoEvaluado} · {rangoBreve(a.fechaInicio, a.fechaFin)} · {a.numero}
                  </span>
                </span>
                <ChevronDown className={cn('size-4 shrink-0 text-muted-foreground transition-transform', expandida && 'rotate-180')} />
              </button>

              {/* Plegada: solo lo que toca ahora. Desplegada: la fila completa de abajo, sin repetir. */}
              {principal && !expandida && <div className="mt-2 flex flex-wrap items-center justify-end gap-2">{principal}</div>}

              {expandida && (
                <div className="mt-3 space-y-3 border-t pt-3 text-sm">
                  <dl className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2">
                    <Dato label="Documento" valor={a.documento} />
                    <Dato label="Correo" valor={a.email} />
                    {a.celular && <Dato label="Celular" valor={a.celular} />}
                    {a.sedeNombre && <Dato label="Sede" valor={a.sedeNombre} />}
                    {a.ciudadFirma && <Dato label="Ciudad de firma" valor={a.ciudadFirma} />}
                    {a.observaciones && <Dato label="Observaciones" valor={a.observaciones} ancho />}
                  </dl>

                  {a.documentos.length > 0 && (
                    <div className="divide-y rounded-lg border">
                      {a.documentos.map((d) => (
                        <div key={d.id} className="flex items-center gap-2 px-3 py-2 text-xs">
                          <FileText className="size-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 flex-1 truncate">{d.nombre}</span>
                          {/* Se abre en el visor, sin salir de la lista. */}
                          <VisorPdf documentoId={d.id} titulo={d.nombre} className="shrink-0 font-semibold text-primary hover:underline">Ver</VisorPdf>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {bEliminar}
                    {bEditar}
                    {bRegenerar}
                    {bEnviar}
                    {bSubir}
                    {bDecidir}
                    {bFicha}
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </CardContent></Card>

      {/* Nueva evaluación */}
      <Dialog open={abierto} onOpenChange={(o) => { setAbierto(o); if (!o) setEditando(null) }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editando ? `Editar evaluación ${editando.numero}` : 'Nueva evaluación previa'}</DialogTitle>
            <DialogDescription className="flex items-center gap-1.5">
              Acuerdo sin relación laboral
              <Ayuda texto="El aspirante NO se registra como colaborador: el acuerdo declara que no hay contrato de trabajo ni precontrato. Si la evaluación se aprueba, desde aquí se crea su ficha." />
            </DialogDescription>
          </DialogHeader>

          {editando?.enviado && (
            <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
              Este acuerdo ya se envió{editando.firmado ? ' y el aspirante lo devolvió firmado' : ''}. Si cambias
              los datos se generará un PDF nuevo y el enlace anterior dejará de servir: tendrás que enviarlo otra vez
              {editando.firmado ? ' y pedir una firma nueva. El documento firmado anterior se conserva.' : '.'}
            </p>
          )}

          <div className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Nombres</Label><Input value={f.nombres} onChange={(e) => setF({ ...f, nombres: e.target.value })} autoFocus /></div>
              <div className="space-y-1.5"><Label>Apellidos</Label><Input value={f.apellidos} onChange={(e) => setF({ ...f, apellidos: e.target.value })} /></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>Tipo doc.</Label>
                <Select value={f.tipoDocumento} onValueChange={(v) => setF({ ...f, tipoDocumento: v })}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{TIPOS_DOC.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Número</Label><Input value={f.numeroDocumento} onChange={(e) => setF({ ...f, numeroDocumento: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Expedido en</Label><Input value={f.lugarExpedicionDoc} onChange={(e) => setF({ ...f, lugarExpedicionDoc: e.target.value })} placeholder="Belén (N)" /></div>
            </div>
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                Correo
                <Ayuda texto="A este correo se le envía el acuerdo para que lo firme y lo devuelva escaneado." />
              </Label>
              <Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Celular</Label><Input value={f.celular} onChange={(e) => setF({ ...f, celular: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Dirección</Label><Input value={f.direccion} onChange={(e) => setF({ ...f, direccion: e.target.value })} /></div>
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                Cargo a evaluar
                <Ayuda texto="Puedes elegir un cargo del catálogo o escribir uno libre, por si aún no existe en la estructura." />
              </Label>
              <Select
                value={f.cargoId || NINGUNO}
                onValueChange={(v) => {
                  if (v === NINGUNO) { setF({ ...f, cargoId: '' }); return }
                  const c = cargos.find((x) => x.id === v)
                  setF({ ...f, cargoId: v, cargoEvaluado: c?.nombre ?? f.cargoEvaluado })
                }}
              >
                <SelectTrigger className="w-full"><SelectValue placeholder="Del catálogo…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NINGUNO}>— Escribir libre —</SelectItem>
                  {cargos.map((c) => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)}
                </SelectContent>
              </Select>
              <Input className="mt-1.5" value={f.cargoEvaluado} onChange={(e) => setF({ ...f, cargoEvaluado: e.target.value })} placeholder="Auxiliar T.I." />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label>Inicio de la evaluación</Label><Input type="date" value={f.fechaInicio} onChange={(e) => setF({ ...f, fechaInicio: e.target.value })} /></div>
              <div className="space-y-1.5"><Label>Fin de la evaluación</Label><Input type="date" value={f.fechaFin} onChange={(e) => setF({ ...f, fechaFin: e.target.value })} /></div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Sede (opcional)</Label>
                <Select value={f.sedeId || NINGUNO} onValueChange={(v) => setF({ ...f, sedeId: v === NINGUNO ? '' : v })}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Sin definir" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NINGUNO}>— Sin definir —</SelectItem>
                    {sedes.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Ciudad de firma</Label><Input value={f.ciudadFirma} onChange={(e) => setF({ ...f, ciudadFirma: e.target.value })} placeholder="Pasto, Nariño" /></div>
            </div>
            <div className="space-y-1.5">
              <Label>Observaciones (internas)</Label>
              <Textarea rows={2} value={f.observaciones} onChange={(e) => setF({ ...f, observaciones: e.target.value })} />
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => { setAbierto(false); setEditando(null) }}>Cancelar</Button>
            <Button onClick={guardar} disabled={guardando}>{guardando && <Spinner />} {editando ? "Guardar cambios" : "Crear y generar PDF"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Conversión a colaborador */}
      <Dialog open={!!convertir} onOpenChange={(o) => { if (!o) setConvertir(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Crear ficha de colaborador</DialogTitle>
            <DialogDescription>
              {convertir?.nombre} entra a la base de colaboradores como OPS. Sus datos se reutilizan del acuerdo;
              el contrato se crea después desde Contratación.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Sede</Label>
              <Select value={sedeConversion} onValueChange={setSedeConversion}>
                <SelectTrigger className="w-full"><SelectValue placeholder="Selecciona…" /></SelectTrigger>
                <SelectContent>{sedes.map((s) => <SelectItem key={s.id} value={s.id}>{s.nombre}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Fecha de ingreso</Label>
              <Input type="date" value={fechaIngreso} onChange={(e) => setFechaIngreso(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConvertir(null)}>Cancelar</Button>
            <Button onClick={hacerConversion} disabled={guardando}>{guardando && <Spinner />} Crear ficha</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
