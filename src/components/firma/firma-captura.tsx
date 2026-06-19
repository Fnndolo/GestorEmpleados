'use client'

import { useRef, useState, useEffect } from 'react'
import { Pencil, Upload, Eraser } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Captura de firma: dibujar en un lienzo o subir una imagen.
 * Devuelve la firma como data URI PNG (o null si está vacía) vía onChange.
 */
export function FirmaCaptura({ onChange }: { onChange: (dataUri: string | null) => void }) {
  const [modo, setModo] = useState<'dibujar' | 'subir'>('dibujar')
  const [subida, setSubida] = useState<string | null>(null)
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
    if (!f) return
    const reader = new FileReader()
    reader.onload = () => { const url = reader.result as string; setSubida(url); onChange(url) }
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
          <div className="flex justify-between">
            <p className="text-xs text-muted-foreground">Dibuja tu firma con el mouse o el dedo.</p>
            <Button type="button" size="sm" variant="ghost" onClick={limpiar}><Eraser className="size-4" /> Limpiar</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <input type="file" accept="image/png,image/jpeg" onChange={onSubir} className="block w-full text-sm" />
          {subida && (
            <div className={cn('rounded-lg border bg-white p-2')}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={subida} alt="Firma" className="mx-auto max-h-24 object-contain" />
            </div>
          )}
          <p className="text-xs text-muted-foreground">Sube una imagen de tu firma (PNG con fondo transparente recomendado).</p>
        </div>
      )}
    </div>
  )
}
