import Link from 'next/link'
import { requerirPermiso, alcanceDe } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { sedeActualId } from '@/server/sede-actual'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, Clock, CalendarCheck, Bell } from 'lucide-react'
import { hoyBogota, formatFechaCorta } from '@/lib/fechas'
import type { Prisma } from '@/generated/prisma/client'

export const metadata = { title: 'Vencimientos · Smart Gadgets RH' }

const ORIGEN_ETIQUETA: Record<string, string> = {
  DOCUMENTO: 'Documento', CONTRATO_FIJO: 'Contrato fijo', PERIODO_PRUEBA: 'Periodo de prueba',
  EXAMEN_MEDICO: 'Examen médico', PLANILLA_SS_OPS: 'Planilla SS (OPS)', OBLIGACION_LEGAL: 'Obligación legal',
  POLIZA: 'Póliza', ARRIENDO: 'Arriendo', CONVENIO_FINANCIERA: 'Convenio financiera', MARCA: 'Marca',
  DOMINIO_WEB: 'Dominio web', LICENCIA_SOFTWARE: 'Licencia', COMITE: 'Comité', ACCION_CORRECTIVA: 'Acción correctiva',
  EPP: 'EPP', DOTACION: 'Dotación', MODULO_PERSONALIZADO: 'Módulo', MANUAL: 'Manual',
}

export default async function VencimientosPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string }>
}) {
  const usuario = await requerirPermiso('vencimientos', 'VER')
  const { filtro = 'activos' } = await searchParams
  const sedeActiva = await sedeActualId()
  const alcance = alcanceDe(usuario, 'vencimientos', 'VER')

  const where: Prisma.VencimientoWhereInput = {
    estado: { notIn: ['RESUELTO', 'CANCELADO'] },
  }
  if (sedeActiva) where.sedeId = sedeActiva
  else if (alcance === 'SEDES_ASIGNADAS') where.sedeId = { in: usuario.sedeIds.length ? usuario.sedeIds : ['∅'] }

  const vencimientos = await prisma.vencimiento.findMany({
    where,
    orderBy: { fechaVencimiento: 'asc' },
    take: 500,
  })

  const hoy = hoyBogota()
  const en30 = new Date(hoy); en30.setUTCDate(en30.getUTCDate() + 30)

  const clasificados = vencimientos.map((v) => {
    const dias = Math.round((v.fechaVencimiento.getTime() - hoy.getTime()) / 86_400_000)
    let urgencia: 'vencido' | 'por_vencer' | 'proximo' = 'proximo'
    if (v.fechaVencimiento < hoy || v.estado === 'VENCIDO') urgencia = 'vencido'
    else if (v.fechaVencimiento <= en30) urgencia = 'por_vencer'
    return { ...v, dias, urgencia }
  })

  const vencidos = clasificados.filter((v) => v.urgencia === 'vencido')
  const porVencer = clasificados.filter((v) => v.urgencia === 'por_vencer')
  const proximos = clasificados.filter((v) => v.urgencia === 'proximo')

  const lista =
    filtro === 'vencidos' ? vencidos : filtro === 'por_vencer' ? porVencer : clasificados

  return (
    <div className="mx-auto max-w-5xl">
      <Encabezado titulo="Vencimientos" descripcion="Semáforo de vencimientos de toda la plataforma, filtrable por sede." />

      {/* Resumen semáforo */}
      <div className="grid gap-3 sm:grid-cols-3 mb-6">
        <TarjetaSemaforo titulo="Vencidos" cantidad={vencidos.length} icono={AlertTriangle} color="text-destructive" filtro="vencidos" activo={filtro === 'vencidos'} />
        <TarjetaSemaforo titulo="Por vencer (30 días)" cantidad={porVencer.length} icono={Clock} color="text-amber-500" filtro="por_vencer" activo={filtro === 'por_vencer'} />
        <TarjetaSemaforo titulo="Al día" cantidad={proximos.length} icono={CalendarCheck} color="text-emerald-600" filtro="activos" activo={filtro === 'activos'} />
      </div>

      {lista.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
          <Bell className="size-8" />
          <p>No hay vencimientos en esta vista.</p>
        </CardContent></Card>
      ) : (
        <Card><CardContent className="p-0 divide-y">
          {lista.map((v) => {
            const contenido = (
              <div className="flex items-center gap-3 p-3">
                <Punto urgencia={v.urgencia} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-sm truncate">{v.titulo}</p>
                  <p className="text-xs text-muted-foreground">
                    {ORIGEN_ETIQUETA[v.origen] ?? v.origen} · {formatFechaCorta(v.fechaVencimiento)}
                  </p>
                </div>
                <Badge variant={v.urgencia === 'vencido' ? 'destructive' : v.urgencia === 'por_vencer' ? 'secondary' : 'outline'}>
                  {v.urgencia === 'vencido'
                    ? `Venció hace ${Math.abs(v.dias)} d`
                    : v.dias === 0 ? 'Vence hoy' : `En ${v.dias} d`}
                </Badge>
              </div>
            )
            const enlace = enlaceVenc(v.entidadTipo, v.entidadId)
            return enlace
              ? <Link key={v.id} href={enlace} className="block hover:bg-accent/40">{contenido}</Link>
              : <div key={v.id}>{contenido}</div>
          })}
        </CardContent></Card>
      )}
    </div>
  )
}

function TarjetaSemaforo({
  titulo, cantidad, icono: Icono, color, filtro, activo,
}: {
  titulo: string; cantidad: number; icono: typeof Clock; color: string; filtro: string; activo: boolean
}) {
  return (
    <Link href={`/vencimientos?filtro=${filtro}`}>
      <Card className={activo ? 'border-primary' : ''}>
        <CardContent className="flex items-center gap-3 py-4">
          <Icono className={`size-6 ${color}`} />
          <div>
            <p className="text-2xl font-semibold tabular-nums">{cantidad}</p>
            <p className="text-xs text-muted-foreground">{titulo}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  )
}

function Punto({ urgencia }: { urgencia: string }) {
  const color = urgencia === 'vencido' ? 'bg-destructive' : urgencia === 'por_vencer' ? 'bg-amber-500' : 'bg-emerald-500'
  return <span className={`size-2.5 shrink-0 rounded-full ${color}`} />
}

function enlaceVenc(entidadTipo: string, entidadId: string): string | null {
  if (entidadTipo === 'Colaborador') return `/colaboradores/${entidadId}`
  return null
}
