import { tramiteAplica, NoAplica } from '../no-aplica'
import { requerirPermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { NOMINA_VISIBLE } from '@/lib/nomina/visibilidad'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { Receipt, Download, FileCheck2 } from 'lucide-react'
import { fmtCOP } from '@/lib/moneda'
import { formatFechaCorta } from '@/lib/fechas'
import { VisorPdf } from '@/components/documentos/visor-pdf'

export const metadata = { title: 'Mis desprendibles · Smart Gadgets RH' }

export default async function MisDesprendiblesPage() {
  const usuario = await requerirPermiso('autoservicio', 'VER')

  if (!usuario.colaboradorId) {
    return (
      <div className="max-w-3xl">
        <Encabezado volver titulo="Mis desprendibles" />
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          Tu usuario no está vinculado a una ficha de colaborador. Contacta a Talento Humano.
        </CardContent></Card>
      </div>
    )
  }

  if (!(await tramiteAplica(usuario.colaboradorId, 'desprendibles'))) {
    return <NoAplica titulo="Mis desprendibles" motivo="Como tu vínculo es de prestación de servicios, no hay nómina ni desprendibles de pago: tus pagos se gestionan por cuenta de cobro." />
  }

  const liquidaciones = await prisma.liquidacionNomina.findMany({
    // Solo de nóminas aprobadas: antes los valores todavía pueden cambiar.
    where: { colaboradorId: usuario.colaboradorId, documentoId: { not: null }, periodo: { estado: { in: [...NOMINA_VISIBLE] } } },
    include: { periodo: { select: { nombre: true, fechaFin: true } } },
    orderBy: { periodo: { fechaFin: 'desc' } },
    take: 120,
  })

  return (
    <div className="max-w-3xl">
      <Encabezado
        volver
        titulo="Mis desprendibles de pago"
        descripcion="Descarga la colilla de cada periodo de nómina. Solo tú y Talento Humano pueden verlas."
      />

      {liquidaciones.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
          <Receipt className="size-8" />
          <p>Aún no tienes desprendibles. Aparecen cuando se liquida tu nómina.</p>
        </CardContent></Card>
      ) : (
        <Card><CardContent className="divide-y p-0">
          {liquidaciones.map((l) => (
            <div key={l.id} className="flex items-center gap-3 p-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
                <Receipt className="size-4 text-muted-foreground" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{l.periodo.nombre}</p>
                <p className="text-xs text-muted-foreground">
                  {l.pagadoEn ? `Pagado el ${formatFechaCorta(l.pagadoEn)}` : `Periodo al ${formatFechaCorta(l.periodo.fechaFin)}`} · Neto <span className="font-medium text-foreground">{fmtCOP(Number(l.neto))}</span>
                </p>
              </div>
              {/* El comprobante de la transferencia, cuando Talento Humano registra el pago. */}
              {l.comprobantePagoId && (
                <VisorPdf
                  documentoId={l.comprobantePagoId}
                  titulo={`Comprobante de pago · ${l.periodo.nombre}`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors hover:bg-accent"
                >
                  <FileCheck2 className="size-4" /> <span className="hidden sm:inline">Comprobante</span>
                </VisorPdf>
              )}
              {l.documentoId && (
                <VisorPdf
                  documentoId={l.documentoId}
                  titulo={`Desprendible · ${l.periodo.nombre}`}
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors hover:bg-accent"
                >
                  <Download className="size-4" /> Ver / descargar
                </VisorPdf>
              )}
            </div>
          ))}
        </CardContent></Card>
      )}
    </div>
  )
}
