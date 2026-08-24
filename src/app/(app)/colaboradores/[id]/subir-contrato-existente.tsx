'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Upload } from 'lucide-react'
import { subirContratoExistente } from '../../contratos/acciones'
import { subirContratoOpsExistente } from '../../contratos/ops-acciones'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Spinner } from '@/components/ui/spinner'
import { Checkbox } from '@/components/ui/checkbox'
import { Ayuda } from '@/components/ui-kit/ayuda'
import { fmtCOP } from '@/lib/moneda'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { avisoVinculoAjustado, type AjusteVinculo } from '@/lib/vinculo-contrato'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

// 3 MB de PDF ≈ 4 MB en base64, el tope del cuerpo de la Server Action
// (ver serverActions.bodySizeLimit en next.config.ts).
// Los dos PDF (contrato + autorización) viajan juntos en el mismo cuerpo, así que
// el tope de 3 MB aplica a la SUMA de ambos.
const MAX_PDF_BYTES = 3 * 1024 * 1024

/**
 * Quita las flechitas de incremento del <input type="number">. En importes no
 * sirven —nadie sube un salario de a un peso— y encima invitan a un clic que
 * cambia la cifra sin querer. Se conserva type="number" para que el móvil
 * siga abriendo el teclado numérico.
 */
const SIN_FLECHAS =
  '[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none'

const TIPOS_LABORAL = [
  { v: 'TERMINO_INDEFINIDO', l: 'Término indefinido' },
  { v: 'TERMINO_FIJO', l: 'Término fijo' },
  { v: 'OBRA_LABOR', l: 'Obra o labor' },
  { v: 'APRENDIZAJE_SENA', l: 'Aprendizaje SENA' },
] as const

type TipoLaboral = (typeof TIPOS_LABORAL)[number]['v']

/**
 * Carga de un contrato que YA EXISTE (firmado en físico / hecho fuera del sistema)
 * para el colaborador de esta ficha: crea el registro del contrato con los datos
 * mínimos que necesitan nómina y las alertas, y adjunta el PDF aportado.
 * La creación de contratos NUEVOS (desde plantilla) vive en Contratación.
 */
export function SubirContratoExistente({
  colaboradorId, sedeId, cargoId, auxTransporte,
}: {
  colaboradorId: string
  sedeId: string
  cargoId: string | null
  /** Valor legal vigente del auxilio de transporte, solo informativo. */
  auxTransporte: number
}) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [clase, setClase] = useState<'LABORAL' | 'OPS'>('LABORAL')
  const [pdf, setPdf] = useState<File | null>(null)
  const [autorizacion, setAutorizacion] = useState<File | null>(null)

  // Campos comunes / laborales
  const [tipo, setTipo] = useState<TipoLaboral>('TERMINO_INDEFINIDO')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')
  const [salario, setSalario] = useState('')
  const [tieneAuxTransporte, setTieneAuxTransporte] = useState(true)
  const [objetoObra, setObjetoObra] = useState('')
  // Campos OPS
  const [objeto, setObjeto] = useState('')
  const [valorTotal, setValorTotal] = useState('')
  const [valorMensual, setValorMensual] = useState('')

  function limpiar() {
    setPdf(null); setAutorizacion(null); setFechaInicio(''); setFechaFin(''); setSalario('')
    setTieneAuxTransporte(true); setObjetoObra(''); setObjeto(''); setValorTotal(''); setValorMensual('')
    setTipo('TERMINO_INDEFINIDO'); setClase('LABORAL')
  }

  async function leerPdf(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as string)
      reader.onerror = () => reject(new Error('lectura'))
      reader.readAsDataURL(file)
    })
  }

  async function guardar() {
    if (!pdf) { toast.error('Adjunta el PDF del contrato.'); return }
    // El PDF viaja como data URI dentro de la Server Action (base64: +33 %), y
    // el cuerpo admite 4 MB. Se avisa aquí para no fallar tras la espera.
    const pesoTotal = pdf.size + (autorizacion?.size ?? 0)
    if (pesoTotal > MAX_PDF_BYTES) {
      toast.error(`Los PDF suman ${(pesoTotal / 1024 / 1024).toFixed(1)} MB y el máximo son 3 MB en total. Comprímelos o escanéalos en blanco y negro a menor resolución.`)
      return
    }
    if (!fechaInicio) { toast.error('Indica la fecha de inicio.'); return }
    if (clase === 'OPS' && !fechaFin) { toast.error('Un contrato OPS requiere fecha de fin.'); return }
    if (clase === 'LABORAL' && tipo === 'TERMINO_FIJO' && !fechaFin) { toast.error('Un contrato a término fijo requiere fecha de fin.'); return }

    setGuardando(true)
    let pdfBase64: string
    let autorizacionBase64 = ''
    try {
      pdfBase64 = await leerPdf(pdf)
      if (autorizacion) autorizacionBase64 = await leerPdf(autorizacion)
    } catch {
      setGuardando(false); toast.error('No se pudo leer el PDF.'); return
    }

    const res = clase === 'LABORAL'
      ? await subirContratoExistente({
          colaboradorId, sedeId, cargoId: cargoId ?? '',
          tipo, jornada: 'TIEMPO_COMPLETO', modalidadTrabajo: 'PRESENCIAL', tipoSalario: 'ORDINARIO',
          salarioBase: Number(salario) || 0, tieneAuxTransporte, fechaInicio, fechaFin: fechaFin || '',
          objetoObraLabor: objetoObra, pdfBase64,
          autorizacionBase64,
        })
      : await subirContratoOpsExistente({
          colaboradorId, sedeId, objeto,
          valorTotal: Number(valorTotal) || 0,
          valorMensual: valorMensual ? Number(valorMensual) : undefined,
          fechaInicio, fechaFin, pdfBase64,
          autorizacionBase64,
        })

    setGuardando(false)
    if (res.ok) {
      toast.success('Contrato cargado y registrado (firmado en físico).')
      const aviso = avisoVinculoAjustado((res.datos as { vinculoAjustado?: AjusteVinculo }).vinculoAjustado)
      if (aviso) toast.info(aviso, { duration: 8000 })
      setAbierto(false)
      limpiar()
      router.refresh()
    } else toast.error(res.error)
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setAbierto(true)}>
        <Upload className="size-4" /> Subir contrato existente
      </Button>

      <Dialog open={abierto} onOpenChange={(o) => { if (!guardando) { setAbierto(o); if (!o) limpiar() } }}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Subir contrato existente</DialogTitle>
            <DialogDescription className="flex items-center gap-1.5">
              Contrato ya firmado en físico
              <Ayuda texto="Se registra el contrato con estos datos (los necesitan nómina y las alertas de vencimiento) y se adjunta el PDF. No se pide firma digital." />
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Clase de contrato</Label>
              <Select value={clase} onValueChange={(v) => setClase(v as 'LABORAL' | 'OPS')}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="LABORAL">Laboral</SelectItem>
                  <SelectItem value="OPS">Prestación de servicios (OPS)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {clase === 'LABORAL' ? (
              <>
                <div className="space-y-1.5">
                  <Label>Tipo de contrato</Label>
                  <Select value={tipo} onValueChange={(v) => setTipo(v as TipoLaboral)}>
                    <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {TIPOS_LABORAL.map((t) => <SelectItem key={t.v} value={t.v}>{t.l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Salario base</Label>
                  <Input type="number" step="1" className={SIN_FLECHAS} value={salario} onChange={(e) => setSalario(e.target.value)} placeholder="0" />
                </div>
                {/* El VALOR del auxilio lo fija el parámetro legal vigente; aquí solo se
                    indica si el contrato lo incluye. */}
                <div className="flex items-center gap-2 rounded-lg border p-3">
                  <Checkbox id="auxT-subir" checked={tieneAuxTransporte} onCheckedChange={(c) => setTieneAuxTransporte(c === true)} />
                  <Label htmlFor="auxT-subir" className="font-normal">Auxilio de transporte</Label>
                  <Ayuda texto={`${auxTransporte > 0 ? `${fmtCOP(auxTransporte)}/mes. ` : ''}Solo se paga si el salario es ordinario y no supera 2 SMMLV. El valor lo fija el parámetro legal vigente, no se escribe aquí.`} />
                </div>
                {tipo === 'OBRA_LABOR' && (
                  <div className="space-y-1.5">
                    <Label>Objeto de la obra o labor</Label>
                    <Textarea rows={2} value={objetoObra} onChange={(e) => setObjetoObra(e.target.value)} />
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="space-y-1.5">
                  <Label>Objeto del contrato</Label>
                  <Textarea rows={2} value={objeto} onChange={(e) => setObjeto(e.target.value)} placeholder="Describe el objeto (mínimo 5 caracteres)" />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Valor total</Label>
                    <Input type="number" step="1" className={SIN_FLECHAS} value={valorTotal} onChange={(e) => setValorTotal(e.target.value)} placeholder="0" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Valor mensual (opcional)</Label>
                    <Input type="number" step="1" className={SIN_FLECHAS} value={valorMensual} onChange={(e) => setValorMensual(e.target.value)} placeholder="0" />
                  </div>
                </div>
              </>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Fecha de inicio</Label>
                <Input type="date" value={fechaInicio} onChange={(e) => setFechaInicio(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Fecha de fin {clase === 'LABORAL' && tipo !== 'TERMINO_FIJO' ? '(opcional)' : ''}</Label>
                <Input type="date" value={fechaFin} onChange={(e) => setFechaFin(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>PDF del contrato</Label>
              <input
                type="file" accept="application/pdf"
                onChange={(e) => setPdf(e.target.files?.[0] ?? null)}
                className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
              />
              {pdf && <p className="text-xs text-muted-foreground">{pdf.name} ({(pdf.size / 1024).toFixed(0)} KB)</p>}
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                Autorización de datos (opcional)
                <Ayuda texto="Autorización de tratamiento de datos firmada en físico (Ley 1581). Si no la tienes digitalizada, puedes subirla después." />
              </Label>
              <input
                type="file" accept="application/pdf"
                onChange={(e) => setAutorizacion(e.target.files?.[0] ?? null)}
                className="block w-full text-sm file:mr-3 file:rounded-md file:border-0 file:bg-primary file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-primary-foreground hover:file:bg-primary/90"
              />
              {autorizacion && <p className="text-xs text-muted-foreground">{autorizacion.name} ({(autorizacion.size / 1024).toFixed(0)} KB)</p>}
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" disabled={guardando} onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button disabled={guardando} onClick={guardar}>
              {guardando ? <Spinner /> : <Upload className="size-4" />} Subir contrato
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
