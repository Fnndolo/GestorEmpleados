'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { FileBadge, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { generarCertificacionRRHH } from '../certificacion-acciones'

export function BotonCertificacion({ colaboradorId }: { colaboradorId: string }) {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  const [tipo, setTipo] = useState<'SIMPLE' | 'CON_SALARIO' | 'CON_FUNCIONES' | 'ENTIDAD_FINANCIERA'>('SIMPLE')
  const [dirigidaA, setDirigidaA] = useState('')
  const [g, setG] = useState(false)
  const [docId, setDocId] = useState<string | null>(null)

  async function generar() {
    setG(true)
    const res = await generarCertificacionRRHH({ colaboradorId, tipo, dirigidaA: dirigidaA || undefined })
    setG(false)
    if (res.ok) {
      toast.success('Certificación generada.')
      setDocId((res.datos as { documentoId: string }).documentoId)
      router.refresh()
    } else toast.error(res.error)
  }

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => { setAbierto(true); setDocId(null) }}>
        <FileBadge className="size-4" /> Certificación
      </Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generar certificación laboral</DialogTitle>
            <DialogDescription>El PDF se guarda en los documentos del colaborador.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as 'SIMPLE')}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="SIMPLE">Simple (cargo y fechas)</SelectItem>
                  <SelectItem value="CON_SALARIO">Con salario</SelectItem>
                  <SelectItem value="CON_FUNCIONES">Con funciones</SelectItem>
                  <SelectItem value="ENTIDAD_FINANCIERA">Para entidad financiera</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Dirigida a (opcional)</Label><Input value={dirigidaA} onChange={(e) => setDirigidaA(e.target.value)} /></div>
            {docId && (
              <Button variant="outline" className="w-full" asChild>
                <a href={`/api/documentos/${docId}`} target="_blank" rel="noreferrer"><Download className="size-4" /> Descargar PDF</a>
              </Button>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAbierto(false)}>Cerrar</Button>
            <Button onClick={generar} disabled={g}>{g ? <Spinner /> : <FileBadge className="size-4" />} Generar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
