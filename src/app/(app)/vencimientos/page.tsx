import Link from 'next/link'
import { requerirPermiso, alcanceDe } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { sedeActualId } from '@/server/sede-actual'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import {
  TriangleAlert, Clock, CalendarCheck, FileText, PenLine, Hourglass, Stethoscope, Receipt, Landmark,
  ShieldCheck, Building2, Handshake, BadgeCheck, Globe, KeyRound, Users, Wrench, HardHat, Shirt, Siren, LayoutGrid, Bell,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { Chip, Pill, Stat, AvatarColaborador, type PillTone } from '@/components/ui-kit'
import { urlFoto } from '@/lib/foto'
import { hoyBogota } from '@/lib/fechas'
import { fechaBreve } from '@/lib/notificaciones/texto'
import type { Prisma } from '@/generated/prisma/client'

export const metadata = { title: 'Vencimientos · Smart Gadgets RH' }

/** Qué es cada vencimiento: la etiqueta y el ícono del chip (en tinta, como en el resto de la app). */
const ORIGEN: Record<string, { etiqueta: string; icono: LucideIcon }> = {
  DOCUMENTO: { etiqueta: 'Documento', icono: FileText },
  CONTRATO_FIJO: { etiqueta: 'Contrato fijo', icono: PenLine },
  CONTRATO_OPS: { etiqueta: 'Contrato OPS', icono: PenLine },
  PERIODO_PRUEBA: { etiqueta: 'Periodo de prueba', icono: Hourglass },
  EXAMEN_MEDICO: { etiqueta: 'Examen médico', icono: Stethoscope },
  PLANILLA_SS_OPS: { etiqueta: 'Planilla SS (OPS)', icono: Receipt },
  OBLIGACION_LEGAL: { etiqueta: 'Obligación legal', icono: Landmark },
  POLIZA: { etiqueta: 'Póliza', icono: ShieldCheck },
  ARRIENDO: { etiqueta: 'Arriendo', icono: Building2 },
  CONVENIO_FINANCIERA: { etiqueta: 'Convenio financiera', icono: Handshake },
  MARCA: { etiqueta: 'Marca', icono: BadgeCheck },
  DOMINIO_WEB: { etiqueta: 'Dominio web', icono: Globe },
  LICENCIA_SOFTWARE: { etiqueta: 'Licencia', icono: KeyRound },
  COMITE: { etiqueta: 'Comité', icono: Users },
  ACCION_CORRECTIVA: { etiqueta: 'Acción correctiva', icono: Wrench },
  EPP: { etiqueta: 'EPP', icono: HardHat },
  DOTACION: { etiqueta: 'Dotación', icono: Shirt },
  PLAN_EMERGENCIA: { etiqueta: 'Plan de emergencia', icono: Siren },
  MODULO_PERSONALIZADO: { etiqueta: 'Módulo', icono: LayoutGrid },
  MANUAL: { etiqueta: 'Manual', icono: Bell },
}

type Urgencia = 'vencido' | 'por_vencer' | 'proximo'

const FILTROS: { clave: string; label: string; urgencia: Urgencia | null }[] = [
  { clave: 'todos', label: 'Todos', urgencia: null },
  { clave: 'vencidos', label: 'Vencidos', urgencia: 'vencido' },
  { clave: 'por_vencer', label: 'Por vencer', urgencia: 'por_vencer' },
  { clave: 'al_dia', label: 'Al día', urgencia: 'proximo' },
]

/** El estado es lo único con color: rosa vencido, ámbar por vencer, verde al día. */
const TONO: Record<Urgencia, PillTone> = { vencido: 'bad', por_vencer: 'warn', proximo: 'ok' }
const TITULO_GRUPO: Record<Urgencia, string> = { vencido: 'Vencidos', por_vencer: 'Por vencer', proximo: 'Al día' }

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

  // De qué colaborador es cada vencimiento (si es de alguien): para su foto, su
  // nombre y el enlace a su ficha. Mismas reglas que los avisos (despachador).
  const idsDe = (tipo: string) => vencimientos.filter((v) => v.entidadTipo === tipo).map((v) => v.entidadId)
  const [documentos, contratos, contratosOps, examenes] = await Promise.all([
    prisma.documento.findMany({ where: { id: { in: idsDe('Documento') }, entidadTipo: 'Colaborador' }, select: { id: true, entidadId: true } }),
    prisma.contrato.findMany({ where: { id: { in: idsDe('Contrato') } }, select: { id: true, colaboradorId: true } }),
    prisma.contratoOps.findMany({ where: { id: { in: idsDe('ContratoOps') } }, select: { id: true, colaboradorId: true } }),
    prisma.examenMedico.findMany({ where: { id: { in: idsDe('ExamenMedico') } }, select: { id: true, colaboradorId: true } }),
  ])
  const colaboradorPorEntidad = new Map<string, string>([
    ...documentos.map((d) => [d.id, d.entidadId] as [string, string]),
    ...contratos.map((c) => [c.id, c.colaboradorId] as [string, string]),
    ...contratosOps.filter((c) => c.colaboradorId).map((c) => [c.id, c.colaboradorId!] as [string, string]),
    ...examenes.map((e) => [e.id, e.colaboradorId] as [string, string]),
  ])
  const colaboradorDe = (v: { entidadTipo: string; entidadId: string }) =>
    v.entidadTipo === 'Colaborador' ? v.entidadId : colaboradorPorEntidad.get(v.entidadId) ?? null
  const colaboradores = await prisma.colaborador.findMany({
    where: { id: { in: [...new Set(vencimientos.map(colaboradorDe).filter((id): id is string => !!id))] } },
    select: { id: true, nombres: true, apellidos: true, fotoPath: true },
  })
  const colaboradoresMap = new Map(colaboradores.map((c) => [c.id, c]))

  const hoy = hoyBogota()
  const en30 = new Date(hoy); en30.setUTCDate(en30.getUTCDate() + 30)

  const clasificados = vencimientos.map((v) => {
    const dias = Math.round((v.fechaVencimiento.getTime() - hoy.getTime()) / 86_400_000)
    let urgencia: Urgencia = 'proximo'
    if (v.fechaVencimiento < hoy || v.estado === 'VENCIDO') urgencia = 'vencido'
    else if (v.fechaVencimiento <= en30) urgencia = 'por_vencer'
    return { ...v, dias, urgencia }
  })

  const conteo: Record<Urgencia, number> = { vencido: 0, por_vencer: 0, proximo: 0 }
  for (const v of clasificados) conteo[v.urgencia]++

  const activo = FILTROS.find((f) => f.clave === filtro) ?? FILTROS[0]
  const lista = activo.urgencia ? clasificados.filter((v) => v.urgencia === activo.urgencia) : clasificados

  // En «Todos» la lista va por grupos de urgencia, con su rótulo; filtrada, de corrido.
  const grupos: { urgencia: Urgencia; items: typeof lista }[] = activo.urgencia
    ? [{ urgencia: activo.urgencia, items: lista }]
    : (['vencido', 'por_vencer', 'proximo'] as Urgencia[])
        .map((u) => ({ urgencia: u, items: lista.filter((v) => v.urgencia === u) }))
        .filter((g) => g.items.length > 0)

  return (
    <div className="max-w-5xl">
      <Encabezado enLinea titulo="Vencimientos" volver />

      {/* Las cifras también llevan al filtro; el chip va en tinta y el color se
          reserva para el estado de cada fila. */}
      <div className="grid grid-cols-3 gap-2.5">
        <Stat icono={TriangleAlert} color="bg-foreground text-background" valor={conteo.vencido} label="Vencidos" href="/vencimientos?filtro=vencidos" />
        <Stat icono={Clock} color="bg-foreground text-background" valor={conteo.por_vencer} label="Por vencer" href="/vencimientos?filtro=por_vencer" />
        <Stat icono={CalendarCheck} color="bg-foreground text-background" valor={conteo.proximo} label="Al día" href="/vencimientos?filtro=al_dia" />
      </div>

      <div className="my-4 flex flex-wrap gap-1.5">
        {FILTROS.map((f) => (
          <Link
            key={f.clave}
            href={f.clave === 'todos' ? '/vencimientos' : `/vencimientos?filtro=${f.clave}`}
            className={cn(
              'rounded-full px-3 py-1 text-xs font-semibold transition-colors',
              f.clave === activo.clave ? 'bg-foreground text-background' : 'border bg-card text-muted-foreground hover:bg-accent',
            )}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {lista.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">No hay vencimientos en esta vista.</CardContent></Card>
      ) : (
        <div className="space-y-5">
          {grupos.map((g) => (
            <section key={g.urgencia}>
              {!activo.urgencia && (
                <h2 className="mb-2 text-[13px] font-bold">
                  {TITULO_GRUPO[g.urgencia]} <span className="font-medium text-muted-foreground">· {g.items.length}</span>
                </h2>
              )}
              <Card><CardContent className="divide-y p-0">
                {g.items.map((v) => {
                  const origen = ORIGEN[v.origen] ?? { etiqueta: v.origen, icono: Bell }
                  const colabId = colaboradorDe(v)
                  const colab = colabId ? colaboradoresMap.get(colabId) : undefined
                  const nombre = colab ? `${colab.nombres} ${colab.apellidos}` : null
                  const cuando = `${v.urgencia === 'vencido' ? 'venció el' : 'vence el'} ${fechaBreve(v.fechaVencimiento)}`
                  const contenido = (
                    <div className="flex items-center gap-3 p-3">
                      {colab && nombre ? (
                        // De una persona: su foto (con el ícono de qué vence en la esquina)
                        // y su nombre al frente. Al final del título se cortaba en el celular.
                        <span className="relative shrink-0">
                          <AvatarColaborador nombre={nombre} fotoUrl={urlFoto(colab.id, colab.fotoPath, true)} className="size-9" />
                          <Chip icono={origen.icono} color="bg-foreground text-background" className="absolute -right-1 -bottom-1 size-[18px] rounded-full ring-2 ring-card" iconClassName="size-2.5" />
                        </span>
                      ) : (
                        <Chip icono={origen.icono} color="bg-foreground text-background" className="size-9 rounded-[10px]" iconClassName="size-[18px]" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{nombre ?? v.titulo}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {/* Con persona, la fecha va primero: al final se cortaba en el celular. */}
                          {nombre ? `${fechaBreve(v.fechaVencimiento)} · ${sinNombre(v.titulo)}` : `${origen.etiqueta} · ${cuando}`}
                        </p>
                      </div>
                      <Pill tone={TONO[v.urgencia]}>
                        {v.urgencia === 'vencido'
                          ? `Hace ${Math.abs(v.dias)} d`
                          : v.dias === 0 ? 'Hoy' : `En ${v.dias} d`}
                      </Pill>
                    </div>
                  )
                  const enlace = colabId ? `/colaboradores/${colabId}` : null
                  return enlace
                    ? <Link key={v.id} href={enlace} className="block transition-colors hover:bg-accent/40">{contenido}</Link>
                    : <div key={v.id}>{contenido}</div>
                })}
              </CardContent></Card>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

/**
 * El título sin el nombre de la persona: los títulos terminan en " — Nombre",
 * y con la foto y el nombre ya al frente de la fila repetirlo sobra.
 */
function sinNombre(titulo: string): string {
  const i = titulo.lastIndexOf(' — ')
  return i > 0 ? titulo.slice(0, i) : titulo
}
