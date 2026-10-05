import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { festivosDelAnio } from '@/lib/dias-habiles'
import { formatFechaISO, hoyBogotaISO } from '@/lib/fechas'
import { FestivosCliente } from './festivos-cliente'

export const metadata = { title: 'Festivos · Configuración' }

export default async function FestivosPage({ searchParams }: { searchParams: Promise<{ anio?: string }> }) {
  const usuario = await requerirPermiso('configuracion', 'VER')
  const puedeEditar = tienePermiso(usuario, 'configuracion', 'EDITAR')
  const sp = await searchParams
  const hoy = hoyBogotaISO()
  const anio = /^\d{4}$/.test(sp.anio ?? '') ? Number(sp.anio) : Number(hoy.slice(0, 4))

  const excepciones = (await prisma.festivoExcepcion.findMany({ orderBy: { fecha: 'asc' } }))
    .map((e) => ({ id: e.id, fecha: formatFechaISO(e.fecha)!, tipo: e.tipo, nombre: e.nombre }))
  const festivos = festivosDelAnio(anio, excepciones).map((f) => ({
    ...f, correccionId: excepciones.find((e) => e.fecha === f.fecha)?.id ?? null,
  }))

  // El título y el selector de año viven en el cliente: el + de "Agregar un
  // festivo" abre su diálogo y va en la misma fila.
  return <FestivosCliente anio={anio} hoy={hoy} festivos={festivos} puedeEditar={puedeEditar} />
}
