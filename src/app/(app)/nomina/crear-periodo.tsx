'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { crearPeriodo } from './acciones'

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export function CrearPeriodo() {
  const router = useRouter()
  const ahora = new Date()
  const [abierto, setAbierto] = useState(false)
  const [anio, setAnio] = useState(String(ahora.getUTCFullYear()))
  const [mes, setMes] = useState(String(ahora.getUTCMonth() + 1))
  const [tipo, setTipo] = useState<'MENSUAL' | 'QUINCENAL'>('MENSUAL')
  const [quincena, setQuincena] = useState('1')
  const [g, setG] = useState(false)

  async function crear() {
    setG(true)
    const res = await crearPeriodo({ anio: Number(anio), mes: Number(mes), tipo, quincena: tipo === 'QUINCENAL' ? Number(quincena) : undefined })
    setG(false)
    if (res.ok) { toast.success('Periodo creado.'); setAbierto(false); router.push(`/nomina/${(res.datos as { id: string }).id}`) }
    else toast.error(res.error)
  }

  return (
    <>
      <Button size="sm" onClick={() => setAbierto(true)}><Plus className="size-4" /> Nuevo periodo</Button>
      <Dialog open={abierto} onOpenChange={setAbierto}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nuevo periodo de nómina</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Mes</Label>
                <Select value={mes} onValueChange={setMes}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{MESES.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Año</Label>
                <Select value={anio} onValueChange={setAnio}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>{[2025, 2026, 2027].map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Periodicidad</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as 'MENSUAL')}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="MENSUAL">Mensual</SelectItem>
                  <SelectItem value="QUINCENAL">Quincenal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {tipo === 'QUINCENAL' && (
              <div className="space-y-1.5">
                <Label>Quincena</Label>
                <Select value={quincena} onValueChange={setQuincena}>
                  <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="1">Primera (1-15)</SelectItem><SelectItem value="2">Segunda (16-30)</SelectItem></SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setAbierto(false)}>Cancelar</Button>
            <Button onClick={crear} disabled={g}>{g && <Spinner />}Crear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
