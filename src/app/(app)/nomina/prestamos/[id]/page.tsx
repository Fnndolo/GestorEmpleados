import { notFound } from 'next/navigation'
import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { buttonVariants } from '@/components/ui/button'
import { VisorPdf } from '@/components/documentos/visor-pdf'
import { Card, CardContent } from '@/components/ui/card'
import { Pill } from '@/components/ui-kit'
import { Progress } from '@/components/ui/progress'
import { Eye } from 'lucide-react'
import { fmtCOP } from '@/lib/moneda'
import { formatFechaCorta, formatFechaLarga } from '@/lib/fechas'
import { PazSalvoBoton } from './paz-salvo-boton'
import { AcuerdoDescuento } from './acuerdo-descuento'
import { CuotasDescuento } from './cuotas-descuento'
import { mesLargo } from '@/lib/descuentos'

export const metadata = { title: 'Detalle de descuento · Smart Gadgets RH' }

export default async function PrestamoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const usuario = await requerirPermiso('nomina', 'VER')
  const puedeExportar = tienePermiso(usuario, 'nomina', 'EXPORTAR')
  const puedeEditar = tienePermiso(usuario, 'nomina', 'EDITAR')

  const prestamo = await prisma.prestamo.findUnique({
    where: { id },
    include: {
      colaborador: { select: { id: true, nombres: true, apellidos: true } },
      cuotas: { orderBy: { numero: 'asc' } },
    },
  })
  if (!prestamo) notFound()

  const pagadas = prestamo.cuotas.filter((c) => c.pagada).length
  const faltantes = prestamo.numeroCuotas - pagadas
  const pct = prestamo.numeroCuotas > 0 ? Math.round((pagadas / prestamo.numeroCuotas) * 100) : 0
  const pazSalvo = prestamo.estado === 'PAGADO'
    ? await prisma.documento.findFirst({ where: { entidadTipo: 'Prestamo', entidadId: prestamo.id }, orderBy: { creadoEn: 'desc' } })
    : null

  return (
    <div className="max-w-3xl">
      <Encabezado
        volver
        titulo={`Descuento · ${prestamo.colaborador.nombres} ${prestamo.colaborador.apellidos}`}
        descripcion={`${prestamo.descripcion ?? 'Descuento de nómina'} · desde ${mesLargo(prestamo.fechaInicio)}`}
      />

      <Card className="mb-4"><CardContent className="py-5 space-y-4">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Dato label="Valor total" valor={fmtCOP(Number(prestamo.valorTotal))} />
          <Dato label="Cuota" valor={fmtCOP(Number(prestamo.valorCuota))} />
          <Dato label="Saldo" valor={fmtCOP(Number(prestamo.saldo))} />
          <div>
            <p className="mb-1 text-xs text-muted-foreground">Estado</p>
            <Pill tone={prestamo.estado === 'PAGADO' ? 'ok' : 'warn'}>{prestamo.estado === 'PAGADO' ? 'Pagado' : 'Activo'}</Pill>
          </div>
        </div>
        <div>
          <div className="flex justify-between text-sm mb-1">
            <span>{pagadas} de {prestamo.numeroCuotas} cuotas pagadas</span>
            <span className="text-muted-foreground">{faltantes} por pagar</span>
          </div>
          <Progress value={pct} />
        </div>
        <AcuerdoDescuento
          prestamoId={prestamo.id}
          asunto={prestamo.descripcion ?? 'Descuento'}
          acuerdoDocId={prestamo.acuerdoDocId}
          firmadoDocId={prestamo.acuerdoFirmadoDocId}
          requiereFirma={prestamo.requiereFirma}
          fechaFirma={prestamo.firmaEmpleadoFecha ? formatFechaLarga(prestamo.firmaEmpleadoFecha) : null}
          puedeEditar={puedeEditar}
        />
        {prestamo.estado === 'PAGADO' && (
          <div className="flex items-center gap-2 pt-1">
            {pazSalvo ? (
              <VisorPdf documentoId={pazSalvo.id} titulo="Paz y salvo del préstamo" className={buttonVariants({ size: 'sm' })}>
                <Eye className="size-4" /> Ver paz y salvo
              </VisorPdf>
            ) : puedeExportar ? (
              <PazSalvoBoton prestamoId={prestamo.id} />
            ) : null}
          </div>
        )}
      </CardContent></Card>

      <CuotasDescuento
        prestamoId={prestamo.id}
        saldo={Number(prestamo.saldo)}
        puedeAjustar={puedeEditar && prestamo.estado === 'ACTIVO'}
        cuotas={prestamo.cuotas.map((c) => ({
          id: c.id,
          numero: c.numero,
          valor: c.pagada ? Number(c.valor) : Number(c.valorAcordado ?? c.valor),
          pagada: c.pagada,
          fechaPago: c.fechaPago ? formatFechaCorta(c.fechaPago) : null,
          ajustada: c.valorAcordado != null && Number(c.valorAcordado) !== Number(prestamo.valorCuota),
        }))}
      />
    </div>
  )
}

function Dato({ label, valor }: { label: string; valor: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-sm font-medium">{valor}</p>
    </div>
  )
}
