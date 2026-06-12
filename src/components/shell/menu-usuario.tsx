'use client'

import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { LogOut, KeyRound, ChevronsUpDown } from 'lucide-react'
import { signOut } from '@/lib/auth-client'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

function iniciales(nombre: string) {
  return nombre
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

export function MenuUsuario({
  nombre,
  email,
  rol,
}: {
  nombre: string
  email: string
  rol: string
}) {
  const router = useRouter()

  async function salir() {
    await signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="flex w-full items-center gap-2 rounded-md p-2 text-left hover:bg-accent transition-colors">
        <Avatar className="size-8">
          <AvatarFallback className="text-xs">{iniciales(nombre)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{nombre}</p>
          <p className="truncate text-xs text-muted-foreground">{rol}</p>
        </div>
        <ChevronsUpDown className="size-4 text-muted-foreground shrink-0" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="font-normal">
          <p className="text-sm font-medium">{nombre}</p>
          <p className="text-xs text-muted-foreground truncate">{email}</p>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/cambiar-password">
            <KeyRound className="size-4" />
            Cambiar contraseña
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={salir} variant="destructive">
          <LogOut className="size-4" />
          Cerrar sesión
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
