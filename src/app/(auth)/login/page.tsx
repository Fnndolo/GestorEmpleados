import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { obtenerSesion } from '@/server/sesion'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { LoginForm } from './login-form'
import { Logo } from '@/components/marca/logo'

export default async function LoginPage() {
  const usuario = await obtenerSesion()
  if (usuario) redirect('/inicio')

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Panel de marca (oculto en móvil) */}
      <div className="hidden lg:flex flex-col justify-between bg-gradient-to-br from-slate-900 via-slate-800 to-indigo-900 p-12 text-white">
        <Logo claro />
        <div className="space-y-4 max-w-md">
          <h2 className="text-3xl font-semibold leading-tight">
            Gestión integral del talento humano, jurídica y SST
          </h2>
          <p className="text-slate-300">
            Una sola plataforma para el ciclo completo del personal de KUPOCELL S.A.S.:
            colaboradores, contratación, nómina, novedades, cumplimiento legal y seguridad y
            salud en el trabajo. Con alertas de vencimiento, auditoría y separación por sede.
          </p>
        </div>
        <p className="text-sm text-slate-400">KUPOCELL S.A.S. · Smart Gadgets</p>
      </div>

      {/* Formulario */}
      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md border-none shadow-none lg:border lg:shadow-sm">
          <CardHeader className="space-y-1">
            <div className="lg:hidden mb-4">
              <Logo />
            </div>
            <CardTitle className="text-2xl">Iniciar sesión</CardTitle>
            <CardDescription>Ingresa con las credenciales que te asignó el administrador.</CardDescription>
          </CardHeader>
          <CardContent>
            <Suspense>
              <LoginForm />
            </Suspense>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
