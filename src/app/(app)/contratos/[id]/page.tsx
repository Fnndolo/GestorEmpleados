import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import { VisorPdf } from '@/components/documentos/visor-pdf'
import { AdjuntarDocumento } from '@/components/documentos/adjuntar-documento'
import { FileText, TriangleAlert } from 'lucide-react'
import { formatFechaLarga, formatFechaCorta, formatFechaISO, duracionContrato } from '@/lib/fechas'
import { GestorDocumentos } from '@/components/documentos/gestor-documentos'
import { fmtCOP } from '@/lib/moneda'
import { TIPO_VINCULO, MODALIDAD_TRABAJO } from '@/lib/etiquetas'
import { AccionesContrato } from './acciones-cliente'
import { discrepanciaVinculo, type TipoContratoLaboral, type TipoVinculo } from '@/lib/vinculo-contrato'
import { FirmasLaboral } from './firmas-laboral'

export const metadata = { title: 'Contrato · Smart Gadgets RH' }

const TIPO_CONTRATO: Record<string, string> = {
  TERMINO_FIJO: 'Término fijo', TERMINO_INDEFINIDO: 'Término indefinido', OBRA_LABOR: 'Obra o labor',
  APRENDIZAJE_SENA: 'Aprendizaje SENA', PRACTICA: 'Práctica',
}
const ESTADO: Record<string, string> = { BORRADOR: 'Borrador', ACTIVO: 'Activo', SUSPENDIDO: 'Suspendido', TERMINADO: 'Terminado' }
const CAUSA_SUSP: Record<string, string> = {
  SANCION_DISCIPLINARIA: 'Sanción disciplinaria', LICENCIA_NO_REMUNERADA: 'Licencia no remunerada',
  FUERZA_MAYOR: 'Fuerza mayor', OTRO: 'Otro',
}

export default async function ContratoDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const usuario = await requerirPermiso('contratos', 'VER')
  const puedeEditar = tienePermiso(usuario, 'contratos', 'EDITAR')

  const c = await prisma.contrato.findUnique({
    where: { id },
    include: {
      colaborador: true, cargo: true, sede: { include: { ciudad: true } },
      prorrogas: { orderBy: { numero: 'asc' } },
      otrosis: { orderBy: { numero: 'asc' } },
      suspensiones: { orderBy: { fechaInicio: 'desc' } },
    },
  })
  if (!c) notFound()

  const [cargos, sedes, documentos, empresaCfg, evidencias, anexos] = await Promise.all([
    prisma.cargo.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } }),
    prisma.sede.findMany({ where: { activa: true }, include: { ciudad: true }, orderBy: { nombre: 'asc' } }),
    prisma.documento.findMany({
      where: { entidadTipo: 'Contrato', entidadId: id },
      orderBy: { creadoEn: 'desc' },
      select: { id: true, nombre: true },
    }),
    prisma.configuracionEmpresa.findFirst({ select: { representanteLegal: true } }),
    prisma.evidenciaFirmaContrato.findMany({ where: { contratoId: id }, orderBy: { firmadoEn: 'asc' } }),
    // Anexos: entidad propia ('ContratoAnexo') para que el gestor —que permite borrar—
    // nunca liste el PDF del contrato ni la autorización.
    prisma.documento.findMany({
      where: { entidadTipo: 'ContratoAnexo', entidadId: id },
      include: { tipoDocumento: true },
      orderBy: { creadoEn: 'desc' },
    }),
  ])

  // Último PDF de cada tipo (el firmado si existe, si no el original).
  const docContrato = documentos.find((d) => !d.nombre.startsWith('Autorización'))
  const docAutorizacion = documentos.find((d) => d.nombre.startsWith('Autorización'))

  // Si el contrato y la ficha se contradicen hay que decirlo aquí: las acciones
  // disponibles salen del tipo del contrato y los trámites del autoservicio del
  // vínculo de la ficha, así que la contradicción se nota como cosas que
  // "faltan" sin explicación (p. ej. un fijo sin botón de prórroga).
  const discrepancia = discrepanciaVinculo(
    c.tipo as TipoContratoLaboral,
    c.colaborador.tipoVinculo as TipoVinculo,
  )

  return (
    <div className="max-w-6xl">
      <Encabezado titulo={`Contrato ${c.numero}`} descripcion={`${c.colaborador.nombres} ${c.colaborador.apellidos}`} />

      {discrepancia && (
        <Card className="mb-4 border-amber-500/40 bg-amber-500/5">
          <CardContent className="flex items-start gap-2 py-3">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="min-w-0 text-xs text-amber-800 dark:text-amber-300">
              <p className="font-medium">El tipo del contrato no coincide con la ficha</p>
              <p className="mt-0.5">{discrepancia}</p>
              <Link
                href={`/colaboradores/${c.colaboradorId}/editar`}
                className="mt-1 inline-block font-medium underline underline-offset-2"
              >
                Abrir la ficha del colaborador
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      <Card className="mb-4"><CardContent className="py-4">
        <div className="flex items-center gap-2 mb-3">
          <Badge variant={c.estado === 'ACTIVO' ? 'default' : c.estado === 'SUSPENDIDO' ? 'destructive' : 'secondary'}>{ESTADO[c.estado]}</Badge>
          <Badge variant="outline">{TIPO_CONTRATO[c.tipo]}</Badge>
        </div>
        <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
          <Dato k="Cargo" v={c.cargo?.nombre ?? '—'} />
          <Dato k="Sede" v={`${c.sede.nombre} · ${c.sede.ciudad.nombre}`} />
          <Dato k="Salario base" v={fmtCOP(Number(c.salarioBase))} />
          <Dato k="Modalidad" v={MODALIDAD_TRABAJO[c.modalidadTrabajo]} />
          <Dato k="Fecha de inicio" v={formatFechaLarga(c.fechaInicio)} />
          <Dato k="Fecha de fin" v={c.fechaFin ? formatFechaLarga(c.fechaFin) : 'Indefinida'} />
          <Dato k="Duración" v={duracionContrato(c.fechaInicio, c.fechaFin)} />
          {c.periodoPruebaFin && <Dato k="Fin periodo de prueba" v={formatFechaLarga(c.periodoPruebaFin)} />}
          {c.objetoObraLabor && <Dato k="Objeto obra/labor" v={c.objetoObraLabor} full />}
        </dl>
        <p className="mt-3">
          <Link href={`/colaboradores/${c.colaboradorId}`} className="text-sm text-primary hover:underline">Ver ficha del colaborador →</Link>
        </p>
      </CardContent></Card>

      {/* Documento del contrato y firmas digitales */}
      <Card className="mb-4"><CardContent className="py-4">
        {c.origenPdf === 'SUBIDO' ? (
          <>
            <h3 className="text-sm font-medium mb-3">Documento del contrato</h3>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary">Contrato subido</Badge>
              <span className="text-sm text-muted-foreground">Firmado en físico (documento externo al sistema).</span>
            </div>
            {docContrato ? (
              <VisorPdf documentoId={docContrato.id} titulo={`Contrato ${c.numero}`} className={`mt-3 ${buttonVariants({ variant: 'outline', size: 'sm' })}`}>
                <FileText className="size-4" /> Ver documento
              </VisorPdf>
            ) : (
              <p className="mt-3 text-sm text-muted-foreground">No hay PDF adjunto para este contrato.</p>
            )}
          </>
        ) : (
        <>
        <h3 className="text-sm font-medium mb-3">Documento y firmas</h3>
        <FirmasLaboral
          contratoId={c.id}
          numero={c.numero}
          tieneDocumento={!!c.contenidoPdf}
          documentoId={docContrato?.id ?? null}
          autorizacionId={docAutorizacion?.id ?? null}
          puedeFirmar={puedeEditar}
          empleador={{
            nombre: empresaCfg?.representanteLegal ?? '',
            firmado: !!c.firmaEmpleadorPath,
            fecha: c.firmaEmpleadorFecha ? formatFechaCorta(c.firmaEmpleadorFecha) : null,
          }}
          empleado={{
            nombre: `${c.colaborador.nombres} ${c.colaborador.apellidos}`,
            firmado: !!c.firmaEmpleadoPath,
            fecha: c.firmaEmpleadoFecha ? formatFechaCorta(c.firmaEmpleadoFecha) : null,
          }}
        />
        {evidencias.length > 0 && (
          <div className="mt-4 border-t pt-3">
            <h4 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">Rastro de firma</h4>
            <ul className="space-y-1">
              {evidencias.map((e) => (
                <li key={e.id} className="text-xs text-muted-foreground">
                  {e.rol === 'EMPLEADO' ? 'Empleado' : 'Empleador'} · {formatFechaCorta(e.firmadoEn)}
                  {e.userEmail ? ` · ${e.userEmail}` : ''}{e.ip ? ` · IP ${e.ip}` : ''} · {e.metodoAuth === 'CODIGO_EMAIL' ? 'código al correo' : 'sesión'}
                </li>
              ))}
            </ul>
          </div>
        )}
        </>
        )}
      </CardContent></Card>

      {/* Anexos del contrato: otrosíes, prórrogas y soportes escaneados. Van en su propia
          entidad para no mezclarse con el PDF del contrato (que no debe poder borrarse aquí). */}
      <Card className="mb-4"><CardContent className="py-4">
        <h3 className="text-sm font-medium">Anexos del contrato</h3>
        <p className="mb-3 mt-1 text-xs text-muted-foreground">
          Otrosíes, prórrogas y soportes que acompañan a este contrato. El documento del contrato
          se gestiona arriba.
        </p>
        <GestorDocumentos
          entidadTipo="ContratoAnexo"
          entidadId={c.id}
          sedeId={c.sedeId}
          documentos={anexos.map((d) => ({
            id: d.id, nombre: d.nombre, tipoDocumentoNombre: d.tipoDocumento?.nombre ?? null,
            mimeType: d.mimeType, tamanoBytes: d.tamanoBytes,
            fechaVencimiento: formatFechaISO(d.fechaVencimiento) || null,
            creadoEn: d.creadoEn.toISOString(),
          }))}
          tiposDocumento={[]}
          semaforo={[]}
          puedeEditar={puedeEditar}
        />
      </CardContent></Card>

      {/* Prórrogas */}
      {c.prorrogas.length > 0 && (
        <Card className="mb-4"><CardContent className="py-4">
          <h3 className="text-sm font-medium mb-2">Prórrogas</h3>
          <ul className="space-y-1.5">
            {c.prorrogas.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
                <span>Prórroga {p.numero}</span>
                <span className="flex-1 text-muted-foreground">{formatFechaCorta(p.fechaInicio)} — {formatFechaCorta(p.fechaFin)}</span>
                {/* El sistema no genera el PDF de la prórroga: se redacta fuera,
                    se firma y se adjunta aquí. */}
                {p.documentoId && (
                  <VisorPdf documentoId={p.documentoId} titulo={`Prórroga ${p.numero}`} className="text-xs text-primary hover:underline">
                    Ver PDF
                  </VisorPdf>
                )}
                {puedeEditar && (
                  <AdjuntarDocumento destino="prorroga" id={p.id} tieneDocumento={Boolean(p.documentoId)} etiqueta={p.documentoId ? 'Reemplazar' : 'Adjuntar PDF'} variante="ghost" />
                )}
              </li>
            ))}
          </ul>
        </CardContent></Card>
      )}

      {/* Otrosí */}
      {c.otrosis.length > 0 && (
        <Card className="mb-4"><CardContent className="py-4">
          <h3 className="text-sm font-medium mb-2">Otrosí y modificaciones</h3>
          <ul className="space-y-2">
            {c.otrosis.map((o) => (
              <li key={o.id} className="text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">Otrosí {o.numero}</span>
                  <span className="flex-1 text-muted-foreground">{formatFechaCorta(o.fecha)}</span>
                  {o.documentoId && (
                    <VisorPdf documentoId={o.documentoId} titulo={`Otrosí ${o.numero}`} className="text-xs text-primary hover:underline">
                      Ver PDF
                    </VisorPdf>
                  )}
                  {puedeEditar && (
                    <AdjuntarDocumento destino="otrosi" id={o.id} tieneDocumento={Boolean(o.documentoId)} etiqueta={o.documentoId ? 'Reemplazar' : 'Adjuntar PDF'} variante="ghost" />
                  )}
                </div>
                <p className="text-muted-foreground">{o.descripcion}</p>
              </li>
            ))}
          </ul>
        </CardContent></Card>
      )}

      {/* Suspensiones */}
      {c.suspensiones.length > 0 && (
        <Card className="mb-4"><CardContent className="py-4">
          <h3 className="text-sm font-medium mb-2">Suspensiones</h3>
          <ul className="space-y-1.5">
            {c.suspensiones.map((s) => (
              <li key={s.id} className="text-sm flex justify-between">
                <span>{CAUSA_SUSP[s.causa]}</span>
                <span className="text-muted-foreground">{formatFechaCorta(s.fechaInicio)}{s.fechaFin ? ` — ${formatFechaCorta(s.fechaFin)}` : ''}</span>
              </li>
            ))}
          </ul>
        </CardContent></Card>
      )}

      {puedeEditar && (
        <AccionesContrato
          contratoId={c.id}
          colaboradorId={c.colaboradorId}
          tipo={c.tipo}
          estado={c.estado}
          cargos={cargos.map((x) => ({ id: x.id, nombre: x.nombre }))}
          sedes={sedes.map((x) => ({ id: x.id, nombre: x.nombre, ciudad: x.ciudad.nombre }))}
        />
      )}
    </div>
  )
}

function Dato({ k, v, full }: { k: string; v: React.ReactNode; full?: boolean }) {
  return (
    <div className={`flex flex-col ${full ? 'sm:col-span-2' : ''}`}>
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className="text-sm">{v}</dd>
    </div>
  )
}
