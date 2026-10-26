'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { FileText, Stethoscope, FilePlus2, ClipboardCheck, Paperclip } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { VisorPdf } from '@/components/documentos/visor-pdf'
import { Pill } from '@/components/ui-kit'
import { generarOrdenExamen, registrarExamen, adjuntarCertificadoExamen } from '../acciones'
import { ArchivoInput } from '@/components/documentos/archivo-input'

type Concepto = 'APTO' | 'APTO_CON_RECOMENDACIONES' | 'NO_APTO' | 'APLAZADO'
const CONCEPTO: Record<Concepto, string> = { APTO: 'Apto', APTO_CON_RECOMENDACIONES: 'Apto con recomendaciones', NO_APTO: 'No apto', APLAZADO: 'Aplazado' }

/**
 * Paso "Examen de egreso": la orden (le queda al trabajador en su autoservicio)
 * y el registro del examen, que queda en SST como examen de egreso, o la
 * constancia de que no asistió en el plazo. El certificado es un soporte: se
 * adjunta al registrar o después, desde este mismo paso.
 */
export function ExamenEgreso({ terminacionId, ordenDocId, resultado, examen, hoy, puedeEditar, cerrada }: {
  terminacionId: string
  ordenDocId: string | null
  /** "Realizado el 30 de septiembre de 2026", "No asistió", o null si falta. */
  resultado: string | null
  /** El examen ya registrado como realizado (para precargar y para su certificado); null si no lo hay. */
  examen: { fechaISO: string; concepto: Concepto; certificadoDocId: string | null } | null
  hoy: string
  puedeEditar: boolean
  cerrada: boolean
}) {
  const router = useRouter()
  const [generando, setGenerando] = useState(false)
  const [abierto, setAbierto] = useState<'examen' | 'certificado' | null>(null)
  const [realizado, setRealizado] = useState(!!examen || !resultado)
  const [fecha, setFecha] = useState(examen?.fechaISO ?? hoy)
  const [concepto, setConcepto] = useState<Concepto>(examen?.concepto ?? 'APTO')
  const [archivo, setArchivo] = useState<{ nombre: string; dataUri: string } | null>(null)
  const [g, setG] = useState(false)
  const editable = puedeEditar && !cerrada
  const certificadoDocId = examen?.certificadoDocId ?? null

  function cerrar() { setAbierto(null); setArchivo(null) }

  async function generar() {
    setGenerando(true)
    const res = await generarOrdenExamen({ id: terminacionId })
    setGenerando(false)
    if (res.ok) { toast.success('Orden generada: ya la tiene el trabajador en su autoservicio.'); router.refresh() } else toast.error(res.error)
  }

  async function guardar() {
    setG(true)
    const res = await registrarExamen({ id: terminacionId, realizado, fecha, concepto: realizado ? concepto : undefined, certificado: realizado ? archivo?.dataUri : undefined })
    setG(false)
    if (!res.ok) { toast.error(res.error); return }
    toast.success(realizado && !archivo && !certificadoDocId ? 'Examen registrado. El certificado se puede adjuntar después.' : 'Examen registrado.')
    cerrar()
    router.refresh()
  }

  async function adjuntar() {
    if (!archivo) return
    setG(true)
    const res = await adjuntarCertificadoExamen({ id: terminacionId, certificado: archivo.dataUri })
    setG(false)
    if (!res.ok) { toast.error(res.error); return }
    toast.success('Certificado guardado.')
    cerrar()
    router.refresh()
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
        <FileText className="size-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-medium">Orden del examen</span>
        {ordenDocId ? <Pill tone="ok">Entregada</Pill> : <Pill tone="muted">Por generar</Pill>}
        <span className="flex-1" />
        <div className="flex items-center gap-1.5">
          {ordenDocId && (
            <VisorPdf documentoId={ordenDocId} titulo="Orden de examen médico de egreso" className={buttonVariants({ size: 'sm', variant: 'outline' }) + ' gap-1.5'}>
              <FileText className="size-3.5" /> Ver
            </VisorPdf>
          )}
          {editable && (
            <Button size="sm" variant={ordenDocId ? 'ghost' : 'default'} onClick={generar} disabled={generando}>
              {generando ? <Spinner /> : <FilePlus2 className="size-4" />} {ordenDocId ? 'Rehacer' : 'Generar'}
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
        <Stethoscope className="size-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-medium">Examen</span>
        {resultado ? <Pill tone="ok">{resultado}</Pill> : <Pill tone="muted">Pendiente</Pill>}
        {examen && !certificadoDocId && <Pill tone="warn">Sin certificado</Pill>}
        <span className="flex-1" />
        <div className="flex flex-wrap items-center justify-end gap-1.5">
          {/* El certificado es dato de salud: el visor solo lo abre quien tiene acceso a datos médicos. */}
          {certificadoDocId && (
            <VisorPdf documentoId={certificadoDocId} titulo="Certificado de examen médico de egreso" className={buttonVariants({ size: 'sm', variant: 'outline' }) + ' gap-1.5'}>
              <FileText className="size-3.5" /> Certificado
            </VisorPdf>
          )}
          {editable && examen && (
            <Button size="sm" variant={certificadoDocId ? 'ghost' : 'default'} onClick={() => setAbierto('certificado')}>
              <Paperclip className="size-4" /> {certificadoDocId ? 'Cambiar' : 'Adjuntar certificado'}
            </Button>
          )}
          {editable && (
            <Button size="sm" variant={resultado ? 'ghost' : 'default'} onClick={() => setAbierto('examen')}>
              <ClipboardCheck className="size-4" /> {resultado ? 'Corregir' : 'Registrar'}
            </Button>
          )}
        </div>
      </div>

      {/* Registrar (o corregir) el examen; el certificado va si se tiene a la mano. */}
      <Dialog open={abierto === 'examen'} onOpenChange={(o) => { if (!g && !o) cerrar() }}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader><DialogTitle>Examen de egreso</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant={realizado ? 'default' : 'outline'} onClick={() => setRealizado(true)}>Se realizó</Button>
              <Button type="button" variant={!realizado ? 'default' : 'outline'} onClick={() => setRealizado(false)}>No asistió</Button>
            </div>
            {realizado ? (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="fecha-examen">Fecha <span className="text-destructive">*</span></Label>
                    <Input id="fecha-examen" type="date" value={fecha} max={hoy} onChange={(e) => setFecha(e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Concepto <span className="text-destructive">*</span></Label>
                    <Select value={concepto} onValueChange={(v) => setConcepto(v as Concepto)}>
                      <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                      <SelectContent>{(Object.keys(CONCEPTO) as Concepto[]).map((c) => <SelectItem key={c} value={c}>{CONCEPTO[c]}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="certificado-egreso">Certificado</Label>
                  <ArchivoInput id="certificado-egreso" archivo={archivo} onArchivo={setArchivo} />
                  {!archivo && <p className="text-[11px] text-muted-foreground">{certificadoDocId ? 'Si no eliges archivo, se conserva el certificado que ya está.' : 'Se puede adjuntar después desde este mismo paso.'}</p>}
                </div>
                <p className="text-[11px] text-muted-foreground">Queda en SST como examen de egreso; el certificado solo lo ve quien tiene acceso a datos médicos.</p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">Queda la constancia de que no se presentó al examen dentro de los 5 días hábiles.</p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={cerrar} disabled={g}>Cancelar</Button>
            <Button onClick={guardar} disabled={g || (realizado && !fecha)}>{g && <Spinner />}Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Adjuntar o reemplazar el certificado de un examen ya registrado. */}
      <Dialog open={abierto === 'certificado'} onOpenChange={(o) => { if (!g && !o) cerrar() }}>
        <DialogContent aria-describedby={undefined}>
          <DialogHeader><DialogTitle>{certificadoDocId ? 'Cambiar certificado' : 'Adjuntar certificado'}</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="certificado-egreso-adj">Certificado del examen <span className="text-destructive">*</span></Label>
            <ArchivoInput id="certificado-egreso-adj" archivo={archivo} onArchivo={setArchivo} />
            <p className="text-[11px] text-muted-foreground">{certificadoDocId ? 'El certificado anterior se reemplaza. ' : ''}Solo lo ve quien tiene acceso a datos médicos.</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={cerrar} disabled={g}>Cancelar</Button>
            <Button onClick={adjuntar} disabled={g || !archivo}>{g && <Spinner />}Guardar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
