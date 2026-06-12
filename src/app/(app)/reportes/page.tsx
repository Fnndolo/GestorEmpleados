import Link from 'next/link'
import { requerirPermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Users, Briefcase, Wallet, Home, FileWarning, CalendarClock, AlertTriangle, UserMinus } from 'lucide-react'
import { hoyBogota } from '@/lib/fechas'
import { fmtCOP } from '@/lib/moneda'
import { TIPO_VINCULO_CORTO } from '@/lib/etiquetas'
import { GraficoBarras } from './grafico'

export const metadata = { title: 'Reportes · Smart Gadgets RH' }

export default async function ReportesPage() {
  await requerirPermiso('reportes', 'VER')
  const hoy = hoyBogota()
  const anio = hoy.getUTCFullYear()
  const en60 = new Date(hoy); en60.setUTCDate(en60.getUTCDate() + 60)
  const inicioAnio = new Date(Date.UTC(anio, 0, 1))

  const [
    activos, porVinculo, porSede, remotos, contratosActivos, fijosPorVencer, finPrueba,
    cuentasSinSoporte, accidentesAnio, retirosAnio,
  ] = await Promise.all([
    prisma.colaborador.count({ where: { estado: 'ACTIVO' } }),
    prisma.colaborador.groupBy({ by: ['tipoVinculo'], where: { estado: 'ACTIVO' }, _count: true }),
    prisma.colaborador.groupBy({ by: ['sedeId'], where: { estado: 'ACTIVO' }, _count: true }),
    prisma.colaborador.count({ where: { estado: 'ACTIVO', modalidadTrabajo: { in: ['REMOTO', 'HIBRIDO', 'TELETRABAJO'] } } }),
    prisma.contrato.findMany({ where: { estado: 'ACTIVO' }, select: { salarioBase: true } }),
    prisma.contrato.count({ where: { estado: 'ACTIVO', tipo: 'TERMINO_FIJO', fechaFin: { gte: hoy, lte: en60 } } }),
    prisma.contrato.count({ where: { estado: 'ACTIVO', periodoPruebaFin: { gte: hoy, lte: en60 } } }),
    prisma.cuentaCobroOps.count({ where: { estado: { in: ['RADICADA', 'EN_VERIFICACION_SS', 'BLOQUEADA_SS'] }, soporteSs: { is: null } } }),
    prisma.accidenteTrabajo.count({ where: { fecha: { gte: inicioAnio } } }),
    prisma.terminacion.count({ where: { fechaRetiro: { gte: inicioAnio } } }),
  ])

  const sedes = await prisma.sede.findMany({ select: { id: true, nombre: true } })
  const sedeNombre = new Map(sedes.map((s) => [s.id, s.nombre]))
  const masaSalarial = contratosActivos.reduce((acc, c) => acc + Number(c.salarioBase), 0)
  const laborales = porVinculo.filter((v) => v.tipoVinculo !== 'OPS').reduce((a, v) => a + v._count, 0)
  const ops = porVinculo.find((v) => v.tipoVinculo === 'OPS')?._count ?? 0
  const rotacion = activos > 0 ? ((retirosAnio / (activos + retirosAnio)) * 100).toFixed(1) : '0'

  const datosSede = porSede.map((s) => ({ nombre: sedeNombre.get(s.sedeId) ?? '—', valor: s._count }))
  const datosVinculo = porVinculo.map((v) => ({ nombre: TIPO_VINCULO_CORTO[v.tipoVinculo], valor: v._count }))

  return (
    <div className="mx-auto max-w-5xl">
      <Encabezado titulo="Reportes y tableros" descripcion="Indicadores del personal, cumplimiento documental, contratos y SST." />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 mb-6">
        <Stat icono={Users} valor={activos} label="Personal activo" />
        <Stat icono={Briefcase} valor={`${laborales} / ${ops}`} label="Laborales / OPS" />
        <Stat icono={Home} valor={remotos} label="Remotos / híbridos" />
        <Stat icono={Wallet} valor={fmtCOP(masaSalarial)} label="Masa salarial (mes)" small />
      </div>

      <div className="grid gap-4 lg:grid-cols-2 mb-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Personal por sede</CardTitle></CardHeader>
          <CardContent><GraficoBarras datos={datosSede} /></CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Personal por tipo de vínculo</CardTitle></CardHeader>
          <CardContent><GraficoBarras datos={datosVinculo} color="#34d399" /></CardContent>
        </Card>
      </div>

      <h2 className="text-sm font-medium uppercase tracking-wider text-muted-foreground mb-3">Alertas y cumplimiento</h2>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 mb-6">
        <ReporteLink icono={CalendarClock} valor={fijosPorVencer} label="Contratos fijos por vencer (60 días)" href="/contratos?tab=TERMINO_FIJO" color="text-amber-500" />
        <ReporteLink icono={CalendarClock} valor={finPrueba} label="Fin de periodo de prueba (60 días)" href="/contratos" color="text-amber-500" />
        <ReporteLink icono={FileWarning} valor={cuentasSinSoporte} label="Cuentas OPS sin soporte SS" href="/contratos/cuentas-riesgo" color="text-destructive" />
        <ReporteLink icono={AlertTriangle} valor={accidentesAnio} label={`Accidentalidad ${anio}`} href="/sst?tab=accidentes" color="text-destructive" />
        <ReporteLink icono={UserMinus} valor={`${rotacion}%`} label={`Rotación ${anio}`} href="/terminaciones" color="text-foreground" />
        <ReporteLink icono={FileWarning} valor="Ver" label="Semáforo documental (por colaborador)" href="/colaboradores" color="text-foreground" />
      </div>
    </div>
  )
}

function Stat({ icono: Icono, valor, label, small }: { icono: typeof Users; valor: number | string; label: string; small?: boolean }) {
  return (
    <Card><CardContent className="flex items-center gap-3 py-4">
      <Icono className="size-6 text-primary" />
      <div className="min-w-0"><p className={`font-semibold tabular-nums ${small ? 'text-lg' : 'text-2xl'} truncate`}>{valor}</p><p className="text-xs text-muted-foreground">{label}</p></div>
    </CardContent></Card>
  )
}

function ReporteLink({ icono: Icono, valor, label, href, color }: { icono: typeof Users; valor: number | string; label: string; href: string; color: string }) {
  return (
    <Link href={href}><Card className="hover:border-primary/40 transition-colors"><CardContent className="flex items-center gap-3 py-4">
      <Icono className={`size-5 ${color}`} />
      <div className="flex-1 min-w-0"><p className="text-xl font-semibold tabular-nums">{valor}</p><p className="text-xs text-muted-foreground">{label}</p></div>
    </CardContent></Card></Link>
  )
}
