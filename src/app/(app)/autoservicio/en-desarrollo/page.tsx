import { Card, CardContent } from '@/components/ui/card'
import { Encabezado } from '@/components/shell/encabezado'

export const metadata = { title: 'Módulo en desarrollo · Smart Gadgets RH' }

/**
 * Redirige aquí un trámite que todavía no está listo para autoservicio, sin
 * tocar lo que ya existe detrás (la pantalla y sus acciones siguen ahí; solo
 * se quita el acceso desde el panel mientras se termina). Mismo estilo que
 * `NoAplica`, para el mismo tipo de aviso.
 */
export default async function EnDesarrolloPage({ searchParams }: { searchParams: Promise<{ titulo?: string }> }) {
  const { titulo } = await searchParams
  return (
    <div className="max-w-3xl">
      <Encabezado volver titulo={titulo || 'Módulo en desarrollo'} />
      <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
        <p className="font-medium text-foreground">Estamos trabajando muy duro para habilitar este módulo</p>
        <p className="mx-auto mt-1.5 max-w-prose">Gracias por tu paciencia.</p>
      </CardContent></Card>
    </div>
  )
}
