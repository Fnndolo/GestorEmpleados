import Link from 'next/link'
import { requerirSesion } from '@/server/sesion'
import { tramiteAplica, NoAplica } from '../no-aplica'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { Gavel, MessageSquareWarning, ArrowLeft } from 'lucide-react'
import { formatFechaLarga } from '@/lib/fechas'
import { fechaBreve } from '@/lib/notificaciones/texto'
import { Descargos, Apelacion } from './descargos'
import type { SoporteDoc } from '@/app/(app)/juridica/_ui'
import { ProcesoPlegable } from './proceso-plegable'

export const metadata = { title: 'Mis procesos disciplinarios · Smart Gadgets RH' }

const ETAPA: Record<string, string> = { CITACION_DESCARGOS: 'Citación a descargos', DESCARGOS: 'Descargos presentados', DECISION: 'Decisión', RECURSO: 'Recurso', CERRADO: 'Cerrado' }

export default async function MisDisciplinariosPage() {
  const usuario = await requerirSesion()

  if (!usuario.colaboradorId) {
    return (
      <div className="max-w-5xl">
        <Encabezado titulo="Mis procesos disciplinarios" />
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Tu usuario no está vinculado a una ficha de colaborador.</CardContent></Card>
      </div>
    )
  }

  if (!(await tramiteAplica(usuario.colaboradorId, 'disciplinarios'))) {
    return <NoAplica titulo="Mis disciplinarios" motivo="El proceso disciplinario aplica a la relación laboral. En un contrato de prestación de servicios, los incumplimientos se manejan por las cláusulas del contrato." />
  }

  const llamados = await prisma.llamadoAtencion.findMany({
    where: { colaboradorId: usuario.colaboradorId },
    orderBy: { fecha: 'desc' },
  })

  const procesos = await prisma.procesoDisciplinario.findMany({
    where: { colaboradorId: usuario.colaboradorId },
    include: { etapas: { orderBy: { fecha: 'asc' } } },
    orderBy: { creadoEn: 'desc' },
  })

  // Soportes anclados a cada etapa (para que el empleado los pueda ver)
  const etapaIds = procesos.flatMap((p) => p.etapas.map((e) => e.id))
  const docsEtapa = etapaIds.length
    ? await prisma.documento.findMany({
        where: { entidadTipo: 'EtapaProceso', entidadId: { in: etapaIds } },
        orderBy: { creadoEn: 'asc' },
        select: { id: true, nombre: true, mimeType: true, entidadId: true },
      })
    : []
  const porEtapa = new Map<string, SoporteDoc[]>()
  for (const d of docsEtapa) {
    const arr = porEtapa.get(d.entidadId) ?? []
    arr.push({ id: d.id, nombre: d.nombre, mimeType: d.mimeType })
    porEtapa.set(d.entidadId, arr)
  }

  return (
    <div className="max-w-5xl">
      <Link href="/autoservicio" className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Volver
      </Link>
      <Encabezado enLinea titulo="Mis disciplinarios" />

      {/* Los llamados de atención van aparte: no son sanciones y no hay nada que
          responder, pero el colaborador tiene derecho a saber qué le registraron. */}
      {llamados.length > 0 && (
        <Card className="mb-3"><CardContent className="py-3">
          <h3 className="mb-1 text-sm font-bold">Llamados de atención <span className="font-normal text-muted-foreground">· no son sanciones</span></h3>
          <ul className="divide-y">
            {llamados.map((l) => (
              <li key={l.id} className="flex items-start gap-2 py-2 text-sm">
                <MessageSquareWarning className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{l.motivo}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {fechaBreve(l.fecha)} · {l.tipo === 'VERBAL' ? 'verbal' : 'escrito'}{l.detalle ? ` · ${l.detalle}` : ''}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </CardContent></Card>
      )}
      {procesos.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground"><Gavel className="size-8" /><p>No tienes procesos disciplinarios.</p></CardContent></Card>
      ) : (
        <div className="space-y-3">
          {/* Plegado: asunto, en qué va y lo que exige acción; la historia
              (descripción, etapas y soportes) sale al tocar. */}
          {procesos.map((p) => {
            const yaPresentoDescargos = p.etapas.some((e) => e.etapa === 'DESCARGOS')
            const puedePresentar = !p.cerrado && !yaPresentoDescargos && p.etapa === 'CITACION_DESCARGOS'
            const puedeApelar = !p.cerrado && p.etapa === 'DECISION'
            return (
              <ProcesoPlegable
                key={p.id}
                asunto={p.asunto}
                clase={p.clase}
                etapa={p.etapa}
                etapaEtiqueta={ETAPA[p.etapa] ?? p.etapa}
                cerrado={p.cerrado}
                descripcion={p.descripcion}
                etapas={p.etapas.map((e) => ({
                  id: e.id, etapa: e.etapa, etiqueta: ETAPA[e.etapa] ?? e.etapa, fecha: formatFechaLarga(e.fecha), detalle: e.detalle, soportes: porEtapa.get(e.id) ?? [],
                }))}
                plazo={!p.cerrado && p.fechaLimite
                  ? `Tienes hasta el ${formatFechaLarga(p.fechaLimite)} para ${p.etapa === 'DECISION' ? 'apelar' : 'presentar tus descargos'}.`
                  : null}
              >
                {puedePresentar ? (
                  <Descargos procesoId={p.id} />
                ) : puedeApelar ? (
                  <Apelacion procesoId={p.id} />
                ) : p.cerrado ? null : (
                  <p className="text-xs text-emerald-700 dark:text-emerald-400">
                    {p.clase === 'LLAMADO_ATENCION' ? 'Ya diste tu explicación.' : 'Ya presentaste tus descargos; el área encargada sigue con el proceso.'}
                  </p>
                )}
              </ProcesoPlegable>
            )
          })}
        </div>
      )}
    </div>
  )
}
