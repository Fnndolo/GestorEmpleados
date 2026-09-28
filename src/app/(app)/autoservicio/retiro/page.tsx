import { requerirPermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { buttonVariants } from '@/components/ui/button'
import { CircleCheck, Circle, FileText, Undo2 } from 'lucide-react'
import { VisorPdf } from '@/components/documentos/visor-pdf'
import { formatFechaCorta, formatFechaLarga, hoyBogotaISO } from '@/lib/fechas'
import { fmtCOP } from '@/lib/moneda'
import { cn } from '@/lib/utils'
import { CARTA_PRINCIPAL, NOMBRE_CARTA } from '@/lib/terminaciones/cartas'
import { DocumentoRetiro, type DocRetiro } from './documento-retiro'
import { PresentarRenuncia, RenunciaPresentada } from './renuncia'

export const metadata = { title: 'Mi retiro · Smart Gadgets RH' }

/**
 * Todo el retiro del trabajador en un solo sitio: presentar la renuncia (si
 * está activo), el avance de su paz y salvo área por área, los documentos que
 * debe firmar (carta, acta, liquidación) y lo que se le entrega para descargar
 * (orden del examen de egreso, soporte de seguridad social, comprobante).
 */
export default async function MiRetiroPage() {
  const usuario = await requerirPermiso('autoservicio', 'VER')
  const colaboradorId = usuario.colaboradorId
  const [colab, ultimaRenuncia, terminaciones] = colaboradorId
    ? await Promise.all([
        prisma.colaborador.findUnique({ where: { id: colaboradorId }, select: { estado: true } }),
        // La última que presentó, sea cual sea su estado: si es la pendiente se
        // muestra; si Talento Humano la devolvió, se dice por qué. Una devuelta
        // vieja no vuelve a aparecer si después presentó otra y la retiró.
        prisma.renuncia.findFirst({ where: { colaboradorId }, orderBy: { creadoEn: 'desc' } }),
        prisma.terminacion.findMany({
          where: { colaboradorId },
          include: { pazYSalvo: { include: { items: { orderBy: { id: 'asc' } } } }, liquidacion: true, cartas: true },
          orderBy: { fechaRetiro: 'desc' },
        }),
      ])
    : [null, null, []]
  const renuncia = ultimaRenuncia?.estado === 'PRESENTADA' ? ultimaRenuncia : null
  const devuelta = ultimaRenuncia?.estado === 'DEVUELTA' ? ultimaRenuncia : null

  const puedeRenunciar = colab?.estado === 'ACTIVO' && !renuncia && !terminaciones.some((t) => t.estado !== 'CERRADA')


  return (
    <div className="max-w-3xl space-y-4">
      <Encabezado volver enLinea titulo="Mi retiro" />

      {renuncia && (
        <RenunciaPresentada
          id={renuncia.id}
          fechaRetiro={formatFechaCorta(renuncia.fechaRetiro)}
          presentadaEn={formatFechaCorta(renuncia.creadoEn)}
          documentoId={renuncia.documentoId}
        />
      )}
      {/* Devuelta para corregir: se dice por qué, y abajo queda "Presentar" para enviarla de nuevo. */}
      {devuelta && puedeRenunciar && (
        <Card className="border-amber-500/40 bg-amber-500/5 py-0"><CardContent className="flex items-start gap-3 p-3">
          <Undo2 className="mt-0.5 size-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0 text-sm">
            <p className="font-medium">Talento Humano devolvió tu renuncia para corregirla</p>
            {devuelta.motivoDevolucion && <p className="text-muted-foreground">{devuelta.motivoDevolucion}</p>}
            <p className="mt-1 text-xs text-muted-foreground">Corrígela y preséntala de nuevo.</p>
          </div>
        </CardContent></Card>
      )}
      {puedeRenunciar && <PresentarRenuncia hoy={hoyBogotaISO()} />}

      {terminaciones.length === 0 && !renuncia && !puedeRenunciar && (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">No tienes un proceso de retiro.</CardContent></Card>
      )}

      {terminaciones.map((t) => {
        const tipoCarta = CARTA_PRINCIPAL[t.tipo] ?? 'CARTA_TERMINACION'
        const carta = t.cartas.find((c) => c.tipo === tipoCarta)
        const cartaRenuncia = t.cartas.find((c) => c.tipo === 'CARTA_RENUNCIA')
        const items = t.pazYSalvo?.items ?? []
        const fecha = (d: Date | null | undefined) => (d ? formatFechaLarga(d) : null)

        const docs: DocRetiro[] = []
        if (carta?.enviadoFirmaEn) {
          docs.push({ terminacionId: t.id, tipo: 'CARTA', titulo: NOMBRE_CARTA[tipoCarta], detalle: `Enviada el ${formatFechaCorta(carta.enviadoFirmaEn)}`, documentoId: carta.documentoId, firmadaEn: fecha(carta.firmadoEn), comprobanteDocId: null, pagadaEn: null })
        }
        if (t.pazYSalvo?.enviadoFirmaEn) {
          docs.push({ terminacionId: t.id, tipo: 'PAZ_Y_SALVO', titulo: 'Acta de paz y salvo', detalle: 'Entrega de tu puesto de trabajo', documentoId: t.pazYSalvo.documentoId, firmadaEn: fecha(t.pazYSalvo.firmadoEn), comprobanteDocId: null, pagadaEn: null })
        }
        if (t.liquidacion?.enviadoFirmaEn) {
          docs.push({ terminacionId: t.id, tipo: 'LIQUIDACION', titulo: 'Liquidación definitiva', detalle: fmtCOP(Number(t.liquidacion.total)), documentoId: t.liquidacion.documentoId, firmadaEn: fecha(t.liquidacion.firmadoEn), comprobanteDocId: t.liquidacion.comprobanteDocId, pagadaEn: fecha(t.liquidacion.pagadoEn) })
        }
        const descargas = [
          cartaRenuncia?.documentoId && { id: cartaRenuncia.documentoId, titulo: 'Tu carta de renuncia' },
          t.ordenExamenDocId && { id: t.ordenExamenDocId, titulo: 'Orden de examen médico de egreso' },
          t.seguridadSocialDocId && { id: t.seguridadSocialDocId, titulo: 'Soporte de aportes a seguridad social' },
        ].filter((x): x is { id: string; titulo: string } => !!x)

        return (
          <section key={t.id} className="space-y-3">
            <h2 className="text-[13px] font-bold">Retiro del {formatFechaLarga(t.fechaRetiro)}{t.estado === 'CERRADA' ? ' · cerrado' : ''}</h2>

            {items.length > 0 && (
              <Card className="py-0"><CardContent className="p-3">
                <div className="mb-2 flex items-center justify-between">
                  <p className="text-sm font-medium">Tu paz y salvo</p>
                  <p className="text-xs tabular-nums text-muted-foreground">{items.filter((i) => i.cumplido).length} de {items.length}</p>
                </div>
                <ul className="grid gap-1.5 sm:grid-cols-2">
                  {items.map((i) => (
                    <li key={i.id} className={cn('flex items-start gap-2 text-sm', !i.cumplido && 'text-muted-foreground')}>
                      {i.cumplido ? <CircleCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" /> : <Circle className="mt-0.5 size-4 shrink-0" />}
                      <span className="min-w-0">
                        <span className="block font-medium text-foreground">{i.area}</span>
                        <span className="block text-xs">{i.cumplido ? `Verificado el ${formatFechaCorta(i.verificadoEn)}` : i.concepto}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent></Card>
            )}

            {docs.length > 0 && <ul className="space-y-2">{docs.map((d) => <DocumentoRetiro key={d.tipo} doc={d} />)}</ul>}

            {descargas.length > 0 && (
              <Card className="py-0"><CardContent className="divide-y p-0">
                {descargas.map((d) => (
                  <div key={d.id} className="flex items-center gap-2 p-3">
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate text-sm">{d.titulo}</span>
                    <VisorPdf documentoId={d.id} titulo={d.titulo} className={buttonVariants({ size: 'sm', variant: 'outline' })}>Ver</VisorPdf>
                  </div>
                ))}
              </CardContent></Card>
            )}
          </section>
        )
      })}
    </div>
  )
}
