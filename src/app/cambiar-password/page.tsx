import { redirect } from 'next/navigation'
import { obtenerSesion } from '@/server/sesion'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Logo } from '@/components/marca/logo'
import { CambiarPasswordForm } from './form'

export default async function CambiarPasswordPage() {
  const usuario = await obtenerSesion()
  if (!usuario) redirect('/login')

  const obligatorio = usuario.debeCambiarPassword

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-muted/30">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3">
          <Logo />
          <div>
            <CardTitle>Cambiar contraseña</CardTitle>
            <CardDescription>
              {obligatorio
                ? 'Por seguridad, define una contraseña nueva antes de continuar.'
                : 'Actualiza tu contraseña de acceso.'}
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <CambiarPasswordForm obligatorio={obligatorio} />
        </CardContent>
      </Card>
    </div>
  )
}
