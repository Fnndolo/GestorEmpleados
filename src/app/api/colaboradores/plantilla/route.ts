import { NextResponse } from 'next/server'
import ExcelJS from 'exceljs'
import { obtenerSesion, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'

export const runtime = 'nodejs'

const COLUMNAS = [
  { header: 'tipoDocumento (CC/CE/TI/PASAPORTE/PPT/NIT)*', key: 'tipoDocumento', width: 22 },
  { header: 'numeroDocumento*', key: 'numeroDocumento', width: 18 },
  { header: 'nombres*', key: 'nombres', width: 20 },
  { header: 'apellidos*', key: 'apellidos', width: 20 },
  { header: 'celular*', key: 'celular', width: 14 },
  { header: 'emailPersonal', key: 'emailPersonal', width: 24 },
  { header: 'fechaNacimiento (AAAA-MM-DD)', key: 'fechaNacimiento', width: 18 },
  { header: 'direccion', key: 'direccion', width: 24 },
  { header: 'tipoVinculo*', key: 'tipoVinculo', width: 22 },
  { header: 'modalidadTrabajo*', key: 'modalidadTrabajo', width: 18 },
  { header: 'sede* (nombre exacto)', key: 'sede', width: 20 },
  { header: 'area (nombre exacto)', key: 'area', width: 20 },
  { header: 'cargo (nombre exacto)', key: 'cargo', width: 24 },
  { header: 'fechaIngreso (AAAA-MM-DD)*', key: 'fechaIngreso', width: 20 },
  { header: 'eps', key: 'eps', width: 16 },
  { header: 'afp', key: 'afp', width: 16 },
  { header: 'fondoCesantias', key: 'fondoCesantias', width: 16 },
  { header: 'cajaCompensacion', key: 'cajaCompensacion', width: 16 },
  { header: 'arl', key: 'arl', width: 16 },
  { header: 'banco', key: 'banco', width: 16 },
  { header: 'tipoCuenta (AHORROS/CORRIENTE/BILLETERA_DIGITAL)', key: 'tipoCuenta', width: 20 },
  { header: 'numeroCuenta', key: 'numeroCuenta', width: 18 },
  { header: 'vacacionesPendientes (días)', key: 'vacacionesPendientes', width: 20 },
]

export async function GET() {
  const usuario = await obtenerSesion()
  if (!usuario || !tienePermiso(usuario, 'colaboradores', 'CREAR')) {
    return NextResponse.json({ error: 'Sin permiso' }, { status: 403 })
  }

  const [sedes, areas, cargos, entidades, bancos] = await Promise.all([
    prisma.sede.findMany({ where: { activa: true }, orderBy: { nombre: 'asc' } }),
    prisma.area.findMany({ where: { activa: true }, orderBy: { nombre: 'asc' } }),
    prisma.cargo.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } }),
    prisma.entidadSeguridadSocial.findMany({ where: { activa: true }, orderBy: { nombre: 'asc' } }),
    prisma.banco.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } }),
  ])

  const wb = new ExcelJS.Workbook()
  wb.creator = 'Smart Gadgets RH'

  const hoja = wb.addWorksheet('Colaboradores')
  hoja.columns = COLUMNAS
  hoja.getRow(1).font = { bold: true }
  hoja.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E293B' } }
  hoja.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } }
  hoja.addRow({
    tipoDocumento: 'CC', numeroDocumento: '1010101010', nombres: 'Juan', apellidos: 'Pérez Gómez',
    celular: '3001234567', tipoVinculo: 'TERMINO_INDEFINIDO', modalidadTrabajo: 'PRESENCIAL',
    sede: sedes[0]?.nombre ?? 'Sede Principal', fechaIngreso: '2026-01-15',
  })

  // Hoja de referencia con los valores válidos
  const ref = wb.addWorksheet('Listas de referencia')
  ref.columns = [
    { header: 'Sedes', width: 24 }, { header: 'Áreas', width: 24 }, { header: 'Cargos', width: 26 },
    { header: 'EPS/AFP/Cesantías/Caja/ARL', width: 28 }, { header: 'Bancos', width: 22 },
  ]
  ref.getRow(1).font = { bold: true }
  const maxLen = Math.max(sedes.length, areas.length, cargos.length, entidades.length, bancos.length)
  for (let i = 0; i < maxLen; i++) {
    ref.addRow([
      sedes[i]?.nombre ?? '', areas[i]?.nombre ?? '', cargos[i]?.nombre ?? '',
      entidades[i] ? `${entidades[i].nombre} (${entidades[i].tipo})` : '', bancos[i]?.nombre ?? '',
    ])
  }

  const buffer = await wb.xlsx.writeBuffer()
  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="plantilla-colaboradores.xlsx"',
    },
  })
}
