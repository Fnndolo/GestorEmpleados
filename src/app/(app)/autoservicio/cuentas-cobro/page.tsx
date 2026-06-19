import { requerirSesion } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Download, FileText } from 'lucide-react'
import { fmtCOP } from '@/lib/moneda'
import { formatFechaCorta, formatFechaISO } from '@/lib/fechas'
import { MiCuentaCobro } from './mi-cuenta'

export const metadata = { title: 'Mis cuentas de cobro · Smart Gadgets RH' }

const ESTADO: Record<string, string> = {
  RADICADA: 'Radicada', EN_VERIFICACION_SS: 'En verificación', BLOQUEADA_SS: 'Bloqueada (SS)',
  APROBADA: 'Aprobada', PAGADA: 'Pagada', RECHAZADA: 'Rechazada',
}

export default async function MisCuentasCobroPage() {
  const usuario = await requerirSesion()
  if (!usuario.colaboradorId) {
    return <div className="mx-auto max-w-3xl"><Encabezado titulo="Mis cuentas de cobro" /><Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Tu usuario no está vinculado a una ficha de colaborador.</CardContent></Card></div>
  }

  const [cuentas, plantillas] = await Promise.all([
    prisma.cuentaCobroOps.findMany({ where: { colaboradorId: usuario.colaboradorId }, orderBy: { creadoEn: 'desc' } }),
    prisma.plantillaCuentaCobro.findMany({ where: { activa: true }, orderBy: [{ esDefecto: 'desc' }, { nombre: 'asc' }] }),
  ])

  return (
    <div className="mx-auto max-w-3xl">
      <Encabezado
        titulo="Mis cuentas de cobro"
        descripcion="Crea y envía tu cuenta de cobro (servicios, comisiones o saldos a tu favor). Contabilidad y gerencia recibirán la notificación."
        acciones={<MiCuentaCobro plantillas={plantillas.map((p) => ({ id: p.id, nombre: p.nombre }))} />}
      />
      {cuentas.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground"><FileText className="size-8" /><p>Aún no has creado cuentas de cobro.</p></CardContent></Card>
      ) : (
        <Card><CardContent className="p-0 divide-y">
          {cuentas.map((c) => (
            <div key={c.id} className="flex items-center gap-3 p-3">
              <FileText className="size-5 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm">{c.numero} · periodo {c.periodo}</p>
                <p className="text-xs text-muted-foreground">{c.concepto ?? 'Sin concepto'} · radicada {formatFechaCorta(c.fechaRadicacion)}</p>
              </div>
              <span className="text-sm font-medium hidden sm:block">{fmtCOP(Number(c.valor))}</span>
              {c.documentoId && (
                <Button variant="ghost" size="icon" asChild aria-label="PDF"><a href={`/api/documentos/${c.documentoId}`} target="_blank" rel="noreferrer"><Download className="size-4" /></a></Button>
              )}
              <Badge variant={c.estado === 'PAGADA' || c.estado === 'APROBADA' ? 'default' : c.estado === 'RECHAZADA' || c.estado === 'BLOQUEADA_SS' ? 'destructive' : 'secondary'}>{ESTADO[c.estado]}</Badge>
            </div>
          ))}
        </CardContent></Card>
      )}
    </div>
  )
}
