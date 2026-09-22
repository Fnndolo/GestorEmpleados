import { requerirPermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { Timer } from 'lucide-react'
import { formatFechaLarga } from '@/lib/fechas'
import { fmtCOP } from '@/lib/moneda'
import { MisHorasExtra } from './mis-horas-extra'

export const metadata = { title: 'Mis horas extra · Smart Gadgets RH' }

/**
 * Las órdenes de pago de horas extra que le corresponde firmar (o ya firmó)
 * al colaborador. En esta empresa las horas extra se pagan APARTE de la
 * nómina: esto es el "acepto este monto" antes de que se le pague.
 */
export default async function MisHorasExtraPage() {
  const usuario = await requerirPermiso('autoservicio', 'VER')
  if (!usuario.colaboradorId) {
    return (
      <div className="max-w-3xl">
        <Encabezado volver titulo="Mis horas extra" />
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Tu usuario no está vinculado a una ficha de colaborador.</CardContent></Card>
      </div>
    )
  }

  const pagos = await prisma.pagoHorasExtra.findMany({
    where: { colaboradorId: usuario.colaboradorId },
    orderBy: { desde: 'desc' },
    take: 24,
  })

  const items = pagos.map((p) => ({
    id: p.id,
    desde: formatFechaLarga(p.desde),
    hasta: formatFechaLarga(p.hasta),
    valor: fmtCOP(Number(p.valor)),
    horasExtra: Number(p.horasExtra),
    estado: p.estado,
    ordenDocId: p.ordenDocId,
    comprobanteDocId: p.comprobanteDocId,
    fechaFirma: p.firmaFecha ? formatFechaLarga(p.firmaFecha) : null,
    fechaPago: p.pagadoEn ? formatFechaLarga(p.pagadoEn) : null,
  }))

  return (
    <div className="max-w-3xl">
      <Encabezado volver enLinea titulo="Mis horas extra" />
      {items.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
          <Timer className="size-8" /><p>No tienes órdenes de pago de horas extra.</p>
        </CardContent></Card>
      ) : (
        <MisHorasExtra items={items} />
      )}
    </div>
  )
}
