import Link from 'next/link'
import { requerirPermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { formatFechaCorta } from '@/lib/fechas'
import { CanalEtico } from './canal-etico'

export const metadata = { title: 'Canal ético y habeas data · Smart Gadgets RH' }

const ENCABEZADO = {
  'anti-acoso': {
    titulo: 'Canal anti-acoso',
    descripcion: 'Reporta una situación de acoso laboral o sexual de forma confidencial (Ley 2466 de 2025).',
  },
  'habeas-data': {
    titulo: 'Habeas data',
    descripcion: 'Ejerce tus derechos sobre tus datos personales: consulta o reclamo (Ley 1581 de 2012).',
  },
  ambos: {
    titulo: 'Canal ético y habeas data',
    descripcion: 'Reporta una situación de acoso de forma confidencial, o ejerce tus derechos sobre tus datos personales.',
  },
} as const

export default async function AutoservicioJuridicaPage({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  const usuario = await requerirPermiso('autoservicio', 'VER')
  const { vista: vistaParam } = await searchParams
  const vista: 'anti-acoso' | 'habeas-data' | 'ambos' =
    vistaParam === 'anti-acoso' || vistaParam === 'habeas-data' ? vistaParam : 'ambos'
  const enc = ENCABEZADO[vista]

  // La lista de solicitudes solo aplica a habeas data (la denuncia es confidencial y no se lista).
  const verHabeas = vista !== 'anti-acoso'
  const misHabeas = verHabeas && usuario.colaboradorId
    ? await prisma.consultaReclamoDatos.findMany({
        where: { colaboradorId: usuario.colaboradorId },
        orderBy: { fechaRadicacion: 'desc' },
        select: { id: true, tipo: true, estado: true, fechaRadicacion: true, fechaLimite: true },
      })
    : []

  return (
    <div className="max-w-3xl">
      <Encabezado
        titulo={enc.titulo}
        descripcion={enc.descripcion}
        acciones={
          <Button variant="outline" size="sm" asChild>
            <Link href="/autoservicio"><ArrowLeft className="size-4" /> Volver</Link>
          </Button>
        }
      />

      <CanalEtico mostrar={vista} />

      {verHabeas && (
        <>
          <h2 className="mb-3 mt-8 text-lg font-medium">Mis solicitudes de habeas data</h2>
          {misHabeas.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Aún no has radicado consultas ni reclamos.</CardContent></Card>
          ) : (
            <Card><CardContent className="p-0 divide-y">
              {misHabeas.map((h) => (
                <div key={h.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <div>
                    <p className="font-medium">{h.tipo === 'CONSULTA' ? 'Consulta' : 'Reclamo'}</p>
                    <p className="text-xs text-muted-foreground">
                      Radicada {formatFechaCorta(h.fechaRadicacion)}
                      {h.fechaLimite ? ` · respuesta antes del ${formatFechaCorta(h.fechaLimite)}` : ''}
                    </p>
                  </div>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">{h.estado === 'ABIERTO' ? 'En trámite' : 'Respondida'}</span>
                </div>
              ))}
            </CardContent></Card>
          )}
        </>
      )}
    </div>
  )
}
