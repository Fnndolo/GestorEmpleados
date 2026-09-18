import Link from 'next/link'
import { requerirPermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { ArrowLeft } from 'lucide-react'
import { formatFechaCorta } from '@/lib/fechas'
import { CanalEtico } from './canal-etico'
import { MisHabeas } from './mis-habeas'

export const metadata = { title: 'Canal ético y habeas data · Smart Gadgets RH' }

const TITULO = { 'anti-acoso': 'Línea ética', 'habeas-data': 'Habeas data', ambos: 'Línea ética y habeas data' } as const

export default async function AutoservicioJuridicaPage({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  const usuario = await requerirPermiso('autoservicio', 'VER')
  const { vista: vistaParam } = await searchParams
  const vista: 'anti-acoso' | 'habeas-data' | 'ambos' =
    vistaParam === 'anti-acoso' || vistaParam === 'habeas-data' ? vistaParam : 'ambos'

  // El reporte de la línea ética va a nombre de quien lo envía: el nombre sale
  // de su ficha (o del usuario, si no tiene ficha), nunca de un campo libre.
  const ficha = usuario.colaboradorId
    ? await prisma.colaborador.findUnique({ where: { id: usuario.colaboradorId }, select: { nombres: true, apellidos: true } })
    : null
  const remitente = ficha ? `${ficha.nombres} ${ficha.apellidos}` : usuario.nombre

  // La lista de solicitudes solo aplica a habeas data (la denuncia es confidencial y no se lista).
  const verHabeas = vista !== 'anti-acoso'
  const misHabeas = verHabeas && usuario.colaboradorId
    ? await prisma.consultaReclamoDatos.findMany({
        where: { colaboradorId: usuario.colaboradorId },
        orderBy: { fechaRadicacion: 'desc' },
        select: { id: true, tipo: true, estado: true, descripcion: true, fechaRadicacion: true, fechaLimite: true, respuesta: true, respondidaEn: true },
      })
    : []

  return (
    <div className="max-w-3xl">
      {/* Regreso arriba y sin párrafo: lo que es cada canal lo dice su tarjeta en una línea. */}
      <Link href="/autoservicio" className="mb-2 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> Volver
      </Link>
      <Encabezado enLinea titulo={TITULO[vista]} />

      <CanalEtico mostrar={vista} remitente={remitente} />

      {verHabeas && (
        <>
          <h2 className="mb-2 mt-6 text-[13px] font-bold">Mis solicitudes</h2>
          <MisHabeas
            items={misHabeas.map((h) => ({
              id: h.id, tipo: h.tipo, estado: h.estado, descripcion: h.descripcion,
              radicada: formatFechaCorta(h.fechaRadicacion),
              limite: h.fechaLimite ? formatFechaCorta(h.fechaLimite) : null,
              respuesta: h.respuesta, respondidaEn: h.respondidaEn ? formatFechaCorta(h.respondidaEn) : null,
            }))}
          />
        </>
      )}
    </div>
  )
}
