import { requerirSesion } from '@/server/sesion'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { eventosDelMes } from '@/server/consultas/eventos-colaborador'
import { CalendarioMes } from '@/components/calendario/calendario-mes'
import { hoyBogota } from '@/lib/fechas'

export const metadata = { title: 'Mi calendario · Smart Gadgets RH' }

export default async function MiCalendarioPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const usuario = await requerirSesion()
  const { mes: mesParam } = await searchParams

  const hoy = hoyBogota()
  let anio = hoy.getUTCFullYear()
  let mes = hoy.getUTCMonth() + 1
  if (mesParam && /^\d{4}-\d{2}$/.test(mesParam)) {
    anio = Number(mesParam.slice(0, 4))
    mes = Number(mesParam.slice(5, 7))
  }

  if (!usuario.colaboradorId) {
    return (
      <div className="mx-auto max-w-3xl">
        <Encabezado titulo="Mi calendario" />
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Tu usuario no está vinculado a una ficha de colaborador.</CardContent></Card>
      </div>
    )
  }

  const eventos = await eventosDelMes(usuario.colaboradorId, anio, mes)

  return (
    <div className="mx-auto max-w-2xl">
      <Encabezado titulo="Mi calendario" descripcion="Tus días con vacaciones, permisos, licencias, día de la familia, compensatorios, incapacidades y suspensiones." />
      <CalendarioMes anio={anio} mes={mes} eventos={eventos} baseHref="/autoservicio/calendario" />
    </div>
  )
}
