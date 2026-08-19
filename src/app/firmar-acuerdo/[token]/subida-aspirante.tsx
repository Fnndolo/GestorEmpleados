'use client'

import { useState } from 'react'
import { Upload, CircleCheck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { subirAcuerdoConToken } from './acciones'

const MAX_BYTES = 5 * 1024 * 1024

/**
 * Única acción de la página pública: elegir el PDF firmado y enviarlo.
 * Sin sesión, sin menús — el aspirante no es usuario del sistema.
 */
export function SubidaAspirante({ token, yaSubido }: { token: string; yaSubido: boolean }) {
  const [archivo, setArchivo] = useState<File | null>(null)
  const [enviando, setEnviando] = useState(false)
  const [listo, setListo] = useState(yaSubido)
  const [error, setError] = useState<string | null>(null)

  async function enviar() {
    if (!archivo) return
    if (archivo.size > MAX_BYTES) {
      setError(`El PDF pesa ${(archivo.size / 1024 / 1024).toFixed(1)} MB y el máximo son 5 MB.`)
      return
    }
    setError(null)
    setEnviando(true)

    // El archivo va como FormData (multipart), no como data URI: así no pasa por
    // la serialización de argumentos de la Server Action ni se infla un 33 %.
    const datos = new FormData()
    datos.set('token', token)
    datos.set('archivo', archivo)

    const res = await subirAcuerdoConToken(datos).catch(() => null)
    setEnviando(false)
    if (!res) { setError('No se pudo enviar el archivo. Revisa tu conexión e intenta de nuevo.'); return }
    if (res.ok) setListo(true)
    else setError(res.error)
  }

  if (listo) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border p-6 text-center">
        <CircleCheck className="size-8 text-emerald-600" />
        <p className="font-medium">Acuerdo recibido</p>
        <p className="text-sm text-muted-foreground">
          Gracias. La empresa ya tiene tu documento firmado; no tienes que hacer nada más.
        </p>
        {/* Se permite volver a subir por si mandó el archivo equivocado. */}
        <button type="button" onClick={() => setListo(false)} className="mt-1 text-xs text-muted-foreground underline">
          Subir otro archivo
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-3 rounded-lg border p-5">
      <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-6 text-center transition-colors hover:bg-muted/50">
        <Upload className="size-6 text-muted-foreground" />
        <span className="text-sm font-medium">{archivo ? archivo.name : 'Selecciona el PDF firmado'}</span>
        <span className="text-xs text-muted-foreground">Solo PDF · máximo 5 MB</span>
        <input
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => { setArchivo(e.target.files?.[0] ?? null); setError(null) }}
        />
      </label>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <Button className="w-full" onClick={enviar} disabled={!archivo || enviando}>
        {enviando ? <Spinner /> : <Upload className="size-4" />} Enviar acuerdo firmado
      </Button>
    </div>
  )
}
