import { requerirPermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { HandCoins } from 'lucide-react'
import { formatFechaLarga } from '@/lib/fechas'
import { fmtCOP } from '@/lib/moneda'
import { mesLargo } from '@/lib/descuentos'
import { MisDescuentos, type DescuentoItem } from './mis-descuentos'

export const metadata = { title: 'Mis descuentos · Smart Gadgets RH' }

/** Descuentos de nómina del colaborador, con sus acuerdos de pago y los que debe firmar. */
export default async function MisDescuentosPage() {
  const usuario = await requerirPermiso('autoservicio', 'VER')
  if (!usuario.colaboradorId) {
    return (
      <div className="max-w-3xl">
        <Encabezado volver titulo="Mis descuentos" />
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Tu usuario no está vinculado a una ficha de colaborador.</CardContent></Card>
      </div>
    )
  }

  const prestamos = await prisma.prestamo.findMany({
    where: { colaboradorId: usuario.colaboradorId },
    orderBy: { creadoEn: 'desc' },
    take: 30,
  })

  const items: DescuentoItem[] = prestamos.map((p) => ({
    id: p.id,
    asunto: p.descripcion ?? 'Descuento de nómina',
    valorTotal: fmtCOP(Number(p.valorTotal)),
    cuotas: `${p.numeroCuotas} cuota${p.numeroCuotas === 1 ? '' : 's'} de ${fmtCOP(Number(p.valorCuota))}`,
    saldo: fmtCOP(Number(p.saldo)),
    desde: mesLargo(p.fechaInicio),
    pagado: p.estado === 'PAGADO',
    acuerdoDocId: p.acuerdoFirmadoDocId ?? p.acuerdoDocId,
    porFirmar: p.requiereFirma && !!p.acuerdoDocId && !p.firmaEmpleadoFecha,
    fechaFirma: p.firmaEmpleadoFecha ? formatFechaLarga(p.firmaEmpleadoFecha) : null,
  }))

  return (
    <div className="max-w-3xl">
      <Encabezado volver enLinea titulo="Mis descuentos" />
      {items.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
          <HandCoins className="size-8" /><p>No tienes descuentos de nómina.</p>
        </CardContent></Card>
      ) : (
        <MisDescuentos items={items} />
      )}
    </div>
  )
}
