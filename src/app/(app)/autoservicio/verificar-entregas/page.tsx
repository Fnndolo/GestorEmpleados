import { requerirPermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { ClipboardCheck } from 'lucide-react'
import { formatFechaCorta } from '@/lib/fechas'
import { urlFoto } from '@/lib/foto'
import { EntregasPorVerificar, type EntregaItem } from './entregas'

export const metadata = { title: 'Verificar entregas · Smart Gadgets RH' }

/**
 * Para los responsables de un área del paz y salvo: la entrega de quien se
 * retira, área por área, para marcarla verificada. Primero lo pendiente; lo ya
 * verificado de los últimos retiros queda debajo, por si hay que corregir.
 */
export default async function VerificarEntregasPage() {
  const usuario = await requerirPermiso('autoservicio', 'VER')
  const items = await prisma.pazYSalvoItem.findMany({
    where: { responsableId: usuario.id, pazYSalvo: { terminacion: { estado: { not: 'CERRADA' } } } },
    include: {
      pazYSalvo: {
        select: {
          enviadoFirmaEn: true,
          terminacion: { select: { fechaRetiro: true, colaborador: { select: { id: true, nombres: true, apellidos: true, fotoPath: true } } } },
        },
      },
    },
    orderBy: { id: 'desc' },
    take: 100,
  })

  const lista: EntregaItem[] = items.map((i) => {
    const c = i.pazYSalvo.terminacion.colaborador
    return {
      id: i.id, area: i.area, concepto: i.concepto, alerta: i.cumplido ? null : i.observacion, cumplido: i.cumplido,
      bloqueado: !!i.pazYSalvo.enviadoFirmaEn,
      colaborador: `${c.nombres} ${c.apellidos}`, fotoUrl: urlFoto(c.id, c.fotoPath, true),
      retiro: formatFechaCorta(i.pazYSalvo.terminacion.fechaRetiro),
      verificadoEn: i.verificadoEn ? formatFechaCorta(i.verificadoEn) : null,
    }
  })

  return (
    <div className="max-w-3xl">
      <Encabezado volver enLinea titulo="Verificar entregas" />
      {lista.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
          <ClipboardCheck className="size-8" /><p>No tienes entregas por verificar.</p>
        </CardContent></Card>
      ) : (
        <EntregasPorVerificar items={lista} />
      )}
    </div>
  )
}
