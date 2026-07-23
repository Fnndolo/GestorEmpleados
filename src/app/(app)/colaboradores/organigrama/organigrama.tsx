'use client'

/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react'
import Script from 'next/script'
import { useRouter } from 'next/navigation'
import { Download } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

declare global {
  interface Window {
    OrgChart?: any
  }
}

export type NodoOrg = {
  id: string
  nombre: string
  cargo: string
  tieneFoto: boolean
  jefeId: string | null
}

// Avatar generado: iniciales sobre fondo de color (determinístico por nombre).
// La paleta vive en etiquetas.ts y es la misma de los avatares de toda la app.
import { colorAvatar as colorDe } from '@/lib/etiquetas'

function inicialesDe(nombre: string): string {
  const p = nombre.split(' ').filter(Boolean)
  return `${p[0]?.[0] ?? ''}${p[1]?.[0] ?? ''}`.toUpperCase()
}

function avatarIniciales(nombre: string): string {
  const size = 90
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return ''
  ctx.fillStyle = colorDe(nombre)
  ctx.fillRect(0, 0, size, size)
  ctx.fillStyle = '#ffffff'
  ctx.font = 'bold 38px Inter, Arial, sans-serif'
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(inicialesDe(nombre), size / 2, size / 2 + 2)
  return canvas.toDataURL('image/png')
}

export function Organigrama({ nodos }: { nodos: NodoOrg[] }) {
  const router = useRouter()
  const contenedorRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<any>(null)
  // Si el script ya estaba cargado (p. ej. al volver a la página), arrancar listo.
  const [listo, setListo] = useState(() => typeof window !== 'undefined' && !!window.OrgChart)

  useEffect(() => {
    const OrgChart = typeof window !== 'undefined' ? window.OrgChart : undefined
    const cont = contenedorRef.current
    if (!listo || !OrgChart || !cont) return

    // Formato BALKAN: nodos planos con id/pid (el padre es el jefe inmediato).
    const data = nodos.map((n) => ({
      id: n.id,
      pid: n.jefeId ?? undefined,
      name: n.nombre,
      title: n.cargo,
      img: n.tieneFoto ? `/api/documentos/foto/${n.id}` : avatarIniciales(n.nombre),
    }))

    const chart = new OrgChart(cont, {
      nodes: data,
      template: 'olivia',
      layout: OrgChart.mixed, // compacto: mezcla horizontal/vertical para ocupar menos espacio
      enableSearch: true,
      scaleInitial: OrgChart.match.boundary, // ajusta todo el árbol al contenedor al inicio
      mouseScrool: OrgChart.action.zoom,
      // Barra de herramientas nativa: cambiar orientación, zoom, ajustar y expandir todo.
      toolbar: { layout: true, zoom: true, fit: true, expandAll: true },
      nodeBinding: { field_0: 'name', field_1: 'title', img_0: 'img' },
    })

    // Al hacer clic en un nodo (foto o nombre) → abrir la ficha del colaborador.
    chart.on('click', (_sender: any, args: any) => {
      if (args?.node?.id) router.push(`/colaboradores/${args.node.id}`)
      return false // cancela el formulario de edición por defecto
    })

    chartRef.current = chart
    return () => {
      try {
        chartRef.current?.destroy?.()
      } catch {
        /* noop */
      }
      cont.innerHTML = ''
      chartRef.current = null
    }
  }, [listo, nodos, router])

  function exportarPDF() {
    const chart = chartRef.current
    // La API nueva usa exportToPDF; se mantiene exportPDF como respaldo por compatibilidad.
    const exportar = chart?.exportToPDF ?? chart?.exportPDF
    if (!chart || typeof exportar !== 'function') {
      toast.error('La exportación no está disponible todavía.')
      return
    }
    try {
      exportar.call(chart, { landscape: true, format: 'A4', filename: 'organigrama.pdf' })
    } catch (e) {
      console.error('exportToPDF falló:', e)
      toast.error('No se pudo exportar el PDF. Revisa la consola del navegador.')
    }
  }

  return (
    <div className="space-y-3">
      <Script
        src="https://cdn.balkan.app/orgchart.js"
        strategy="afterInteractive"
        onLoad={() => setListo(true)}
        onReady={() => setListo(true)}
      />
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={exportarPDF} disabled={!listo}>
          <Download className="size-4" /> Exportar (PDF)
        </Button>
      </div>
      <div ref={contenedorRef} className="rounded-lg border bg-card" style={{ width: '100%', height: '72vh' }} />
    </div>
  )
}
