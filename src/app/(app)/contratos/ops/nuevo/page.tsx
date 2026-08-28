import { requerirPermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { ModoNuevoOps } from './modo-nuevo-ops'
import type { FuncionesCargo } from '@/lib/contrato-variables'

export const metadata = { title: 'Nuevo contrato OPS · Smart Gadgets RH' }

export default async function NuevoOpsPage() {
  await requerirPermiso('contratos', 'CREAR')

  const [sedesRaw, cargosRaw, empresa, plantilla] = await Promise.all([
    prisma.sede.findMany({ where: { activa: true }, include: { ciudad: true }, orderBy: { nombre: 'asc' } }),
    prisma.cargo.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' }, select: { id: true, nombre: true, funcionesContrato: true } }),
    prisma.configuracionEmpresa.findFirst(),
    prisma.plantillaContrato.findFirst({ where: { tipo: 'OPS', activa: true }, include: { clausulas: { orderBy: { orden: 'asc' } } } }),
  ])

  const sedes = sedesRaw.map((s) => ({ id: s.id, nombre: s.nombre, ciudad: s.ciudad.nombre }))
  const cargos = cargosRaw.map((c) => ({ id: c.id, nombre: c.nombre, funciones: (c.funcionesContrato as FuncionesCargo | null) ?? null }))
  const empresaData = {
    razonSocial: empresa?.razonSocial ?? '',
    marca: empresa?.nombreComercial ?? '',
    nit: empresa?.nit ?? '',
    representanteLegal: empresa?.representanteLegal ?? '',
    representanteLegalCc: empresa?.representanteLegalCc ?? '',
    direccion: empresa?.direccion ?? '',
    correoDevolucion: empresa?.emailContacto ?? '',
  }
  const plantillaData = plantilla
    ? {
        titulo: plantilla.titulo,
        intro: plantilla.intro,
        cierre: plantilla.cierre,
        clausulas: plantilla.clausulas.map((c) => ({ titulo: c.titulo, cuerpo: c.cuerpo, esFunciones: c.esFunciones, orden: c.orden })),
      }
    : null

  return (
    <div className="max-w-[1600px]">
      <Encabezado titulo="Nuevo contrato OPS" descripcion="Prestación de servicios. Redáctalo desde la plantilla o sube el PDF si ya está hecho; en ambos casos se firma en la app." />
      <ModoNuevoOps sedes={sedes} cargos={cargos} empresa={empresaData} plantilla={plantillaData} />
    </div>
  )
}
