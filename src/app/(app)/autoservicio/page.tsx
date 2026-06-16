import Link from 'next/link'
import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { saldoVacaciones } from '@/server/vacaciones'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Palmtree, FileCheck, Inbox, Download, Gavel, Receipt } from 'lucide-react'
import { formatFechaCorta } from '@/lib/fechas'
import { NuevaSolicitud } from './nueva-solicitud'

export const metadata = { title: 'Autoservicio · Smart Gadgets RH' }

const TIPO_SOL: Record<string, string> = { VACACIONES: 'Vacaciones', PERMISO: 'Permiso', INCAPACIDAD: 'Incapacidad', CERTIFICACION_LABORAL: 'Certificación laboral', LICENCIA: 'Licencia', OTRA: 'Otra' }
const ESTADO_SOL: Record<string, string> = { PENDIENTE: 'Pendiente', EN_APROBACION: 'En aprobación', APROBADA: 'Aprobada', RECHAZADA: 'Rechazada', CANCELADA: 'Cancelada' }

export default async function AutoservicioPage() {
  const usuario = await requerirPermiso('autoservicio', 'VER')
  const puedeAprobar = tienePermiso(usuario, 'autoservicio', 'APROBAR')

  if (!usuario.colaboradorId) {
    return (
      <div className="mx-auto max-w-3xl">
        <Encabezado titulo="Autoservicio" />
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">
          Tu usuario no está vinculado a una ficha de colaborador. Contacta a Talento Humano.
        </CardContent></Card>
      </div>
    )
  }

  const [saldo, solicitudes, disciplinariosAbiertos, esContratista] = await Promise.all([
    saldoVacaciones(usuario.colaboradorId),
    prisma.solicitud.findMany({ where: { colaboradorId: usuario.colaboradorId }, orderBy: { creadoEn: 'desc' }, take: 20 }),
    prisma.procesoDisciplinario.count({ where: { colaboradorId: usuario.colaboradorId, cerrado: false } }),
    prisma.contratoOps.count({ where: { colaboradorId: usuario.colaboradorId, estado: 'ACTIVO' } }),
  ])

  return (
    <div className="mx-auto max-w-3xl">
      <Encabezado
        titulo="Mi autoservicio"
        descripcion="Solicita vacaciones, permisos y certificaciones. Todo pasa por aprobación de tu jefe inmediato y Talento Humano."
        acciones={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link href="/autoservicio/disciplinarios"><Gavel className="size-4" /> Disciplinarios{disciplinariosAbiertos > 0 && <Badge variant="destructive" className="ml-1">{disciplinariosAbiertos}</Badge>}</Link>
            </Button>
            {esContratista > 0 && (
              <Button variant="outline" size="sm" asChild>
                <Link href="/autoservicio/cuentas-cobro"><Receipt className="size-4" /> Cuentas de cobro</Link>
              </Button>
            )}
            {puedeAprobar && (
              <Button variant="outline" size="sm" asChild>
                <Link href="/autoservicio/aprobaciones"><Inbox className="size-4" /> Aprobaciones</Link>
              </Button>
            )}
          </div>
        }
      />

      {/* Saldo de vacaciones */}
      <div className="grid gap-3 sm:grid-cols-3 mb-6">
        <Card><CardContent className="flex items-center gap-3 py-4">
          <Palmtree className="size-6 text-emerald-600" />
          <div><p className="text-2xl font-semibold tabular-nums">{saldo.saldo}</p><p className="text-xs text-muted-foreground">Días disponibles</p></div>
        </CardContent></Card>
        <Card><CardContent className="py-4"><p className="text-xl font-semibold tabular-nums">{saldo.causadas}</p><p className="text-xs text-muted-foreground">Causadas</p></CardContent></Card>
        <Card><CardContent className="py-4"><p className="text-xl font-semibold tabular-nums">{saldo.disfrutadas}</p><p className="text-xs text-muted-foreground">Disfrutadas</p></CardContent></Card>
      </div>

      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-medium">Mis solicitudes</h2>
        <NuevaSolicitud />
      </div>

      {solicitudes.length === 0 ? (
        <Card><CardContent className="py-8 text-center text-sm text-muted-foreground">Aún no tienes solicitudes.</CardContent></Card>
      ) : (
        <Card><CardContent className="p-0 divide-y">
          {solicitudes.map((s) => {
            const certId = s.resultado?.startsWith('Certificación generada:') ? s.resultado.split(':')[1] : null
            return (
              <div key={s.id} className="flex items-center gap-3 p-3">
                <FileCheck className="size-5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm">{TIPO_SOL[s.tipo]}</p>
                  <p className="text-xs text-muted-foreground">{formatFechaCorta(s.creadoEn)}{s.resultado && !certId ? ` · ${s.resultado}` : ''}</p>
                </div>
                {certId && (
                  <Button size="sm" variant="outline" asChild>
                    <a href={`/api/documentos/${certId}`} target="_blank" rel="noreferrer"><Download className="size-4" /> PDF</a>
                  </Button>
                )}
                <Badge variant={s.estado === 'APROBADA' ? 'default' : s.estado === 'RECHAZADA' ? 'destructive' : 'secondary'}>{ESTADO_SOL[s.estado]}</Badge>
              </div>
            )
          })}
        </CardContent></Card>
      )}
    </div>
  )
}
