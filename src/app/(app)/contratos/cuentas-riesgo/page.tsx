import Link from 'next/link'
import { requerirPermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { FileWarning, ChevronRight, CheckCircle2 } from 'lucide-react'
import { fmtCOP } from '@/lib/moneda'
import { formatFechaCorta } from '@/lib/fechas'

export const metadata = { title: 'Cuentas de cobro en riesgo · Smart Gadgets RH' }

export default async function CuentasRiesgoPage() {
  await requerirPermiso('contratos', 'VER')

  const cuentas = await prisma.cuentaCobroOps.findMany({
    where: {
      contratoOpsId: { not: null }, // solo contratistas OPS requieren soporte de SS
      estado: { in: ['RADICADA', 'EN_VERIFICACION_SS', 'BLOQUEADA_SS'] },
      OR: [{ soporteSs: { is: null } }, { soporteSs: { estadoVerificacion: { not: 'VALIDA' } } }],
    },
    include: { contratoOps: { include: { colaborador: true, sede: true } }, soporteSs: true },
    orderBy: { fechaRadicacion: 'asc' },
  })

  return (
    <div className="mx-auto max-w-4xl">
      <Encabezado
        titulo="Cuentas de cobro OPS sin soporte de seguridad social"
        descripcion="Cuentas que no pueden pagarse hasta verificar el pago de seguridad social del contratista (requisito legal)."
      />
      {cuentas.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
          <CheckCircle2 className="size-8 text-emerald-600" />
          <p>No hay cuentas de cobro en riesgo. Todo al día.</p>
        </CardContent></Card>
      ) : (
        <Card><CardContent className="p-0 divide-y">
          {cuentas.map((cc) => (
            <Link key={cc.id} href={`/contratos/ops/${cc.contratoOpsId}`} className="flex items-center gap-3 p-3 hover:bg-accent/40">
              <FileWarning className="size-5 text-amber-600 shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="font-medium text-sm truncate">{cc.contratoOps?.colaborador.nombres} {cc.contratoOps?.colaborador.apellidos}</p>
                <p className="text-xs text-muted-foreground">
                  {cc.contratoOps?.numero} · {cc.numero} · periodo {cc.periodo} · {cc.contratoOps?.sede.nombre}
                </p>
              </div>
              <span className="text-sm font-medium hidden sm:block">{fmtCOP(Number(cc.valor))}</span>
              <Badge variant="secondary">{cc.soporteSs ? cc.soporteSs.estadoVerificacion : 'Sin soporte'}</Badge>
              <ChevronRight className="size-4 text-muted-foreground" />
            </Link>
          ))}
        </CardContent></Card>
      )}
    </div>
  )
}
