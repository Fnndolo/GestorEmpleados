'use client'

import Link from 'next/link'
import { Bell } from 'lucide-react'
import { Button } from '@/components/ui/button'

/**
 * Campana de notificaciones. En F3 se le conecta el contador en vivo
 * (polling cada 60 s) y un panel desplegable con las notificaciones in-app.
 */
export function Campana() {
  return (
    <Button variant="ghost" size="icon" asChild aria-label="Notificaciones">
      <Link href="/vencimientos">
        <Bell className="size-5" />
      </Link>
    </Button>
  )
}
