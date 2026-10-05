'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Landmark, Lock, Pencil, Save } from 'lucide-react'
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
import { BotonEliminar } from '@/components/ui-kit/boton-eliminar'
import { BotonAgregar } from '@/components/ui-kit/boton-agregar'
import { Ayuda } from '@/components/ui-kit/ayuda'
import { guardarConceptoNomina, alternarConceptoNomina, actualizarCuentaContable, eliminarConceptoNomina } from './acciones'

export type ConceptoItem = {
  id: string; codigo: string; nombre: string; tipo: string; esSistema: boolean; activo: boolean
  constitutivoSalario: boolean; afectaIbcSs: boolean; basePrestaciones: boolean; baseVacaciones: boolean
  valorFijo: number | null; cuentaContable: string | null
}

const fmtCOP = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n)

export function ConceptosCliente({ puedeEditar, conceptos }: { puedeEditar: boolean; conceptos: ConceptoItem[] }) {
  const router = useRouter()
  const [editando, setEditando] = useState<ConceptoItem | null>(null)
  const [cuentaDe, setCuentaDe] = useState<ConceptoItem | null>(null)

  async function borrar(c: ConceptoItem) {
    const res = await eliminarConceptoNomina({ id: c.id })
    if (res.ok) { toast.success(`«${c.nombre}» eliminado.`); router.refresh() }
    else toast.error(res.error, { duration: 8000 })
  }

  async function alternar(c: ConceptoItem, activo: boolean) {
    const res = await alternarConceptoNomina({ id: c.id, activo })
    if (res.ok) { toast.success(activo ? 'Concepto activado.' : 'Concepto desactivado.'); router.refresh() }
    else toast.error(res.error)
  }

  const grupos: { titulo: string; ayuda?: string; items: ConceptoItem[] }[] = [
    {
      titulo: 'Del sistema',
      ayuda: 'Tratamiento de ley, solo lectura: sus banderas las aplica el motor de nómina. De estos solo se cambia la cuenta contable.',
      items: conceptos.filter((c) => c.esSistema),
    },
    { titulo: 'De la empresa', items: conceptos.filter((c) => !c.esSistema) },
  ]

  return (
    <div className="space-y-6">
      {grupos.map((g) => (
        <section key={g.titulo}>
          <h2 className="mb-2 flex items-center gap-1.5 text-[13px] font-bold">
            {g.titulo}
            {g.ayuda && <Ayuda texto={g.ayuda} etiqueta={`Sobre los conceptos ${g.titulo.toLowerCase()}`} />}
          </h2>
          {g.items.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">
              Aún no hay conceptos propios.
            </CardContent></Card>
          ) : (
            <Card className="py-0"><CardContent className="divide-y p-0">
              {g.items.map((c) => (
                <div key={c.id} className="flex items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-4">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {c.nombre}
                      {!c.activo && <Badge variant="outline" className="ml-1.5 align-middle text-[10px]">Inactivo</Badge>}
                    </p>
                    {/* Completo (sin cortar): código, si constituye salario, a qué bases entra y la cuenta. */}
                    <p className="text-xs leading-snug text-muted-foreground">
                      {[
                        c.codigo,
                        c.tipo === 'DEVENGADO' ? (c.constitutivoSalario ? 'Constitutivo' : 'No constitutivo') : null,
                        [
                          c.afectaIbcSs ? 'IBC' : null,
                          c.basePrestaciones ? 'prestaciones' : null,
                          c.baseVacaciones ? 'vacaciones' : null,
                        ].filter(Boolean).join(' · ') || (c.tipo === 'DEVENGADO' ? 'No afecta bases' : 'Descuento del neto'),
                        c.valorFijo ? `valor fijo ${fmtCOP(c.valorFijo)}` : null,
                        c.cuentaContable ? `cta. ${c.cuentaContable}` : null,
                      ].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  {/* Columna fija: Devengado/Deducción queda en el mismo sitio en todas las filas. */}
                  <Badge variant={c.tipo === 'DEVENGADO' ? 'default' : 'destructive'} className="w-[76px] shrink-0 justify-center text-[10px]">
                    {c.tipo === 'DEVENGADO' ? 'Devengado' : 'Deducción'}
                  </Badge>
                  {c.esSistema ? (
                    puedeEditar ? (
                      // Lo único suyo que sí se puede cambiar: la cuenta contable
                      // no entra en ningún cálculo y cada empresa tiene su plan.
                      <Button
                        size="icon" variant="ghost" className="size-8" onClick={() => setCuentaDe(c)}
                        title="Cambiar la cuenta contable" aria-label={`Cambiar la cuenta contable de ${c.nombre}`}
                      >
                        <Landmark className="size-4" />
                      </Button>
                    ) : (
                      <Lock className="size-4 shrink-0 text-muted-foreground" aria-label="Solo lectura" />
                    )
                  ) : puedeEditar ? (
                    <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
                      <Switch checked={c.activo} onCheckedChange={(v) => alternar(c, v)} aria-label={c.activo ? 'Desactivar' : 'Activar'} className="mr-1" />
                      <Button size="icon" variant="ghost" className="size-8" onClick={() => setEditando(c)} title="Editar" aria-label={`Editar ${c.nombre}`}>
                        <Pencil className="size-4" />
                      </Button>
                      <BotonEliminar onEliminar={() => borrar(c)} etiqueta={`Eliminar ${c.nombre}`} />
                    </div>
                  ) : null}
                </div>
              ))}
            </CardContent></Card>
          )}
        </section>
      ))}

      {editando && (
        <DialogConcepto
          concepto={editando}
          onClose={() => setEditando(null)}
          onDone={() => { setEditando(null); router.refresh() }}
        />
      )}
      {cuentaDe && (
        <DialogCuentaContable
          concepto={cuentaDe}
          onClose={() => setCuentaDe(null)}
          onDone={() => { setCuentaDe(null); router.refresh() }}
        />
      )}
    </div>
  )
}

/**
 * El + del encabezado de la página. Lleva su propio estado para que la página
 * (server) lo pueda poner en el encabezado sin volverse cliente.
 */
export function NuevoConcepto() {
  const router = useRouter()
  const [abierto, setAbierto] = useState(false)
  return (
    <>
      <BotonAgregar etiqueta="Nuevo concepto" onClick={() => setAbierto(true)} />
      {abierto && (
        <DialogConcepto concepto={null} onClose={() => setAbierto(false)} onDone={() => { setAbierto(false); router.refresh() }} />
      )}
    </>
  )
}

/**
 * Cambia solo la cuenta contable de un concepto del sistema.
 *
 * Se separa del diálogo de edición porque de un concepto de ley esto es lo
 * único que se toca: el resto de sus banderas las aplica el motor de nómina y
 * cambiarlas dejaría la pantalla diciendo algo distinto de lo que se calcula.
 */
function DialogCuentaContable({ concepto, onClose, onDone }: { concepto: ConceptoItem; onClose: () => void; onDone: () => void }) {
  const [cuenta, setCuenta] = useState(concepto.cuentaContable ?? '')
  const [g, setG] = useState(false)

  async function guardar() {
    setG(true)
    const res = await actualizarCuentaContable({ id: concepto.id, cuentaContable: cuenta.trim() })
    setG(false)
    if (res.ok) { toast.success('Cuenta contable actualizada.'); onDone() }
    else toast.error(res.error)
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cuenta contable — {concepto.nombre}</DialogTitle>
          <DialogDescription>Solo afecta el asiento contable, no el cálculo.</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label className="gap-1.5">
            Cuenta
            <Ayuda
              texto="Es el único dato editable de un concepto del sistema: cada empresa tiene su propio plan de cuentas. Déjala vacía para quitarla."
              etiqueta="Sobre la cuenta contable"
            />
          </Label>
          {/* autoFocus: si no, el diálogo enfoca el ⓘ (va antes) y abre su texto encima del título. */}
          <Input value={cuenta} onChange={(e) => setCuenta(e.target.value)} placeholder="510506" autoFocus />
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={guardar} disabled={g}>{g ? <Spinner /> : <Save className="size-4" />} Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
          <DialogDescription className="sr-only">Código, tipo y bases a las que entra el concepto.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Código {!concepto && <span className="text-destructive">*</span>}</Label>
              <Input value={codigo} onChange={(e) => setCodigo(e.target.value.toUpperCase())} placeholder="AUX_ALIMENTACION" disabled={!!concepto} />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo <span className="text-destructive">*</span></Label>
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
            <Label>Nombre <span className="text-destructive">*</span></Label>
            <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Auxilio de alimentación" />
          </div>

          {tipo === 'DEVENGADO' && (
            <div className="space-y-2.5 rounded-lg border p-3">
              {/* El ⓘ va fuera del <label>: tocarlo no debe marcar la casilla. */}
              <div className="flex items-center gap-1.5">
                <label className="flex items-center gap-2.5 text-sm font-medium">
                  <Checkbox checked={constitutivo} onCheckedChange={(v) => cambiarConstitutivo(v === true)} />
                  Constitutivo de salario
                </label>
                <Ayuda
                  texto="Si el pago retribuye directamente el trabajo, es constitutivo de salario (art. 127 CST): entra al IBC de seguridad social y a las bases de cesantías, prima y vacaciones. Los auxilios y beneficios pactados como no salariales (art. 128) no afectan las bases."
                  etiqueta="Sobre el salario constitutivo"
                />
              </div>
              <div className="grid gap-1.5 pl-7 text-xs">
                <label className="flex items-center gap-2"><Checkbox checked={ibc} onCheckedChange={(v) => setIbc(v === true)} /> Afecta IBC (salud, pensión, ARL)</label>
                <label className="flex items-center gap-2"><Checkbox checked={prest} onCheckedChange={(v) => setPrest(v === true)} /> Base de cesantías y prima</label>
                <label className="flex items-center gap-2"><Checkbox checked={vac} onCheckedChange={(v) => setVac(v === true)} /> Base de vacaciones</label>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="gap-1.5">
                Valor fijo
                <Ayuda texto="Si lo dejas vacío, el valor se indica al aplicarlo." etiqueta="Sobre el valor fijo" />
              </Label>
              <Input type="number" step="1" value={valorFijo} onChange={(e) => setValorFijo(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Cuenta contable</Label>
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
