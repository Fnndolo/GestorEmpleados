'use client'

import { Bar, BarChart, ResponsiveContainer, XAxis, YAxis, Tooltip, Cell } from 'recharts'

export function GraficoBarras({ datos, color = '#6366f1' }: { datos: { nombre: string; valor: number }[]; color?: string }) {
  if (datos.length === 0) return <p className="text-sm text-muted-foreground py-8 text-center">Sin datos.</p>
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, datos.length * 38)}>
      <BarChart data={datos} layout="vertical" margin={{ left: 8, right: 16 }}>
        <XAxis type="number" allowDecimals={false} hide />
        <YAxis type="category" dataKey="nombre" width={110} tick={{ fontSize: 12 }} />
        <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
        <Bar dataKey="valor" radius={[0, 4, 4, 0]}>
          {datos.map((_, i) => <Cell key={i} fill={color} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  )
}
