import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Pill } from '@/components/ui-kit'
import { AdjuntarDocumento } from '@/components/documentos/adjuntar-documento'
import { FileText, ShieldCheck, TriangleAlert, UserRound, CalendarPlus, FilePen, CirclePause } from 'lucide-react'
import { formatFechaCorta, duracionContrato, hoyBogota } from '@/lib/fechas'
import { FilaDocumento, VerDocumento } from '@/components/contratos/fila-documento'
import { FilaAnexo } from '@/components/contratos/fila-anexo'
import { fmtCOP } from '@/lib/moneda'
import { MODALIDAD_TRABAJO } from '@/lib/etiquetas'
import { AccionesContrato } from './acciones-cliente'
import { discrepanciaVinculo, type TipoContratoLaboral, type TipoVinculo } from '@/lib/vinculo-contrato'
import { EdicionContrato } from './edicion-contrato'
import { DocumentoVersiones, type FirmaParte } from '@/components/contratos/documento-versiones'
import { FirmarEmpresa } from '@/components/contratos/firmar-empresa'
import { GENERAR_CONTRATOS_DESDE_PLANTILLA } from '@/lib/contratos-config'
import { CorregirPosicionFirma } from '@/components/contratos/corregir-posicion-firma'
import { METODO_CORRECCION_POSICION } from '@/server/contratos-estampar'
import { resumenOtrosi, ETIQUETA_CAMBIO_OTROSI, type ValoresOtrosi, type TipoCambioOtrosi } from '@/lib/otrosi'

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
  const puedeEliminar = tienePermiso(usuario, 'contratos', 'ELIMINAR')

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
      select: { id: true, nombre: true, creadoEn: true },
    }),
    prisma.configuracionEmpresa.findFirst({ select: { representanteLegal: true } }),
    prisma.evidenciaFirmaContrato.findMany({ where: { contratoId: id }, orderBy: { firmadoEn: 'asc' } }),
    // Anexos: entidad propia ('ContratoAnexo') para que el gestor —que permite borrar—
    // nunca liste el PDF del contrato ni la autorización.
    prisma.documento.findMany({
      where: { entidadTipo: 'ContratoAnexo', entidadId: id },
      select: { id: true, nombre: true, creadoEn: true },
      orderBy: { creadoEn: 'desc' },
    }),
  ])

  // Cada documento con sus versiones (la vigente primero: la firmada si ya la hay) y su estado.
  const version = (d: { id: string; nombre: string; creadoEn: Date }) => ({ id: d.id, nombre: d.nombre, fecha: formatFechaCorta(d.creadoEn) })
  const versionesContrato = documentos.filter((d) => !d.nombre.startsWith('Autorización')).map(version)
  const versionesAutorizacion = documentos.filter((d) => d.nombre.startsWith('Autorización')).map(version)
  const subido = c.origenPdf === 'SUBIDO'
  // Un contrato subido para firma no tiene snapshot de plantilla: el PDF es el documento.
  const tieneDocumento = !!c.contenidoPdf || c.origenPdf === 'SUBIDO_PARA_FIRMA'
  const empleadorOk = !!c.firmaEmpleadorPath || c.firmaEmpleadorEnPdf
  const empleadoOk = !!c.firmaEmpleadoPath
  const nombreEmpleador = empresaCfg?.representanteLegal ?? ''
  const estadoContrato = subido
    ? { estado: versionesContrato.length ? 'Firmado en físico · documento subido' : 'Sin PDF adjunto', tono: versionesContrato.length ? 'ok' as const : undefined, partes: undefined }
    : {
        estado: empleadorOk && empleadoOk ? 'Firmado por ambas partes'
          : empleadorOk ? 'Falta la firma del empleado · contenido congelado'
          : empleadoOk ? 'Falta la firma del empleador · contenido congelado'
          : 'Pendiente de firmas',
        tono: empleadorOk && empleadoOk ? 'ok' as const : 'pendiente' as const,
        partes: [
          {
            rol: 'Empleador',
            ok: empleadorOk,
            texto: c.firmaEmpleadorEnPdf ? 'firmó en el documento aportado'
              : c.firmaEmpleadorFecha ? `firmó el ${formatFechaCorta(c.firmaEmpleadorFecha)}` : 'pendiente',
          },
          {
            rol: 'Empleado',
            ok: empleadoOk,
            texto: c.firmaEmpleadoFecha ? `firmó el ${formatFechaCorta(c.firmaEmpleadoFecha)}` : 'firma desde su autoservicio',
          },
        ] satisfies FirmaParte[],
      }
  // Mientras nadie firme, el texto se edita y el PDF se regenera (solo con plantilla).
  const editable = GENERAR_CONTRATOS_DESDE_PLANTILLA && c.origenPdf === 'GENERADO' && puedeEditar && !c.firmaEmpleadorPath && !c.firmaEmpleadoPath
  const autorizacionFirmada = (versionesAutorizacion[0]?.nombre.toLowerCase().includes('firmad') ?? false) || empleadoOk

  // Si el contrato y la ficha se contradicen hay que decirlo aquí: las acciones
  // disponibles salen del tipo del contrato y los trámites del autoservicio del
  // vínculo de la ficha, así que la contradicción se nota como cosas que
  // "faltan" sin explicación (p. ej. un fijo sin botón de prórroga).
  const discrepancia = discrepanciaVinculo(
    c.tipo as TipoContratoLaboral,
    c.colaborador.tipoVinculo as TipoVinculo,
  )

  const nombre = `${c.colaborador.nombres} ${c.colaborador.apellidos}`
  // Días que le quedan a un contrato con fecha de fin: lo primero que se mira en un término fijo.
  const diasParaVencer = c.fechaFin && c.estado === 'ACTIVO' ? Math.ceil((c.fechaFin.getTime() - hoyBogota().getTime()) / 86_400_000) : null
  const hayModificaciones = c.prorrogas.length + c.otrosis.length + c.suspensiones.length > 0

  return (
    <div className="max-w-6xl space-y-4">
      <Encabezado
        volver
        enLinea
        titulo={`Contrato ${c.numero}`}
        descripcion={nombre}
        acciones={
          <>
            <Button asChild size="icon" variant="outline" title="Ver ficha del colaborador" aria-label="Ver ficha del colaborador">
              <Link href={`/colaboradores/${c.colaboradorId}`}><UserRound className="size-4" /></Link>
            </Button>
            {puedeEditar && (
              <AccionesContrato
                contratoId={c.id}
                colaboradorId={c.colaboradorId}
                tipo={c.tipo}
                estado={c.estado}
                numero={c.numero}
                sedeId={c.sedeId}
                puedeEliminar={puedeEliminar}
                cargos={cargos.map((x) => ({ id: x.id, nombre: x.nombre }))}
                sedes={sedes.map((x) => ({ id: x.id, nombre: x.nombre, ciudad: x.ciudad.nombre }))}
              />
            )}
          </>
        }
      />

      {discrepancia && (
        <Card className="border-amber-500/40 bg-amber-500/5 py-0">
          <CardContent className="flex items-start gap-2 py-3">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="min-w-0 text-xs text-amber-800 dark:text-amber-300">
              <p className="font-medium">El tipo del contrato no coincide con la ficha</p>
              <p className="mt-0.5">{discrepancia}</p>
              <Link href={`/colaboradores/${c.colaboradorId}/editar`} className="mt-1 inline-block font-medium underline underline-offset-2">
                Abrir la ficha del colaborador
              </Link>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Resumen: estado, tipo y los datos que se consultan, en una cuadrícula que usa el ancho. */}
      <Card className="py-0"><CardContent className="p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Pill tone={c.estado === 'ACTIVO' ? 'ok' : c.estado === 'SUSPENDIDO' ? 'bad' : 'muted'}>{ESTADO[c.estado]}</Pill>
          <Pill tone="info">{TIPO_CONTRATO[c.tipo]}</Pill>
          {diasParaVencer != null && (
            <Pill tone={diasParaVencer <= 45 ? 'warn' : 'muted'}>
              {diasParaVencer < 0 ? `Venció hace ${-diasParaVencer} días` : diasParaVencer === 0 ? 'Vence hoy' : `Vence en ${diasParaVencer} días`}
            </Pill>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-4">
          <Dato k="Cargo" v={c.cargo?.nombre ?? '—'} />
          <Dato k="Salario base" v={fmtCOP(Number(c.salarioBase))} />
          <Dato k="Sede" v={`${c.sede.nombre} · ${c.sede.ciudad.nombre}`} />
          <Dato k="Modalidad" v={MODALIDAD_TRABAJO[c.modalidadTrabajo]} />
          <Dato k="Inicio" v={formatFechaCorta(c.fechaInicio)} />
          <Dato k="Fin" v={c.fechaFin ? formatFechaCorta(c.fechaFin) : 'Indefinida'} />
          <Dato k="Duración" v={duracionContrato(c.fechaInicio, c.fechaFin)} />
          {c.periodoPruebaFin && <Dato k="Fin periodo de prueba" v={formatFechaCorta(c.periodoPruebaFin)} />}
          {c.objetoObraLabor && <Dato k="Objeto obra/labor" v={c.objetoObraLabor} full />}
        </dl>
      </CardContent></Card>

      {/* Documentos: el contrato con sus firmas, la autorización y lo adjunto. */}
      <Card className="py-0"><CardContent className="p-4 sm:p-5">
        <h2 className="text-sm font-semibold">Documentos</h2>
        <ul className="divide-y">
          {!subido && !tieneDocumento && versionesContrato.length === 0 ? (
            <FilaDocumento icono={FileText} titulo="Contrato" sub="Sin documento">
              {editable && <EdicionContrato contratoId={c.id} tieneDocumento={false} />}
            </FilaDocumento>
          ) : (
            <DocumentoVersiones
              icono={FileText}
              titulo="Contrato"
              estado={estadoContrato.estado}
              tono={estadoContrato.tono}
              partes={estadoContrato.partes}
              versiones={versionesContrato}
              acciones={
                <>
                  {editable && <EdicionContrato contratoId={c.id} tieneDocumento={tieneDocumento} />}
                  {!subido && tieneDocumento && puedeEditar && !empleadorOk && <FirmarEmpresa contratoId={c.id} vinculo="LABORAL" nombre={nombreEmpleador} />}
                </>
              }
            />
          )}
          {versionesAutorizacion.length > 0 && (
            <DocumentoVersiones
              icono={ShieldCheck}
              titulo="Autorización de datos"
              estado={autorizacionFirmada ? 'Firmada por el empleado' : 'Por firmar · la firma el empleado junto con el contrato'}
              tono={autorizacionFirmada ? 'ok' : 'pendiente'}
              versiones={versionesAutorizacion}
            />
          )}
          {anexos.map((d) => (
            <FilaAnexo key={d.id} id={d.id} contratoId={c.id} nombre={d.nombre} fecha={formatFechaCorta(d.creadoEn)} puedeEditar={puedeEditar} />
          ))}
        </ul>

        {/* Firma estampada donde no era: se mueve sin volver a firmar. */}
        {c.origenPdf === 'SUBIDO_PARA_FIRMA' && puedeEditar && (
          <div className="mt-3"><CorregirPosicionFirma contratoId={c.id} vinculo="LABORAL" /></div>
        )}
        {evidencias.length > 0 && (
          <details className="mt-3 rounded-lg border px-3 py-2">
            <summary className="cursor-pointer select-none text-xs font-medium text-muted-foreground">Rastro de firma ({evidencias.length})</summary>
            <ul className="mt-2 space-y-1">
              {evidencias.map((e) => (
                <li key={e.id} className="text-xs text-muted-foreground">
                  {e.metodoAuth === METODO_CORRECCION_POSICION
                    // No es una firma: alguien de TH movió el trazo a su sitio y se regeneró el PDF.
                    ? 'Posición de la firma corregida (PDF regenerado)'
                    : e.otrosiId ? 'Otrosí · empleado' : e.rol === 'EMPLEADO' ? 'Empleado' : 'Empleador'} · {formatFechaCorta(e.firmadoEn)}
                  {e.userEmail ? ` · ${e.userEmail}` : ''}{e.ip ? ` · IP ${e.ip}` : ''}
                  {e.metodoAuth === METODO_CORRECCION_POSICION ? '' : e.metodoAuth === 'CODIGO_EMAIL' ? ' · código al correo' : ' · sesión'}
                </li>
              ))}
            </ul>
          </details>
        )}
      </CardContent></Card>

      {/* Lo que cambió el contrato después de firmado: prórrogas, otrosíes y suspensiones. */}
      {hayModificaciones && (
        <Card className="py-0"><CardContent className="p-4 sm:p-5">
          <h2 className="text-sm font-semibold">Modificaciones</h2>
          <ul className="divide-y">
            {c.prorrogas.map((p) => (
              <FilaDocumento key={p.id} icono={CalendarPlus} titulo={`Prórroga ${p.numero}`} sub={`${formatFechaCorta(p.fechaInicio)} a ${formatFechaCorta(p.fechaFin)}`}>
                {p.documentoId && <VerDocumento documentoId={p.documentoId} titulo={`Prórroga ${p.numero}`} />}
                {/* El sistema no genera el PDF de la prórroga: se redacta fuera, se firma y se adjunta. */}
                {puedeEditar && (
                  <AdjuntarDocumento destino="prorroga" id={p.id} tieneDocumento={Boolean(p.documentoId)} etiqueta={p.documentoId ? 'Reemplazar PDF' : 'Adjuntar PDF'} variante="ghost" tamano="icon" className="size-8" />
                )}
              </FilaDocumento>
            ))}
            {c.otrosis.map((o) => {
              const resumen = resumenOtrosi(o.tiposCambio, o.valoresNuevos as ValoresOtrosi | null)
              const cambios = o.tiposCambio.map((t) => ETIQUETA_CAMBIO_OTROSI[t as TipoCambioOtrosi] ?? t).join(', ')
              return (
                <FilaDocumento
                  key={o.id}
                  icono={FilePen}
                  titulo={`Otrosí ${o.numero} · ${cambios}`}
                  tono={o.requiereFirma ? (o.firmaEmpleadoPath ? 'ok' : 'pendiente') : undefined}
                  sub={
                    o.requiereFirma
                      ? (o.firmaEmpleadoPath ? `Firmado por el trabajador${o.firmaEmpleadoFecha ? ` · ${formatFechaCorta(o.firmaEmpleadoFecha)}` : ''}` : 'Pendiente de firma del trabajador')
                      : [formatFechaCorta(o.fecha), resumen || o.descripcion].filter(Boolean).join(' · ')
                  }
                >
                  {o.documentoId && <VerDocumento documentoId={o.documentoId} titulo={`Otrosí ${o.numero}`} />}
                  {puedeEditar && !o.requiereFirma && (
                    <AdjuntarDocumento destino="otrosi" id={o.id} tieneDocumento={Boolean(o.documentoId)} etiqueta={o.documentoId ? 'Reemplazar PDF' : 'Adjuntar PDF'} variante="ghost" tamano="icon" className="size-8" />
                  )}
                </FilaDocumento>
              )
            })}
            {c.suspensiones.map((su) => (
              <FilaDocumento key={su.id} icono={CirclePause} titulo={`Suspensión · ${CAUSA_SUSP[su.causa]}`} sub={`${formatFechaCorta(su.fechaInicio)}${su.fechaFin ? ` a ${formatFechaCorta(su.fechaFin)}` : ' · sin fecha de fin'}`} />
            ))}
          </ul>
        </CardContent></Card>
      )}
    </div>
  )
}

function Dato({ k, v, full }: { k: string; v: React.ReactNode; full?: boolean }) {
  return (
    <div className={`flex min-w-0 flex-col ${full ? 'col-span-2 lg:col-span-4' : ''}`}>
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className="text-sm font-medium">{v}</dd>
    </div>
  )
}
