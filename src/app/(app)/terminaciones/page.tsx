import Link from 'next/link'
import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { UserMinus, ChevronRight, DoorOpen, FileText } from 'lucide-react'
import { buttonVariants } from '@/components/ui/button'
import { VisorPdf } from '@/components/documentos/visor-pdf'
import { formatFechaISO } from '@/lib/fechas'
import { Pill, AvatarColaborador } from '@/components/ui-kit'
import { formatFechaCorta } from '@/lib/fechas'
import { urlFoto } from '@/lib/foto'
import { NuevaTerminacion } from './nueva-terminacion'
import { DevolverRenuncia } from './devolver-renuncia'

export const metadata = { title: 'Terminaciones · Smart Gadgets RH' }

const TIPO: Record<string, string> = {
  RENUNCIA_VOLUNTARIA: 'Renuncia voluntaria', SIN_JUSTA_CAUSA: 'Sin justa causa', CON_JUSTA_CAUSA: 'Con justa causa',
  TERMINACION_ANTICIPADA: 'Terminación anticipada', MUTUO_ACUERDO: 'Mutuo acuerdo', VENCIMIENTO_PLAZO: 'Vencimiento del plazo',
  PERIODO_PRUEBA: 'Periodo de prueba', FIN_OPS: 'Fin OPS',
}
const ESTADO: Record<string, string> = { EN_PROCESO: 'En proceso', LIQUIDADA: 'Liquidada', CERRADA: 'Cerrada' }

export default async function TerminacionesPage({
  searchParams,
}: {
  searchParams: Promise<{ colaborador?: string; renuncia?: string }>
}) {
  const { colaborador, renuncia: renunciaId } = await searchParams
  const usuario = await requerirPermiso('terminaciones', 'VER')
  const puedeCrear = tienePermiso(usuario, 'terminaciones', 'CREAR')

  const [terminaciones, renuncias] = await Promise.all([
    prisma.terminacion.findMany({
      include: { colaborador: { select: { id: true, nombres: true, apellidos: true, fotoPath: true } }, pazYSalvo: { include: { items: true } } },
      orderBy: { creadoEn: 'desc' },
      take: 100,
    }),
    // Renuncias presentadas en la app que esperan que Talento Humano las acepte.
    prisma.renuncia.findMany({
      where: { estado: 'PRESENTADA' },
      include: { colaborador: { select: { id: true, nombres: true, apellidos: true, fotoPath: true } } },
      orderBy: { creadoEn: 'asc' },
    }),
  ])
  const aAceptar = renunciaId ? renuncias.find((r) => r.id === renunciaId) : null

  return (
    <div className="max-w-6xl">
      <Encabezado
        titulo="Terminaciones y desvinculaciones"
        acciones={puedeCrear && (
          <NuevaTerminacion
            key={aAceptar?.id ?? 'nueva'}
            colaboradorInicial={colaborador}
            renuncia={aAceptar ? {
              id: aAceptar.id, colaboradorId: aAceptar.colaboradorId, nombre: `${aAceptar.colaborador.nombres} ${aAceptar.colaborador.apellidos}`,
              fechaRetiro: formatFechaISO(aAceptar.fechaRetiro), motivo: aAceptar.motivo ?? '',
            } : null}
          />
        )}
        volver
      />

      {renuncias.length > 0 && (
        <section className="mb-5">
          <h2 className="mb-2 flex items-center gap-1.5 text-[13px] font-bold"><DoorOpen className="size-4" /> Renuncias por aceptar</h2>
          <Card className="py-0"><CardContent className="divide-y p-0">
            {renuncias.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 p-3">
                <AvatarColaborador nombre={`${r.colaborador.nombres} ${r.colaborador.apellidos}`} fotoUrl={urlFoto(r.colaborador.id, r.colaborador.fotoPath, true)} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{r.colaborador.nombres} {r.colaborador.apellidos}</p>
                  <p className="truncate text-xs text-muted-foreground">Último día {formatFechaCorta(r.fechaRetiro)}{r.motivo ? ` · ${r.motivo}` : ''}</p>
                </div>
                <div className="flex items-center gap-1.5">
                  {r.documentoId && (
                    <VisorPdf documentoId={r.documentoId} titulo="Carta de renuncia" className={buttonVariants({ size: 'sm', variant: 'outline' }) + ' gap-1.5'}>
                      <FileText className="size-3.5" /> Carta
                    </VisorPdf>
                  )}
                  {puedeCrear && (
                    <>
                      <DevolverRenuncia renunciaId={r.id} nombre={`${r.colaborador.nombres} ${r.colaborador.apellidos}`} />
                      <Link href={`/terminaciones?renuncia=${r.id}`} className={buttonVariants({ size: 'sm' })}>Aceptar</Link>
                    </>
                  )}
                </div>
              </div>
            ))}
          </CardContent></Card>
        </section>
      )}
      {terminaciones.length === 0 ? (
        <Card><CardContent className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
          <UserMinus className="size-8" /><p>No hay terminaciones registradas.</p>
        </CardContent></Card>
      ) : (
        <Card><CardContent className="p-0 divide-y">
          {terminaciones.map((t) => {
            const pendientes = t.pazYSalvo?.items.filter((i) => !i.cumplido).length ?? 0
            return (
              <Link key={t.id} href={`/terminaciones/${t.id}`} className="flex flex-wrap items-center gap-3 p-3 transition-colors hover:bg-accent/40">
                <AvatarColaborador
                  nombre={`${t.colaborador.nombres} ${t.colaborador.apellidos}`}
                  fotoUrl={urlFoto(t.colaborador.id, t.colaborador.fotoPath, true)}
                />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.colaborador.nombres} {t.colaborador.apellidos}</p>
                  <p className="text-xs text-muted-foreground">{TIPO[t.tipo]} · {formatFechaCorta(t.fechaRetiro)}</p>
                </div>
                {pendientes > 0 && <Pill tone="warn">{pendientes} paz y salvo</Pill>}
                <Pill tone={t.estado === 'CERRADA' ? 'ok' : t.estado === 'LIQUIDADA' ? 'info' : 'warn'}>{ESTADO[t.estado]}</Pill>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
              </Link>
            )
          })}
        </CardContent></Card>
      )}
    </div>
  )
}
