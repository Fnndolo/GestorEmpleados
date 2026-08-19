import { prisma } from '@/lib/db'
import { formatFechaLarga } from '@/lib/fechas'
import { SubidaAspirante } from './subida-aspirante'

export const metadata = { title: 'Subir acuerdo firmado' }

/**
 * Página PÚBLICA (fuera del área autenticada): el aspirante llega por el enlace
 * que recibió por correo y solo puede subir su acuerdo firmado.
 *
 * Se muestra lo mínimo para que sepa que está en el sitio correcto —su nombre, el
 * cargo y las fechas—. Nada de datos de otros, ni navegación al resto de la app.
 */
export default async function FirmarAcuerdoPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const a = await prisma.acuerdoEvaluacion.findUnique({
    where: { tokenSubida: token },
    select: {
      numero: true, nombres: true, apellidos: true, cargoEvaluado: true,
      fechaInicio: true, fechaFin: true, tokenExpiraEn: true, firmadoEn: true,
    },
  })

  const invalido = !a
  const caducado = !!a?.tokenExpiraEn && a.tokenExpiraEn < new Date()
  // Que la empresa ya haya decidido no impide subir el firmado: son cosas
  // distintas, y el documento firmado interesa igual. Ver acciones.ts.

  return (
    <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-xl font-semibold">Acuerdo de evaluación previa</h1>
        {a && !invalido && (
          <p className="mt-1 text-sm text-muted-foreground">
            {a.nombres} {a.apellidos} · {a.cargoEvaluado} · {a.numero}
          </p>
        )}
      </div>

      {invalido ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Este enlace no es válido. Verifica que lo copiaste completo o pide uno nuevo a la empresa.
        </p>
      ) : caducado ? (
        <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          Este enlace ya caducó. Pide uno nuevo a la empresa.
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            Evaluación del {formatFechaLarga(a!.fechaInicio)} al {formatFechaLarga(a!.fechaFin)}.
            Sube aquí el acuerdo que recibiste por correo, ya firmado y escaneado en PDF.
          </p>
          <SubidaAspirante token={token} yaSubido={Boolean(a!.firmadoEn)} />
        </>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Este acuerdo no constituye contrato de trabajo ni precontrato laboral.
      </p>
    </main>
  )
}
