import { NextResponse, type NextRequest } from 'next/server'
import ExcelJS from 'exceljs'
import { obtenerSesion, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'

/** Resumen PILA en Excel (mapeable al operador). Alcance v1: resumen con totales de control. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const usuario = await obtenerSesion()
  if (!usuario || !tienePermiso(usuario, 'nomina', 'EXPORTAR')) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const periodo = await prisma.periodoNomina.findUnique({ where: { id } })
  if (!periodo) return NextResponse.json({ error: 'No encontrado' }, { status: 404 })

  const liquidaciones = await prisma.liquidacionNomina.findMany({
    where: { periodoId: id },
    include: { detalles: true, colaborador: { include: { eps: true, afp: true, cajaCompensacion: true, arl: true } } },
  })

  const valorDe = (det: { conceptoCodigo: string; valor: unknown }[], codigo: string) =>
    Number(det.find((d) => d.conceptoCodigo === codigo)?.valor ?? 0)

  const wb = new ExcelJS.Workbook()
  const hoja = wb.addWorksheet('Resumen PILA')
  hoja.columns = [
    { header: 'Tipo doc', key: 'td', width: 10 },
    { header: 'Documento', key: 'doc', width: 16 },
    { header: 'Apellidos y nombres', key: 'nombre', width: 30 },
    { header: 'EPS', key: 'eps', width: 18 },
    { header: 'AFP', key: 'afp', width: 18 },
    { header: 'Caja', key: 'caja', width: 16 },
    { header: 'ARL', key: 'arl', width: 16 },
    { header: 'IBC', key: 'ibc', width: 14 },
    { header: 'Salud emp.', key: 'saludE', width: 12 },
    { header: 'Salud patr.', key: 'saludP', width: 12 },
    { header: 'Pensión emp.', key: 'pensE', width: 12 },
    { header: 'Pensión patr.', key: 'pensP', width: 12 },
    { header: 'ARL aporte', key: 'arlA', width: 12 },
    { header: 'Caja aporte', key: 'cajaA', width: 12 },
    { header: 'SENA', key: 'sena', width: 10 },
    { header: 'ICBF', key: 'icbf', width: 10 },
  ]
  hoja.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  hoja.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }

  for (const liq of liquidaciones) {
    const c = liq.colaborador
    hoja.addRow({
      td: c.tipoDocumento, doc: c.numeroDocumento, nombre: `${c.apellidos} ${c.nombres}`,
      eps: c.eps?.nombre ?? '', afp: c.afp?.nombre ?? '', caja: c.cajaCompensacion?.nombre ?? '', arl: c.arl?.nombre ?? '',
      ibc: Number(liq.ibc),
      saludE: valorDe(liq.detalles, 'SALUD_EMP'), saludP: valorDe(liq.detalles, 'APORTE_SALUD'),
      pensE: valorDe(liq.detalles, 'PENSION_EMP'), pensP: valorDe(liq.detalles, 'APORTE_PENSION'),
      arlA: valorDe(liq.detalles, 'APORTE_ARL'), cajaA: valorDe(liq.detalles, 'APORTE_CAJA'),
      sena: valorDe(liq.detalles, 'APORTE_SENA'), icbf: valorDe(liq.detalles, 'APORTE_ICBF'),
    })
  }
  // Fila de totales de control
  const totalRow = hoja.addRow({ nombre: 'TOTALES' })
  totalRow.font = { bold: true }
  for (const col of ['ibc', 'saludE', 'saludP', 'pensE', 'pensP', 'arlA', 'cajaA', 'sena', 'icbf']) {
    const colObj = hoja.getColumn(col)
    let suma = 0
    hoja.eachRow((row, n) => { if (n > 1 && n < totalRow.number) suma += Number(row.getCell(colObj.number).value ?? 0) })
    totalRow.getCell(colObj.number).value = suma
  }

  const buffer = await wb.xlsx.writeBuffer()
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="resumen-pila-${periodo.nombre}.xlsx"`,
    },
  })
}
