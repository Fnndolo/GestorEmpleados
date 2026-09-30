'use client'

import { useState } from 'react'
import { AdjuntarDocumento } from '@/components/documentos/adjuntar-documento'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { toast } from 'sonner'
import { CircleCheck, CircleX, Eye, ShieldCheck, ShieldAlert, ShieldQuestionMark, ExternalLink, FileMinus, FilePlus } from 'lucide-react'
import { Button, buttonVariants } from '@/components/ui/button'
import { VisorPdf } from '@/components/documentos/visor-pdf'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'
import { fmtCOP } from '@/lib/moneda'
import { formatFechaCorta } from '@/lib/fechas'
import { cn } from '@/lib/utils'
import { cambiarEstadoCuenta, cambiarPilaCuenta } from '../ops-acciones'

type Cuenta = {
  id: string; numero: string; periodo: string; concepto: string | null; valor: number
  estado: string; fechaRadicacion: string; documentoId: string | null
  colaborador: string; esOps: boolean; contratoOpsId: string | null
  /** Se le pidió la planilla PILA: sin ella verificada no se aprueba ni se paga. */
  requierePila: boolean
  /** Verificación del soporte de seguridad social (null: aún no hay soporte). */
  ss: string | null
  planilla: { id: string; nombre: string; esImagen: boolean } | null
}

/** Cómo va la planilla, en una palabra y con su color. */
function estadoPila(c: Cuenta): { texto: string; clase: string; Icono: typeof ShieldCheck } {
  if (!c.requierePila) return { texto: 'No se pidió', clase: 'text-muted-foreground', Icono: FileMinus }
  if (c.ss === 'VALIDA') return { texto: 'Verificada', clase: 'text-emerald-600', Icono: ShieldCheck }
  if (c.ss === 'INVALIDA') return { texto: 'No válida', clase: 'text-destructive', Icono: ShieldAlert }
  if (c.planilla || c.ss === 'PENDIENTE') return { texto: 'Por verificar', clase: 'text-amber-600', Icono: ShieldQuestionMark }
  return { texto: 'Sin adjuntar', clase: 'text-amber-600', Icono: ShieldQuestionMark }
}

const ESTADO: Record<string, string> = {
  RADICADA: 'Radicada', EN_VERIFICACION_SS: 'En verificación', BLOQUEADA_SS: 'Bloqueada (SS)',
  APROBADA: 'Aprobada', PAGADA: 'Pagada', RECHAZADA: 'Rechazada',
}

export function CuentasRevision({ puedeAprobar, puedeEditar, cuentas }: {
  puedeAprobar: boolean
  /** Pedir o dejar de pedir la PILA, como al radicar. */
  puedeEditar: boolean
  cuentas: Cuenta[]
}) {
  const router = useRouter()
  const [proc, setProc] = useState<string | null>(null)

  async function cambiar(id: string, estado: string, conFecha = false) {
    setProc(id)
    const res = await cambiarEstadoCuenta({ id, estado: estado as 'APROBADA', fechaPago: conFecha ? new Date().toISOString().slice(0, 10) : undefined })
    setProc(null)
    if (res.ok) { toast.success('Cuenta actualizada.'); router.refresh() } else toast.error(res.error)
  }

  async function pila(id: string, requierePila: boolean) {
    setProc(id)
    const res = await cambiarPilaCuenta({ id, requierePila })
    setProc(null)
    if (res.ok) { toast.success(requierePila ? 'Planilla PILA pedida. Le avisamos al contratista.' : 'Ya no se pide la planilla PILA.'); router.refresh() } else toast.error(res.error)
  }

  return (
    <div className="space-y-3">
      {cuentas.map((c) => (
        <Card key={c.id}>
          <CardContent className="py-4 space-y-3">
            <div className="flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{c.colaborador} · {c.numero}</p>
                <p className="text-xs text-muted-foreground">Periodo {c.periodo} · {c.concepto ?? 'Sin concepto'} · radicada {formatFechaCorta(new Date(c.fechaRadicacion))}</p>
              </div>
              <span className="text-sm font-medium hidden sm:block">{fmtCOP(c.valor)}</span>
              {c.documentoId && (
                <VisorPdf documentoId={c.documentoId} titulo={`Cuenta de cobro ${c.numero}`} className={buttonVariants({ variant: 'ghost', size: 'icon' })}>
                  <Eye className="size-4" /><span className="sr-only">Ver la cuenta de cobro</span>
                </VisorPdf>
              )}
              {puedeAprobar && (
                <AdjuntarDocumento
                  destino="cuentaCobro" id={c.id} tamano="icon" variante="ghost"
                  tieneDocumento={Boolean(c.documentoId)}
                  etiqueta={c.documentoId ? 'Rehacer o reemplazar la cuenta' : 'Generar o subir la cuenta'}
                />
              )}
              <Badge variant={c.estado === 'PAGADA' || c.estado === 'APROBADA' ? 'default' : c.estado === 'RECHAZADA' || c.estado === 'BLOQUEADA_SS' ? 'destructive' : 'secondary'}>{ESTADO[c.estado]}</Badge>
            </div>

            {/* Planilla PILA: solo contratistas OPS. Se ve, se pide o se deja de pedir aquí mismo. */}
            {c.esOps && (() => {
              const e = estadoPila(c)
              const abierta = c.estado !== 'APROBADA' && c.estado !== 'PAGADA' && c.estado !== 'RECHAZADA'
              return (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs">
                  <e.Icono className={cn('size-4 shrink-0', e.clase)} />
                  <span className="min-w-0 flex-1">Planilla PILA · <b className={e.clase}>{e.texto}</b></span>
                  {c.planilla && (
                    <VisorPdf documentoId={c.planilla.id} titulo={c.planilla.nombre} mimeType={c.planilla.esImagen ? 'image/*' : undefined} className={buttonVariants({ variant: 'ghost', size: 'icon', className: 'size-7' })}>
                      <Eye className="size-4" /><span className="sr-only">Ver la planilla</span>
                    </VisorPdf>
                  )}
                  {c.requierePila && c.ss !== 'VALIDA' && c.contratoOpsId && (
                    <Button size="sm" variant="outline" className="h-7" asChild>
                      <Link href={`/contratos/ops/${c.contratoOpsId}`}><ExternalLink className="size-3.5" /> Verificar</Link>
                    </Button>
                  )}
                  {puedeEditar && abierta && (
                    c.requierePila ? (
                      <Button size="sm" variant="ghost" className="h-7" onClick={() => pila(c.id, false)} disabled={proc === c.id}>
                        <FileMinus className="size-3.5" /> No pedir
                      </Button>
                    ) : (
                      <Button size="sm" className="h-7" onClick={() => pila(c.id, true)} disabled={proc === c.id}>
                        {proc === c.id ? <Spinner /> : <FilePlus className="size-3.5" />} Pedir PILA
                      </Button>
                    )
                  )}
                </div>
              )
            })()}

            {puedeAprobar && c.estado !== 'PAGADA' && c.estado !== 'RECHAZADA' && (
              <div className="flex flex-wrap justify-end gap-2">
                <Button size="sm" onClick={() => cambiar(c.id, 'RECHAZADA')} disabled={proc === c.id}><CircleX className="size-4" /> Rechazar</Button>
                <Button size="sm" onClick={() => cambiar(c.id, 'APROBADA')} disabled={proc === c.id}>{proc === c.id ? <Spinner /> : <CircleCheck className="size-4" />} Aprobar</Button>
                <Button size="sm" onClick={() => cambiar(c.id, 'PAGADA', true)} disabled={proc === c.id}><CircleCheck className="size-4" /> Marcar pagada</Button>
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
