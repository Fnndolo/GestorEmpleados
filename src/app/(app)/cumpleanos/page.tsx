import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { sedeActualId } from '@/server/sede-actual'
import { cumpleanosEntre, claveCumpleanos } from '@/server/cumpleanos'
import { hoyBogota, formatFechaISO } from '@/lib/fechas'
import { Encabezado } from '@/components/shell/encabezado'
import { CumpleanosCliente, type FilaCumpleanos, type CelebracionItem } from './cumpleanos-cliente'

export const metadata = { title: 'Cumpleaños · Smart Gadgets RH' }

/**
 * Cumpleaños del mes en curso y del siguiente, con el estado de su celebración.
 * Se muestra el mes entero (no solo desde hoy) porque las facturas llegan
 * después del cumpleaños: TH necesita seguir viendo los que ya pasaron.
 */
export default async function CumpleanosPage() {
  const usuario = await requerirPermiso('bienestar', 'VER')
  const puedeCrear = tienePermiso(usuario, 'bienestar', 'CREAR')
  const puedeEditar = tienePermiso(usuario, 'bienestar', 'EDITAR')
  const puedeEliminar = tienePermiso(usuario, 'bienestar', 'ELIMINAR')
  const sede = await sedeActualId()

  const hoy = hoyBogota()
  const desde = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1))
  const hasta = new Date(Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() + 2, 0))

  const proximos = await cumpleanosEntre(desde, hasta, sede ? { sedeId: sede } : {})

  // Las celebraciones del rango, más cualquiera con facturas por revisar aunque
  // sea de un mes anterior: no se le puede perder de vista a TH.
  const celebraciones = await prisma.celebracionCumpleanos.findMany({
    where: {
      OR: [
        { fecha: { gte: desde, lte: hasta } },
        { estado: 'FACTURAS_ENTREGADAS' },
      ],
      ...(sede ? { colaborador: { sedeId: sede } } : {}),
    },
    include: {
      encargado: { select: { id: true, nombres: true, apellidos: true } },
      colaborador: { select: { id: true, nombres: true, apellidos: true, fotoPath: true, fechaNacimiento: true, sede: { select: { nombre: true } }, cargo: { select: { nombre: true } } } },
    },
  })
  const facturas = await prisma.documento.findMany({
    where: { entidadTipo: 'CelebracionCumpleanos', entidadId: { in: celebraciones.map((c) => c.id) } },
    select: { id: true, entidadId: true, nombre: true, mimeType: true },
    orderBy: { creadoEn: 'asc' },
  })
  const facturasDe = (id: string) => facturas.filter((f) => f.entidadId === id).map(({ id, nombre, mimeType }) => ({ id, nombre, mimeType }))
  const item = (c: (typeof celebraciones)[number]): CelebracionItem => ({
    id: c.id,
    estado: c.estado,
    encargado: { id: c.encargado.id, nombre: `${c.encargado.nombres} ${c.encargado.apellidos}` },
    nota: c.nota,
    valorReportado: c.valorReportado != null ? Number(c.valorReportado) : null,
    motivoDevolucion: c.motivoDevolucion,
    facturasEntregadasEn: c.facturasEntregadasEn ? formatFechaISO(c.facturasEntregadasEn) : null,
    facturas: facturasDe(c.id),
  })
  const porClave = new Map(celebraciones.map((c) => [claveCumpleanos(c.colaboradorId, c.anio), c]))

  const filas: FilaCumpleanos[] = proximos.map((p) => {
    const c = porClave.get(claveCumpleanos(p.colaborador.id, p.anio))
    return {
      clave: claveCumpleanos(p.colaborador.id, p.anio),
      colaborador: p.colaborador,
      fecha: formatFechaISO(p.fecha),
      anio: p.anio,
      edad: p.edad,
      pasado: p.fecha < hoy,
      celebracion: c ? item(c) : null,
    }
  })
  // Facturas por revisar de cumpleaños fuera del rango.
  const enRango = new Set(filas.map((f) => f.clave))
  const rezagadas: FilaCumpleanos[] = celebraciones
    .filter((c) => c.estado === 'FACTURAS_ENTREGADAS' && !enRango.has(claveCumpleanos(c.colaboradorId, c.anio)))
    .map((c) => ({
      clave: claveCumpleanos(c.colaboradorId, c.anio),
      colaborador: { id: c.colaborador.id, nombres: c.colaborador.nombres, apellidos: c.colaborador.apellidos, fotoPath: c.colaborador.fotoPath, sede: c.colaborador.sede.nombre, cargo: c.colaborador.cargo?.nombre ?? null },
      fecha: formatFechaISO(c.fecha),
      anio: c.anio,
      edad: c.colaborador.fechaNacimiento ? c.anio - c.colaborador.fechaNacimiento.getUTCFullYear() : null,
      pasado: true,
      celebracion: item(c),
    }))

  const sinFecha = await prisma.colaborador.count({ where: { estado: 'ACTIVO', fechaNacimiento: null, ...(sede ? { sedeId: sede } : {}) } })

  return (
    <div className="max-w-5xl">
      <Encabezado
        titulo="Cumpleaños"
        descripcion="Los de este mes y el siguiente. A cada uno se le asigna quien organiza la celebración; esa persona sube después las facturas y aquí se revisan."
      />
      <CumpleanosCliente
        filas={filas}
        rezagadas={rezagadas}
        hoy={formatFechaISO(hoy)}
        sinFechaNacimiento={sinFecha}
        permisos={{ crear: puedeCrear, editar: puedeEditar, eliminar: puedeEliminar }}
      />
    </div>
  )
}
