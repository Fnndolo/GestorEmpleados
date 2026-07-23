'use client'

import { useState } from 'react'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

export type TabItem = { valor: string; label: string; alerta?: boolean }

/**
 * Pestañas responsive para vistas de detalle (p. ej. la ficha del colaborador):
 * en móvil se muestran como un desplegable (sin scroll horizontal) y en escritorio
 * como pestañas normales. Los `<TabsContent>` se pasan como children.
 */
export function TabsResponsive({
  items,
  children,
  defecto,
}: {
  items: TabItem[]
  children: React.ReactNode
  defecto?: string
}) {
  const [valor, setValor] = useState(defecto ?? items[0]?.valor ?? '')

  return (
    <Tabs value={valor} onValueChange={setValor}>
      {/* Móvil: desplegable */}
      <div className="mb-3 sm:hidden">
        <Select value={valor} onValueChange={setValor}>
          <SelectTrigger className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {items.map((i) => (
              <SelectItem key={i.valor} value={i.valor}>
                {i.label}
                {i.alerta ? ' •' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Escritorio: pestañas */}
      <TabsList className="hidden sm:inline-flex">
        {items.map((i) => (
          <TabsTrigger key={i.valor} value={i.valor}>
            {i.label}
            {i.alerta && <span className="ml-1 text-destructive">•</span>}
          </TabsTrigger>
        ))}
      </TabsList>

      {children}
    </Tabs>
  )
}
