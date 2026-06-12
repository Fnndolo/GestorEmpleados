'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/lib/auth-client'
import { marcarPasswordCambiada } from './acciones'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Spinner } from '@/components/ui/spinner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { toast } from 'sonner'

export function CambiarPasswordForm({ obligatorio }: { obligatorio: boolean }) {
  const router = useRouter()
  const [actual, setActual] = useState('')
  const [nueva, setNueva] = useState('')
  const [confirmar, setConfirmar] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (nueva.length < 8) {
      setError('La nueva contraseña debe tener al menos 8 caracteres.')
      return
    }
    if (nueva !== confirmar) {
      setError('La confirmación no coincide con la nueva contraseña.')
      return
    }
    setCargando(true)
    const { error: err } = await authClient.changePassword({
      currentPassword: actual,
      newPassword: nueva,
      revokeOtherSessions: true,
    })
    if (err) {
      setError(
        err.code === 'INVALID_PASSWORD'
          ? 'La contraseña actual es incorrecta.'
          : 'No fue posible cambiar la contraseña.',
      )
      setCargando(false)
      return
    }
    await marcarPasswordCambiada()
    toast.success('Contraseña actualizada correctamente.')
    router.push('/inicio')
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-2">
        <Label htmlFor="actual">Contraseña actual</Label>
        <Input
          id="actual"
          type="password"
          autoComplete="current-password"
          required
          value={actual}
          onChange={(e) => setActual(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="nueva">Nueva contraseña</Label>
        <Input
          id="nueva"
          type="password"
          autoComplete="new-password"
          required
          value={nueva}
          onChange={(e) => setNueva(e.target.value)}
        />
        <p className="text-xs text-muted-foreground">Mínimo 8 caracteres.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirmar">Confirmar nueva contraseña</Label>
        <Input
          id="confirmar"
          type="password"
          autoComplete="new-password"
          required
          value={confirmar}
          onChange={(e) => setConfirmar(e.target.value)}
        />
      </div>
      <Button type="submit" className="w-full" disabled={cargando}>
        {cargando && <Spinner />}
        {obligatorio ? 'Guardar y continuar' : 'Guardar cambios'}
      </Button>
    </form>
  )
}
