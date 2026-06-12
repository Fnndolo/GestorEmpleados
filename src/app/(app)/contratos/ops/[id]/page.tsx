import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatFechaLarga, formatFechaISO } from '@/lib/fechas'
import { fmtCOP } from '@/lib/moneda'
import { CuentasCobro } from './cuentas-cliente'

export const metadata = { title: 'Contrato OPS · Smart Gadgets RH' }

export default async function OpsDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const usuario = await requerirPermiso('contratos', 'VER')
  const puedeEditar = tienePermiso(usuario, 'contratos', 'EDITAR')
  const puedeAprobar = tienePermiso(usuario, 'contratos', 'APROBAR')

  const c = await prisma.contratoOps.findUnique({
    where: { id },
    include: {
      colaborador: true, supervisor: true, sede: { include: { ciudad: true } },
      entregables: true,
      cuentasCobro: { include: { soporteSs: true }, orderBy: { periodo: 'desc' } },
    },
  })
  if (!c) notFound()

  return (
    <div className="mx-auto max-w-4xl">
      <Encabezado titulo={`OPS ${c.numero}`} descripcion={`${c.colaborador.nombres} ${c.colaborador.apellidos}`} />

      <Card className="mb-4"><CardContent className="py-4">
        <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
          <Dato k="Contratista" v={`${c.colaborador.nombres} ${c.colaborador.apellidos}`} />
          <Dato k="Estado" v={<Badge variant={c.estado === 'ACTIVO' ? 'default' : 'secondary'}>{c.estado}</Badge>} />
          <Dato k="Objeto" v={c.objeto} full />
          <Dato k="Valor total" v={fmtCOP(Number(c.valorTotal))} />
          <Dato k="Valor mensual" v={c.valorMensual ? fmtCOP(Number(c.valorMensual)) : '—'} />
          <Dato k="Supervisor" v={c.supervisor ? `${c.supervisor.nombres} ${c.supervisor.apellidos}` : '—'} />
          <Dato k="Sede" v={`${c.sede.nombre} · ${c.sede.ciudad.nombre}`} />
          <Dato k="Vigencia" v={`${formatFechaLarga(c.fechaInicio)} — ${formatFechaLarga(c.fechaFin)}`} />
          <Dato k="RUT" v={c.rut ?? '—'} />
        </dl>
        <p className="mt-3">
          <Link href={`/colaboradores/${c.colaboradorId}`} className="text-sm text-primary hover:underline">Ver ficha del contratista →</Link>
        </p>
      </CardContent></Card>

      <h2 className="text-lg font-medium mb-3">Cuentas de cobro</h2>
      <CuentasCobro
        contratoOpsId={c.id}
        valorMensual={c.valorMensual ? Number(c.valorMensual) : null}
        cuentas={c.cuentasCobro.map((cc) => ({
          id: cc.id, numero: cc.numero, periodo: cc.periodo, valor: Number(cc.valor),
          estado: cc.estado, fechaRadicacion: formatFechaISO(cc.fechaRadicacion),
          fechaPago: cc.fechaPago ? formatFechaISO(cc.fechaPago) : null,
          soporte: cc.soporteSs ? {
            estadoVerificacion: cc.soporteSs.estadoVerificacion,
            periodoCotizado: cc.soporteSs.periodoCotizado,
            ibcDeclarado: cc.soporteSs.ibcDeclarado ? Number(cc.soporteSs.ibcDeclarado) : null,
            operador: cc.soporteSs.operador,
          } : null,
        }))}
        puedeEditar={puedeEditar}
        puedeAprobar={puedeAprobar}
      />
    </div>
  )
}

function Dato({ k, v, full }: { k: string; v: React.ReactNode; full?: boolean }) {
  return (
    <div className={`flex flex-col ${full ? 'sm:col-span-2' : ''}`}>
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className="text-sm">{v}</dd>
    </div>
  )
}
