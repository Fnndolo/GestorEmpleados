'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Paperclip, ShieldCheck, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { adjuntarMiSoporteSs } from '../cuentas-acciones'

/**
 * Adjuntar (o corregir) la planilla PILA de una cuenta de cobro ligada a
 * contrato OPS. La empresa la verifica antes de aprobar el pago.
 */
export function PlanillaPila({
  cuentaId, corregir, observaciones,
}: {
  cuentaId: string
  /** true si el verificador marcó la planilla anterior como inválida. */
  corregir: boolean
  observaciones: string | null
}) {
  const router = useRouter()
  const inputArchivo = useRef<HTMLInputElement>(null)
  const [abierto, setAbierto] = useState(false)
  const [periodo, setPeriodo] = useState('')
  const [operador, setOperador] = useState('')
  const [ibc, setIbc] = useState('')
  const [archivo, setArchivo] = useState<File | null>(null)
  const [g, setG] = useState(false)

  async function enviar() {
    if (!/^\d{4}-\d{2}$/.test(periodo)) { toast.error('Indica el periodo cotizado (AAAA-MM).'); return }
    setG(true)
    const res = await adjuntarMiSoporteSs({
      cuentaId,
      periodoCotizado: periodo,
      operador: operador.trim() || undefined,
      ibcDeclarado: ibc ? Number(ibc) : undefined,
    })
    if (!res.ok) { setG(false); toast.error(res.error); return }
    if (archivo) {
      try {
        const fd = new FormData()
        fd.append('archivo', archivo)
        fd.append('entidadTipo', 'CuentaCobroOps')
        fd.append('entidadId', cuentaId)
        fd.append('nombre', `Planilla PILA — ${periodo}`)
        const up = await fetch('/api/documentos/subir', { method: 'POST', body: fd })
        if (!up.ok) toast.warning('El soporte quedó registrado, pero el archivo no se pudo subir. Intenta adjuntarlo de nuevo.')
      } catch {
        toast.warning('El soporte quedó registrado, pero el archivo no se pudo subir. Intenta adjuntarlo de nuevo.')
      }
    }
    setG(false)
    toast.success('Planilla adjuntada. La empresa la verificará antes de aprobar el pago.')
    setAbierto(false)
    router.refresh()
  }

  return (
    <>
      <Button size="sm" variant={corregir ? 'destructive' : 'outline'} onClick={() => setAbierto(true)}>
        <ShieldCheck className="size-4" /> {corregir ? 'Corregir planilla' : 'Adjuntar planilla PILA'}
      </Button>

      <Dialog open={abierto} onOpenChange={(o) => { if (!g) setAbierto(o) }}>
        <DialogContent className="max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{corregir ? 'Corregir planilla PILA' : 'Adjuntar planilla PILA'}</DialogTitle>
            <DialogDescription>
              Soporte de pago de seguridad social del periodo cotizado. La empresa lo verifica antes de aprobar el pago de la cuenta.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {corregir && observaciones && (
              <div className="flex items-start gap-2 rounded-lg border border-rose-500/40 bg-rose-500/5 p-2.5 text-xs">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-rose-600 dark:text-rose-400" />
                <div>
                  <p className="font-medium">La planilla anterior fue marcada inválida</p>
                  <p className="text-muted-foreground">"{observaciones}"</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Periodo cotizado</Label>
                <Input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} placeholder="2026-06" />
              </div>
              <div className="space-y-1.5">
                <Label>IBC declarado (opcional)</Label>
                <Input type="number" min="0" value={ibc} onChange={(e) => setIbc(e.target.value)} placeholder="Base de cotización" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Operador PILA (opcional)</Label>
              <Input value={operador} onChange={(e) => setOperador(e.target.value)} placeholder="Aportes en Línea, SOI…" />
            </div>
            <div className="space-y-1.5">
              <Label>Archivo de la planilla (imagen o PDF)</Label>
              <input
                ref={inputArchivo}
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(e) => setArchivo(e.target.files?.[0] ?? null)}
              />
              <Button type="button" variant="outline" size="sm" className="w-full justify-start" onClick={() => inputArchivo.current?.click()}>
                <Paperclip className="size-4" /> {archivo ? archivo.name : 'Adjuntar imagen o PDF'}
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setAbierto(false)} disabled={g}>Cancelar</Button>
            <Button onClick={enviar} disabled={g}>{g && <Spinner />}Enviar planilla</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
