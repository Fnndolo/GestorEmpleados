'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Lock, Pencil, Plus, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Switch } from '@/components/ui/switch'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { guardarConceptoNomina, alternarConceptoNomina } from './acciones'

export type ConceptoItem = {
  id: string; codigo: string; nombre: string; tipo: string; esSistema: boolean; activo: boolean
  constitutivoSalario: boolean; afectaIbcSs: boolean; basePrestaciones: boolean; baseVacaciones: boolean
  valorFijo: number | null; cuentaContable: string | null
}

const fmtCOP = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)

export function ConceptosCliente({ puedeEditar, conceptos }: { puedeEditar: boolean; conceptos: ConceptoItem[] }) {
  const router = useRouter()
  const [editando, setEditando] = useState<ConceptoItem | null>(null)
  const [creando, setCreando] = useState(false)

  async function alternar(c: ConceptoItem, activo: boolean) {
    const res = await alternarConceptoNomina({ id: c.id, activo })
    if (res.ok) { toast.success(activo ? 'Concepto activado.' : 'Concepto desactivado.'); router.refresh() }
    else toast.error(res.error)
  }

  const grupos: { titulo: string; items: ConceptoItem[] }[] = [
    { titulo: 'Del sistema (tratamiento de ley, solo lectura)', items: conceptos.filter((c) => c.esSistema) },
    { titulo: 'Configurables de la empresa', items: conceptos.filter((c) => !c.esSistema) },
  ]

  return (
    <div className="space-y-6">
      {puedeEditar && (
        <div className="flex justify-end">
          <Button onClick={() => setCreando(true)}><Plus className="size-4" /> Nuevo concepto</Button>
        </div>
      )}

      {grupos.map((g) => (
        <section key={g.titulo}>
          <h2 className="mb-2 text-[13px] font-bold">{g.titulo}</h2>
          {g.items.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
              Aún no hay conceptos propios. Crea el primero (p. ej. «Auxilio de alimentación»).
            </CardContent></Card>
          ) : (
            <Card><CardContent className="divide-y p-0">
              {g.items.map((c) => (
                <div key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                      {c.nombre}
                      <span className="text-xs font-normal text-muted-foreground">({c.codigo})</span>
                      <Badge variant={c.tipo === 'DEVENGADO' ? 'default' : 'destructive'} className="text-[10px]">
                        {c.tipo === 'DEVENGADO' ? 'Devengado' : 'Deducción'}
                      </Badge>
                      {c.tipo === 'DEVENGADO' && (
                        <Badge variant="secondary" className="text-[10px]">
                          {c.constitutivoSalario ? 'Constitutivo de salario' : 'No constitutivo'}
                        </Badge>
                      )}
                      {!c.activo && <Badge variant="outline" className="text-[10px]">Inactivo</Badge>}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {[
                        c.afectaIbcSs ? 'IBC' : null,
                        c.basePrestaciones ? 'prestaciones' : null,
                        c.baseVacaciones ? 'vacaciones' : null,
                      ].filter(Boolean).join(' · ') || (c.tipo === 'DEVENGADO' ? 'No afecta bases' : 'Descuento del neto')}
                      {c.valorFijo ? ` · valor fijo ${fmtCOP(c.valorFijo)}` : ''}
                      {c.cuentaContable ? ` · cta. ${c.cuentaContable}` : ''}
                    </p>
                  </div>
                  {c.esSistema ? (
                    <Lock className="size-4 shrink-0 text-muted-foreground" />
                  ) : puedeEditar ? (
                    <>
                      <Switch checked={c.activo} onCheckedChange={(v) => alternar(c, v)} />
                      <Button size="icon" variant="ghost" className="size-8" onClick={() => setEditando(c)} title="Editar">
                        <Pencil className="size-4" />
                      </Button>
                    </>
                  ) : null}
                </div>
              ))}
            </CardContent></Card>
          )}
        </section>
      ))}

      {(creando || editando) && (
        <DialogConcepto
          concepto={editando}
          onClose={() => { setCreando(false); setEditando(null) }}
          onDone={() => { setCreando(false); setEditando(null); router.refresh() }}
        />
      )}
    </div>
  )
}

function DialogConcepto({ concepto, onClose, onDone }: { concepto: ConceptoItem | null; onClose: () => void; onDone: () => void }) {
  const [codigo, setCodigo] = useState(concepto?.codigo ?? '')
  const [nombre, setNombre] = useState(concepto?.nombre ?? '')
  const [tipo, setTipo] = useState<'DEVENGADO' | 'DEDUCCION'>((concepto?.tipo as 'DEVENGADO') ?? 'DEVENGADO')
  const [constitutivo, setConstitutivo] = useState(concepto?.constitutivoSalario ?? false)
  const [ibc, setIbc] = useState(concepto?.afectaIbcSs ?? false)
  const [prest, setPrest] = useState(concepto?.basePrestaciones ?? false)
  const [vac, setVac] = useState(concepto?.baseVacaciones ?? false)
  const [valorFijo, setValorFijo] = useState(concepto?.valorFijo ? String(concepto.valorFijo) : '')
  const [cuenta, setCuenta] = useState(concepto?.cuentaContable ?? '')
  const [g, setG] = useState(false)

  /** Constitutivo (art. 127 CST) implica IBC + prestaciones + vacaciones; se puede afinar después. */
  function cambiarConstitutivo(v: boolean) {
    setConstitutivo(v)
    setIbc(v); setPrest(v); setVac(v)
  }

  async function guardar() {
    setG(true)
    const res = await guardarConceptoNomina({
      id: concepto?.id,
      codigo: codigo.trim().toUpperCase(),
      nombre: nombre.trim(),
      tipo,
      constitutivoSalario: tipo === 'DEVENGADO' && constitutivo,
      afectaIbcSs: tipo === 'DEVENGADO' && ibc,
      basePrestaciones: tipo === 'DEVENGADO' && prest,
      baseVacaciones: tipo === 'DEVENGADO' && vac,
      valorFijo: valorFijo ? Number(valorFijo) : undefined,
      cuentaContable: cuenta.trim() || undefined,
      activo: concepto?.activo ?? true,
    })
    setG(false)
    if (res.ok) { toast.success(concepto ? 'Concepto actualizado.' : 'Concepto creado.'); onDone() }
    else toast.error(res.error)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{concepto ? `Editar ${concepto.nombre}` : 'Nuevo concepto de nómina'}</DialogTitle>
          <DialogDescription>
            Si el pago retribuye directamente el trabajo, es constitutivo de salario (art. 127 CST). Los auxilios y beneficios pactados como no salariales (art. 128) no afectan las bases.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Código</Label>
              <Input value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} placeholder="AUX_ALIMENTACION" disabled={!!concepto} />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as 'DEVENGADO')}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="DEVENGADO">Devengado (suma)</SelectItem>
                  <SelectItem value="DEDUCCION">Deducción (descuenta)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Nombre</Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Auxilio de alimentación" />
          </div>

          {tipo === 'DEVENGADO' && (
            <div className="space-y-2.5 rounded-lg border p-3">
              <label className="flex items-start gap-2.5 text-sm">
                <Checkbox checked={constitutivo} onCheckedChange={(v) => cambiarConstitutivo(v === true)} className="mt-0.5" />
                <span>
                  <span className="font-medium">Constitutivo de salario</span>
                  <span className="block text-xs text-muted-foreground">Entra al IBC de seguridad social y a las bases de cesantías, prima y vacaciones.</span>
                </span>
              </label>
              <div className="grid gap-1.5 pl-7 text-xs">
                <label className="flex items-center gap-2"><Checkbox checked={ibc} onCheckedChange={(v) => setIbc(v === true)} /> Afecta IBC (salud, pensión, ARL)</label>
                <label className="flex items-center gap-2"><Checkbox checked={prest} onCheckedChange={(v) => setPrest(v === true)} /> Base de cesantías y prima</label>
                <label className="flex items-center gap-2"><Checkbox checked={vac} onCheckedChange={(v) => setVac(v === true)} /> Base de vacaciones</label>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Valor fijo (opcional)</Label>
              <Input type="number" step="1" value={valorFijo} onChange={(e) => setValorFijo(e.target.value)} placeholder="Se puede indicar al aplicarlo" />
            </div>
            <div className="space-y-1.5">
              <Label>Cuenta contable (opcional)</Label>
              <Input value={cuenta} onChange={(e) => setCuenta(e.target.value)} placeholder="510530" />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={g || !nombre.trim() || (!concepto && !codigo.trim())}>
            {g ? <Spinner /> : <Save className="size-4" />} Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
