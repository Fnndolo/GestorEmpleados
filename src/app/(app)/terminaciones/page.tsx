import Link from 'next/link'
import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { UserMinus, ChevronRight } from 'lucide-react'
import { formatFechaCorta } from '@/lib/fechas'
import { NuevaTerminacion } from './nueva-terminacion'

export const metadata = { title: 'Terminaciones · Smart Gadgets RH' }

const TIPO: Record<string, string> = {
  RENUNCIA_VOLUNTARIA: 'Renuncia voluntaria', SIN_JUSTA_CAUSA: 'Sin justa causa', CON_JUSTA_CAUSA: 'Con justa causa',
  TERMINACION_ANTICIPADA: 'Terminación anticipada', MUTUO_ACUERDO: 'Mutuo acuerdo', VENCIMIENTO_PLAZO: 'Vencimiento del plazo',
  PERIODO_PRUEBA: 'Periodo de prueba', FIN_OPS: 'Fin OPS',
}
const ESTADO: Record<string, string> = { EN_PROCESO: 'En proceso', LIQUIDADA: 'Liquidada', CERRADA: 'Cerrada' }

export default async function TerminacionesPage() {
  const usuario = await requerirPermiso('terminaciones', 'VER')
  const puedeCrear = tienePermiso(usuario, 'terminaciones', 'CREAR')

  const terminaciones = await prisma.terminacion.findMany({
    include: { colaborador: { select: { nombres: true, apellidos: true } }, pazYSalvo: { include: { items: true } } },
    orderBy: { creadoEn: 'desc' },
    take: 100,
  })

  return (
    <div className="mx-auto max-w-4xl">
      <Encabezado
        titulo="Terminaciones y desvinculaciones"
        descripcion="Registro de retiros, liquidación definitiva y paz y salvo por área."
        acciones={puedeCrear && <NuevaTerminacion />}
      />
      {terminaciones.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
          <UserMinus className="size-8" /><p>No hay terminaciones registradas.</p>
        </CardContent></Card>
      ) : (
        <Card><CardContent className="p-0 divide-y">
          {terminaciones.map((t) => {
            const pendientes = t.pazYSalvo?.items.filter((i) => !i.cumplido).length ?? 0
            return (
              <Link key={t.id} href={`/terminaciones/${t.id}`} className="flex items-center gap-3 p-3 hover:bg-accent/40">
                <UserMinus className="size-5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{t.colaborador.nombres} {t.colaborador.apellidos}</p>
                  <p className="text-xs text-muted-foreground">{TIPO[t.tipo]} · {formatFechaCorta(t.fechaRetiro)}</p>
                </div>
                {pendientes > 0 && <Badge variant="secondary">{pendientes} paz y salvo</Badge>}
                <Badge variant={t.estado === 'CERRADA' ? 'default' : 'outline'}>{ESTADO[t.estado]}</Badge>
                <ChevronRight className="size-4 text-muted-foreground" />
              </Link>
            )
          })}
        </CardContent></Card>
      )}
    </div>
  )
}
