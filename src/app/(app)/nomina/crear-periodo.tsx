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
import { crearPeriodo, liquidar } from './acciones'
import { avisosDeNomina } from './[id]/acciones-cliente'

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

  /**
   * Crea el periodo y lo liquida de una vez: no hay un paso intermedio de
   * "borrador" que revisar. Lo calculado se revisa en el periodo y, si faltaba
   * una novedad, se registra y se recalcula. Si el cálculo falla (p. ej. no hay
   * SMMLV vigente), el periodo queda creado y se calcula desde su pantalla.
   */
  async function crear() {
    setG(true)
    const res = await crearPeriodo({ anio: Number(anio), mes: Number(mes), tipo, quincena: tipo === 'QUINCENAL' ? Number(quincena) : undefined })
    if (!res.ok) { setG(false); toast.error(res.error); return }
    const id = (res.datos as { id: string }).id
    const liq = await liquidar({ periodoId: id })
    setG(false)
    if (liq.ok) { toast.success('Periodo creado y calculado.'); avisosDeNomina(liq.datos) }
    else toast.error(`Periodo creado, pero no se pudo calcular: ${liq.error}`)
    setAbierto(false)
    router.push(`/nomina/${id}`)
  }

  return (
    <>
      <Button size="sm" onClick={() => setAbierto(true)} aria-label="Nuevo periodo" title="Nuevo periodo"><Plus className="size-4" /> <span className="hidden sm:inline">Nuevo periodo</span></Button>
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
            <Button onClick={crear} disabled={g}>{g && <Spinner />}{g ? 'Calculando…' : 'Crear y calcular'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
