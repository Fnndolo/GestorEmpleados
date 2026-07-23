import Link from 'next/link'
import { requerirPermiso, alcanceDe } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { sedeActualId } from '@/server/sede-actual'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { TriangleAlert, Clock, CalendarCheck, Bell, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Chip, Pill, type ChipColor, type PillTone } from '@/components/ui-kit'
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
  const { filtro = 'todos' } = await searchParams
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

  // Pre-cargar documentos para mapear el enlace al colaborador correspondiente
  const docIds = vencimientos
    .filter((v) => v.entidadTipo === 'Documento')
    .map((v) => v.entidadId)
  
  const documentos = await prisma.documento.findMany({
    where: { id: { in: docIds } },
    select: { id: true, entidadTipo: true, entidadId: true },
  })
  const docsMap = new Map(documentos.map((d) => [d.id, d]))

  // Pre-cargar contratos para mapear el enlace al colaborador correspondiente
  const contratoIds = vencimientos
    .filter((v) => v.entidadTipo === 'Contrato')
    .map((v) => v.entidadId)

  const contratos = await prisma.contrato.findMany({
    where: { id: { in: contratoIds } },
    select: { id: true, colaboradorId: true },
  })
  const contratosMap = new Map(contratos.map((c) => [c.id, c]))

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
    filtro === 'vencidos'
      ? vencidos
      : filtro === 'por_vencer'
      ? porVencer
      : filtro === 'al_dia'
      ? proximos
      : clasificados // 'todos'

  return (
    <div className="mx-auto max-w-5xl">
      <Encabezado titulo="Vencimientos" descripcion="Semáforo de vencimientos de toda la plataforma, filtrable por sede." />

      {/* Resumen semáforo */}
      <div className="mb-6 grid grid-cols-3 gap-2.5">
        <TarjetaSemaforo titulo="Vencidos" cantidad={vencidos.length} icono={TriangleAlert} color="rose" filtro="vencidos" activo={filtro === 'vencidos'} />
        <TarjetaSemaforo titulo="Por vencer (30 días)" cantidad={porVencer.length} icono={Clock} color="amber" filtro="por_vencer" activo={filtro === 'por_vencer'} />
        <TarjetaSemaforo titulo="Al día" cantidad={proximos.length} icono={CalendarCheck} color="emerald" filtro="al_dia" activo={filtro === 'al_dia' || filtro === 'todos'} />
      </div>

      {lista.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
          <Bell className="size-8" />
          <p>No hay vencimientos en esta vista.</p>
        </CardContent></Card>
      ) : (
        <Card><CardContent className="p-0 divide-y">
          {lista.map((v) => {
            const visual = VISUAL_URGENCIA[v.urgencia]
            const contenido = (
              <div className="flex items-center gap-3 p-3">
                <Chip icono={visual.icono} color={visual.color} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{v.titulo}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {ORIGEN_ETIQUETA[v.origen] ?? v.origen} · {v.urgencia === 'vencido' ? 'venció el' : 'vence el'} {formatFechaCorta(v.fechaVencimiento)}
                  </p>
                </div>
                <Pill tone={visual.tone}>
                  {v.urgencia === 'vencido'
                    ? `Venció hace ${Math.abs(v.dias)} d`
                    : v.dias === 0 ? 'Vence hoy' : `En ${v.dias} d`}
                </Pill>
              </div>
            )
            const enlace = enlaceVenc(v.entidadTipo, v.entidadId, docsMap, contratosMap)
            return enlace
              ? <Link key={v.id} href={enlace} className="block transition-colors hover:bg-accent/40">{contenido}</Link>
              : <div key={v.id}>{contenido}</div>
          })}
        </CardContent></Card>
      )}
    </div>
  )
}

/** Ícono, color de chip y tono de píldora por urgencia. */
const VISUAL_URGENCIA: Record<string, { icono: LucideIcon; color: ChipColor; tone: PillTone }> = {
  vencido: { icono: TriangleAlert, color: 'rose', tone: 'bad' },
  por_vencer: { icono: Clock, color: 'amber', tone: 'warn' },
  proximo: { icono: CalendarCheck, color: 'emerald', tone: 'ok' },
}

function TarjetaSemaforo({
  titulo, cantidad, icono, color, filtro, activo,
}: {
  titulo: string; cantidad: number; icono: LucideIcon; color: ChipColor; filtro: string; activo: boolean
}) {
  return (
    <Link
      href={`/vencimientos?filtro=${filtro}`}
      className={cn(
        'flex items-center gap-3 rounded-xl border bg-card p-3 transition-all',
        'hover:-translate-y-0.5 hover:border-foreground/20 hover:shadow-md',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        activo && 'border-primary/50 ring-1 ring-primary/20',
      )}
    >
      <Chip icono={icono} color={color} className="size-9 rounded-[10px]" iconClassName="size-[18px]" />
      <div className="min-w-0">
        <p className="text-[17px] font-bold leading-tight tracking-tight tabular-nums sm:text-[20px]">{cantidad}</p>
        <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground sm:text-[11px]">{titulo}</p>
      </div>
    </Link>
  )
}

function enlaceVenc(
  entidadTipo: string,
  entidadId: string,
  docsMap: Map<string, { entidadTipo: string; entidadId: string }>,
  contratosMap: Map<string, { colaboradorId: string }>,
): string | null {
  if (entidadTipo === 'Colaborador') return `/colaboradores/${entidadId}`
  if (entidadTipo === 'Documento') {
    const doc = docsMap.get(entidadId)
    if (doc && doc.entidadTipo === 'Colaborador') {
      return `/colaboradores/${doc.entidadId}`
    }
  }
  if (entidadTipo === 'Contrato') {
    const contrato = contratosMap.get(entidadId)
    if (contrato) {
      return `/colaboradores/${contrato.colaboradorId}`
    }
  }
  return null
}
