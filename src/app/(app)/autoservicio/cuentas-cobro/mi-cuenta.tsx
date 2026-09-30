'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { FirmaCaptura } from '@/components/firma/firma-captura'
import { crearMiCuentaCobro } from '../cuentas-acciones'

export function MiCuentaCobro() {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [periodo, setPeriodo] = useState(new Date().toISOString().slice(0, 7))
  const [valor, setValor] = useState('')
  const [concepto, setConcepto] = useState('')
  const [firma, setFirma] = useState<string | null>(null)
  const [g, setG] = useState(false)

  async function crear() {
    setG(true)
    const res = await crearMiCuentaCobro({ periodo, valor: Number(valor), concepto, firmaDataUri: firma ?? undefined })
    setG(false)
    if (res.ok) { toast.success('Cuenta de cobro enviada. Contabilidad fue notificada.'); setAbierto(false); setFirma(null); router.refresh() }
    else toast.error(res.error)
  }

  return (
    <>
      <Button size="sm" onClick={() => setAbierto(true)}><Plus className="size-4" /> Nueva cuenta de cobro</Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent className="max-h-[88vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva cuenta de cobro</DialogTitle>
            <DialogDescription>Se genera el PDF y se envía a contabilidad y gerencia.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Periodo <span className="text-destructive">*</span></Label><Input type="month" value={periodo} onChange={(e) => setPeriodo(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Valor <span className="text-destructive">*</span></Label><Input type="number" value={valor} onChange={(e) => setValor(e.target.value)} /></div>
            </div>
            <div className="space-y-1.5"><Label>Concepto</Label><Input value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Servicios de asesoría, días laborados…" /></div>
            <div className="space-y-1.5">
              <Label>Firma digital</Label>
              <FirmaCaptura onChange={setFirma} />
            </div>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button><Button onClick={crear} disabled={g || !valor || !periodo}>{g && <Spinner />}Crear y enviar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
