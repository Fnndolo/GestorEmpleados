'use client'

import { useRef, useState, useEffect } from 'react'
import { Pencil, Upload, Eraser, ImageUp, Wand2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { limpiarFondoFirma } from '@/lib/firma-fondo'

/**
 * Captura de firma: dibujar en un lienzo o subir una imagen.
 * Devuelve la firma como data URI PNG (o null si está vacía) vía onChange.
 */
export function FirmaCaptura({ onChange }: { onChange: (dataUri: string | null) => void }) {
  const [modo, setModo] = useState<'dibujar' | 'subir'>('dibujar')
  const [subida, setSubida] = useState<{ dataUri: string; fondoQuitado: boolean } | null>(null)
  const [procesando, setProcesando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const dibujando = useRef(false)
  const huboTrazo = useRef(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#0f172a'
  }, [modo])

  function pos(e: React.PointerEvent<HTMLCanvasElement>) {
    const r = canvasRef.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * canvasRef.current!.width, y: ((e.clientY - r.top) / r.height) * canvasRef.current!.height }
  }
  function inicio(e: React.PointerEvent<HTMLCanvasElement>) {
    dibujando.current = true
    const ctx = canvasRef.current!.getContext('2d')!
    const p = pos(e)
    ctx.beginPath()
    ctx.moveTo(p.x, p.y)
    canvasRef.current!.setPointerCapture(e.pointerId)
  }
  function mover(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dibujando.current) return
    const ctx = canvasRef.current!.getContext('2d')!
    const p = pos(e)
    ctx.lineTo(p.x, p.y)
    ctx.stroke()
    huboTrazo.current = true
  }
  function fin() {
    if (!dibujando.current) return
    dibujando.current = false
    if (huboTrazo.current) onChange(canvasRef.current!.toDataURL('image/png'))
  }
  function limpiar() {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.getContext('2d')!.clearRect(0, 0, canvas.width, canvas.height)
    huboTrazo.current = false
    onChange(null)
  }

  function onSubir(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    const reader = new FileReader()
    reader.onload = async () => {
      const original = reader.result as string
      setProcesando(true)
      try {
        // Una foto o un escaneo traen el papel detrás; se lo quitamos aquí, en
        // el navegador, para que sobre el PDF se vea solo el trazo. Si el PNG ya
        // venía sin fondo, se deja tal cual.
        const limpia = await limpiarFondoFirma(original)
        setSubida(limpia)
        onChange(limpia.dataUri)
      } catch {
        toast.error('No se pudo leer la imagen. Prueba con un PNG o JPG.')
      } finally {
        setProcesando(false)
      }
    }
    reader.readAsDataURL(f)
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-1.5">
        <Button type="button" size="sm" variant={modo === 'dibujar' ? 'default' : 'outline'} onClick={() => { setModo('dibujar'); onChange(null); setSubida(null) }}>
          <Pencil className="size-4" /> Dibujar
        </Button>
        <Button type="button" size="sm" variant={modo === 'subir' ? 'default' : 'outline'} onClick={() => { setModo('subir'); onChange(null); limpiar() }}>
          <Upload className="size-4" /> Subir
        </Button>
      </div>

      {modo === 'dibujar' ? (
        <div className="space-y-1.5">
          <canvas
            ref={canvasRef}
            width={560}
            height={180}
            className="w-full touch-none rounded-lg border bg-white"
            style={{ aspectRatio: '560 / 180' }}
            onPointerDown={inicio}
            onPointerMove={mover}
            onPointerUp={fin}
            onPointerLeave={fin}
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">Con el dedo o el mouse.</p>
            <Button type="button" size="sm" variant="ghost" onClick={limpiar}><Eraser className="size-4" /> Limpiar</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          {/* El selector nativo ("Elegir archivo · No se ha seleccionado…") se
              esconde detrás de un botón: en el celular se cortaba y se leía mal. */}
          <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={onSubir} className="hidden" />
          {subida ? (
            <>
              {/* Fondo a cuadros: así se ve que la firma quedó sin papel detrás. */}
              <div className="rounded-lg border p-2 [background:repeating-conic-gradient(#e5e7eb_0_25%,#fff_0_50%)_0_0/16px_16px]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={subida.dataUri} alt="Firma" className="mx-auto max-h-28 object-contain" />
              </div>
              <div className="flex items-center justify-between gap-2">
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Wand2 className="size-3.5" /> {subida.fondoQuitado ? 'Fondo quitado' : 'Ya venía sin fondo'}
                </p>
                <Button type="button" size="sm" variant="ghost" onClick={() => inputRef.current?.click()} disabled={procesando}>
                  <ImageUp className="size-4" /> Cambiar
                </Button>
              </div>
            </>
          ) : (
            <Button type="button" size="sm" variant="outline" className="w-full justify-start" onClick={() => inputRef.current?.click()} disabled={procesando}>
              {procesando ? <Spinner /> : <ImageUp className="size-4" />} Elegir imagen de mi firma
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
