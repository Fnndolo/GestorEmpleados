import { WifiOff } from 'lucide-react'

export const metadata = { title: 'Sin conexión · Smart Gadgets RH' }

export default function OfflinePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-muted">
        <WifiOff className="size-8 text-muted-foreground" />
      </div>
      <h1 className="text-xl font-semibold">Sin conexión a internet</h1>
      <p className="max-w-sm text-muted-foreground">
        No pudimos cargar esta página. Por seguridad, la información de la plataforma no se
        guarda en el dispositivo. Reconéctate e intenta de nuevo.
      </p>
    </div>
  )
}
