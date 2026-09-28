import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Pill } from '@/components/ui-kit'
import { FileText, ShieldCheck, UserRound } from 'lucide-react'
import { formatFechaLarga, formatFechaCorta, formatFechaISO, hoyBogota } from '@/lib/fechas'
import { FilaDocumento, VerDocumento } from '@/components/contratos/fila-documento'
import { FilaAnexo } from '@/components/contratos/fila-anexo'
import { AccionesOps } from './acciones-ops'
import { MOTIVO_CIERRE_TEXTO } from '@/lib/contratos-cierre'
import { fmtCOP } from '@/lib/moneda'
import { CuentasCobro } from './cuentas-cliente'
import { Entregables } from './entregables-cliente'
import { FirmasContrato } from './firmas-contrato'
import { GenerarAutorizacion, RegenerarDocumentos } from './generar-autorizacion'
import { GENERAR_CONTRATOS_DESDE_PLANTILLA } from '@/lib/contratos-config'
import { HabilitarFirma } from './habilitar-firma'
import { CorregirPosicionFirma } from '@/components/contratos/corregir-posicion-firma'

export const metadata = { title: 'Contrato OPS · Smart Gadgets RH' }

export default async function OpsDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const usuario = await requerirPermiso('contratos', 'VER')
  const puedeEditar = tienePermiso(usuario, 'contratos', 'EDITAR')
  const puedeEliminar = tienePermiso(usuario, 'contratos', 'ELIMINAR')
  const puedeAprobar = tienePermiso(usuario, 'contratos', 'APROBAR')

  const c = await prisma.contratoOps.findUnique({
    where: { id },
    include: {
      colaborador: true, supervisor: true, sede: { include: { ciudad: true } },
      entregables: { orderBy: [{ fechaEntrega: 'asc' }, { descripcion: 'asc' }] },
      cuentasCobro: { include: { soporteSs: true }, orderBy: { periodo: 'desc' } },
    },
  })
  if (!c) notFound()

  const snap = c.contenidoPdf as { encabezado?: { contratistaNombre?: string }; firmaContratanteNombre?: string; firmaContratistaNombre?: string } | null
  const nombreContratista = c.colaborador
    ? `${c.colaborador.nombres} ${c.colaborador.apellidos}`
    : snap?.encabezado?.contratistaNombre || snap?.firmaContratistaNombre || 'Contratista sin ficha'

  const [documentos, anexos] = await Promise.all([
    prisma.documento.findMany({
      where: { entidadTipo: 'ContratoOps', entidadId: id },
      orderBy: { creadoEn: 'desc' },
      select: { id: true, nombre: true, creadoEn: true, sha256: true, mimeType: true },
    }),
    // Anexos: entidad propia ('ContratoOpsAnexo') para que el gestor —que permite borrar—
    // nunca liste el PDF del contrato ni la autorización.
    prisma.documento.findMany({
      where: { entidadTipo: 'ContratoOpsAnexo', entidadId: id },
      select: { id: true, nombre: true, creadoEn: true },
      orderBy: { creadoEn: 'desc' },
    }),
  ])

  // Planillas PILA adjuntadas por el contratista a sus cuentas de cobro:
  // el verificador debe poder VER el archivo, no solo los datos declarados.
  const docsPlanilla = c.cuentasCobro.length
    ? await prisma.documento.findMany({
        where: { entidadTipo: 'CuentaCobroOps', entidadId: { in: c.cuentasCobro.map((cc) => cc.id) } },
        orderBy: { creadoEn: 'desc' },
        select: { id: true, entidadId: true, nombre: true, mimeType: true },
      })
    : []
  const planillaPorCuenta = new Map<string, { id: string; nombre: string; esImagen: boolean }>()
  for (const d of docsPlanilla) {
    if (!planillaPorCuenta.has(d.entidadId)) {
      planillaPorCuenta.set(d.entidadId, { id: d.id, nombre: d.nombre, esImagen: d.mimeType.startsWith('image/') })
    }
  }

  const hoy = hoyBogota()
  const vigente = c.estado === 'ACTIVO' || c.estado === 'FIRMADO'
  const vencido = vigente && c.fechaFin < hoy
  const diasParaVencer = vigente ? Math.ceil((c.fechaFin.getTime() - hoy.getTime()) / 86_400_000) : null
  const tieneAutorizacion = documentos.some((d) => d.nombre.startsWith('Autorización'))

  return (
    <div className="max-w-6xl space-y-4">
      <Encabezado
        volver="/contratos?tab=OPS"
        enLinea
        titulo={`Contrato ${c.numero}`}
        descripcion={nombreContratista}
        acciones={
          <>
            {c.colaboradorId && (
              <Button asChild size="icon" variant="outline" title="Ver ficha del contratista" aria-label="Ver ficha del contratista">
                <Link href={`/colaboradores/${c.colaboradorId}`}><UserRound className="size-4" /></Link>
              </Button>
            )}
            {puedeEditar && (
              <AccionesOps
                contratoId={c.id}
                numero={c.numero}
                sedeId={c.sedeId}
                vigente={vigente}
                vencido={vencido}
                fechaFin={formatFechaISO(c.fechaFin)}
                hoy={formatFechaISO(hoy)}
                puedeEliminar={puedeEliminar}
                firmado={Boolean(c.firmaContratistaPath)}
              />
            )}
          </>
        }
      />

      {/* Un OPS con el plazo vencido y todavía activo: o hay contrato nuevo y este
          se cierra, o hay que registrar el retiro. Se dice aquí, donde se puede actuar. */}
      {vencido && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 px-4 py-3 text-sm">
          <b>El plazo venció el {formatFechaLarga(c.fechaFin)}.</b> Si sigue con un contrato nuevo, ciérralo en Acciones; si se retira, regístralo en Terminaciones.
        </div>
      )}

      {/* Resumen: estado y los datos que se consultan, en una cuadrícula que usa el ancho. */}
      <Card className="py-0"><CardContent className="p-4 sm:p-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Pill tone={vigente ? 'ok' : 'muted'}>{ESTADO_OPS[c.estado] ?? c.estado}</Pill>
          <Pill tone="info">Prestación de servicios</Pill>
          {diasParaVencer != null && !vencido && (
            <Pill tone={diasParaVencer <= 30 ? 'warn' : 'muted'}>{diasParaVencer === 0 ? 'Vence hoy' : `Vence en ${diasParaVencer} días`}</Pill>
          )}
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 lg:grid-cols-4">
          <Dato k="Valor total" v={fmtCOP(Number(c.valorTotal))} />
          <Dato k="Valor mensual" v={c.valorMensual ? fmtCOP(Number(c.valorMensual)) : '—'} />
          <Dato k="Supervisor" v={c.supervisor ? `${c.supervisor.nombres} ${c.supervisor.apellidos}` : '—'} />
          <Dato k="Sede" v={`${c.sede.nombre} · ${c.sede.ciudad.nombre}`} />
          <Dato k="Inicio" v={formatFechaCorta(c.fechaInicio)} />
          <Dato k="Fin" v={formatFechaCorta(c.fechaFin)} />
          <Dato k="RUT" v={c.rut ?? '—'} />
          <Dato k="Objeto" v={c.objeto} full />
          {c.estado === 'TERMINADO' && c.cerradoEn && (
            <Dato
              k="Cierre"
              v={`${formatFechaLarga(c.cerradoEn)} · ${c.motivoCierre ? MOTIVO_CIERRE_TEXTO[c.motivoCierre] : 'sin motivo registrado'}${c.observacionCierre ? ` · ${c.observacionCierre}` : ''}`}
              full
            />
          )}
        </dl>
      </CardContent></Card>

      {/* Documentos: el contrato y la autorización, las dos firmas y lo adjunto. */}
      <Card className="py-0"><CardContent className="p-4 sm:p-5">
        <h2 className="text-sm font-semibold">Documentos</h2>
        <ul className="divide-y">
          {documentos.length === 0 ? (
            <FilaDocumento icono={FileText} titulo="Contrato" sub="Aún no se ha generado el PDF">
              {/* Solo para contratos de plantilla: en uno subido el snapshot no trae el texto del contrato. */}
              {GENERAR_CONTRATOS_DESDE_PLANTILLA && puedeEditar && c.origenPdf === 'GENERADO' && c.contenidoPdf != null && <RegenerarDocumentos contratoId={c.id} />}
            </FilaDocumento>
          ) : documentos.map((d) => (
            <FilaDocumento
              key={d.id}
              icono={d.nombre.startsWith('Autorización') ? ShieldCheck : FileText}
              titulo={d.nombre}
              sub={c.origenPdf === 'SUBIDO' && !d.nombre.startsWith('Autorización') ? 'Subido · firmado en físico' : formatFechaCorta(d.creadoEn)}
            >
              <VerDocumento documentoId={d.id} titulo={d.nombre} />
            </FilaDocumento>
          ))}
          {c.origenPdf !== 'SUBIDO' && documentos.length > 0 && (
            <FirmasContrato
              contratoId={c.id}
              puedeFirmar={puedeEditar}
              contratante={{
                nombre: snap?.firmaContratanteNombre ?? '',
                firmado: !!c.firmaContratantePath,
                fecha: c.firmaContratanteFecha ? formatFechaCorta(c.firmaContratanteFecha) : null,
                enPdf: c.firmaContratanteEnPdf,
              }}
              contratista={{
                nombre: snap?.firmaContratistaNombre ?? nombreContratista,
                firmado: !!c.firmaContratistaPath,
                fecha: c.firmaContratistaFecha ? formatFechaCorta(c.firmaContratistaFecha) : null,
              }}
            />
          )}
          {anexos.map((d) => (
            <FilaAnexo key={d.id} id={d.id} contratoId={c.id} nombre={d.nombre} fecha={formatFechaCorta(d.creadoEn)} puedeEditar={puedeEditar} />
          ))}
        </ul>

        {/* Arreglos puntuales, solo cuando hacen falta. */}
        {puedeEditar && (
          <div className="mt-3 flex flex-wrap gap-2 empty:hidden">
            {/* Subido como "firmado en físico" pero en realidad falta la firma del contratista:
                el único camino de vuelta para que la firme en la app (solo si lo archivado es un PDF). */}
            {c.origenPdf === 'SUBIDO' && documentos.some((d) => d.mimeType === 'application/pdf') && !c.firmaContratistaPath && !c.firmaContratantePath && (
              <HabilitarFirma contratoId={c.id} />
            )}
            {/* La autorización (Ley 1581) no se generó al crear el contrato: se repara aquí. */}
            {c.origenPdf !== 'SUBIDO' && documentos.length > 0 && !tieneAutorizacion && <GenerarAutorizacion contratoId={c.id} />}
            {/* Firma estampada donde no era: se mueve sin volver a firmar. */}
            {c.origenPdf === 'SUBIDO_PARA_FIRMA' && <CorregirPosicionFirma contratoId={c.id} vinculo="OPS" />}
          </div>
        )}
      </CardContent></Card>

      <Card className="py-0"><CardContent className="p-4 sm:p-5">
        <Entregables
          contratoOpsId={c.id}
          puedeEditar={puedeEditar}
          entregables={c.entregables.map((e) => ({
            id: e.id,
            descripcion: e.descripcion,
            fechaEntrega: e.fechaEntrega ? formatFechaISO(e.fechaEntrega) : null,
            cumplido: e.cumplido,
          }))}
        />
      </CardContent></Card>

      <Card className="py-0"><CardContent className="p-4 sm:p-5">
        <CuentasCobro
          contratoOpsId={c.id}
          valorMensual={c.valorMensual ? Number(c.valorMensual) : null}
          cuentas={c.cuentasCobro.map((cc) => ({
            id: cc.id, numero: cc.numero, periodo: cc.periodo, valor: Number(cc.valor),
            estado: cc.estado, fechaRadicacion: formatFechaISO(cc.fechaRadicacion),
            fechaPago: cc.fechaPago ? formatFechaISO(cc.fechaPago) : null,
            soporte: cc.soporteSs ? {
              estadoVerificacion: cc.soporteSs.estadoVerificacion,
              periodoCotizado: cc.soporteSs.periodoCotizado,
              ibcDeclarado: cc.soporteSs.ibcDeclarado ? Number(cc.soporteSs.ibcDeclarado) : null,
              operador: cc.soporteSs.operador,
            } : null,
            planilla: planillaPorCuenta.get(cc.id) ?? null,
          }))}
          puedeEditar={puedeEditar}
          puedeAprobar={puedeAprobar}
        />
      </CardContent></Card>
    </div>
  )
}

const ESTADO_OPS: Record<string, string> = { BORRADOR: 'Borrador', ACTIVO: 'Activo', FIRMADO: 'Firmado', TERMINADO: 'Terminado' }

function Dato({ k, v, full }: { k: string; v: React.ReactNode; full?: boolean }) {
  return (
    <div className={`flex min-w-0 flex-col ${full ? 'col-span-2 lg:col-span-4' : ''}`}>
      <dt className="text-xs text-muted-foreground">{k}</dt>
      <dd className="text-sm font-medium">{v}</dd>
    </div>
  )
}
