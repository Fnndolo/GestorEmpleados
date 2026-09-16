'use client'

import { useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { signIn } from '@/lib/auth-client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { InputPassword } from '@/components/ui/input-password'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { LogIn } from 'lucide-react'

export function LoginForm() {
  const params = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(
    params.get('error') === 'cuenta-inactiva'
      ? 'Tu cuenta está inactiva. Contacta al administrador.'
      : null,
  )

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setCargando(true)
    try {
      const { error: err } = await signIn.email({ email, password })
      if (err) {
        setError(
          err.code === 'INVALID_EMAIL_OR_PASSWORD'
            ? 'Correo o contraseña incorrectos.'
            : 'No fue posible iniciar sesión. Intenta de nuevo.',
        )
        setCargando(false)
        return
      }
      // Navegación dura para re-establecer la sesión de forma confiable
      window.location.assign('/inicio')
    } catch {
      setError('No fue posible iniciar sesión. Intenta de nuevo.')
      setCargando(false)
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor="email">Correo electrónico</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="nombre@kupocell.com"
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Contraseña</Label>
        <InputPassword
          id="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </div>
      <Button type="submit" className="w-full" disabled={cargando}>
        {cargando ? <Spinner /> : <LogIn className="size-4" />}
        Iniciar sesión
      </Button>
    </form>
  )
}
