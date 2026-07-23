import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatFechaLarga, formatFechaISO } from '@/lib/fechas'
import { fmtCOP } from '@/lib/moneda'
import { CuentasCobro } from './cuentas-cliente'
import { Entregables } from './entregables-cliente'
import { FirmasContrato } from './firmas-contrato'
import { GenerarAutorizacion, RegenerarDocumentos } from './generar-autorizacion'
import { VisorPdf } from '@/components/documentos/visor-pdf'

export const metadata = { title: 'Contrato OPS · Smart Gadgets RH' }

export default async function OpsDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const usuario = await requerirPermiso('contratos', 'VER')
  const puedeEditar = tienePermiso(usuario, 'contratos', 'EDITAR')
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

  const snap = c.contenidoPdf as { firmaContratanteNombre?: string; firmaContratistaNombre?: string } | null

  const documentos = await prisma.documento.findMany({
    where: { entidadTipo: 'ContratoOps', entidadId: id },
    orderBy: { creadoEn: 'desc' },
    select: { id: true, nombre: true, creadoEn: true, sha256: true },
  })

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

  return (
    <div className="mx-auto max-w-4xl">
      <Encabezado titulo={`OPS ${c.numero}`} descripcion={`${c.colaborador.nombres} ${c.colaborador.apellidos}`} />

      <Card className="mb-4"><CardContent className="py-4">
        <dl className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
          <Dato k="Contratista" v={`${c.colaborador.nombres} ${c.colaborador.apellidos}`} />
          <Dato k="Estado" v={<Badge variant={c.estado === 'ACTIVO' ? 'default' : 'secondary'}>{c.estado}</Badge>} />
          <Dato k="Objeto" v={c.objeto} full />
          <Dato k="Valor total" v={fmtCOP(Number(c.valorTotal))} />
          <Dato k="Valor mensual" v={c.valorMensual ? fmtCOP(Number(c.valorMensual)) : '—'} />
          <Dato k="Supervisor" v={c.supervisor ? `${c.supervisor.nombres} ${c.supervisor.apellidos}` : '—'} />
          <Dato k="Sede" v={`${c.sede.nombre} · ${c.sede.ciudad.nombre}`} />
          <Dato k="Vigencia" v={`${formatFechaLarga(c.fechaInicio)} — ${formatFechaLarga(c.fechaFin)}`} />
          <Dato k="RUT" v={c.rut ?? '—'} />
        </dl>
        <p className="mt-3">
          <Link href={`/colaboradores/${c.colaboradorId}`} className="text-sm text-primary hover:underline">Ver ficha del contratista →</Link>
        </p>
      </CardContent></Card>

      <Card className="mb-4"><CardContent className="py-4">
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

      <Card className="mb-4"><CardContent className="py-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h2 className="text-base font-medium">Documentos del contrato</h2>
          {puedeEditar && documentos.length > 0 && !documentos.some((d) => d.nombre.startsWith('Autorización')) && (
            <GenerarAutorizacion contratoId={c.id} />
          )}
        </div>
        {documentos.length === 0 ? (
          <div className="flex flex-col items-start gap-2">
            <p className="text-sm text-muted-foreground">Aún no se ha generado el PDF del contrato.</p>
            {puedeEditar && c.contenidoPdf != null && <RegenerarDocumentos contratoId={c.id} />}
          </div>
        ) : (
          <ul className="space-y-1.5">
            {documentos.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate">{d.nombre} · {formatFechaLarga(d.creadoEn)}</span>
                <VisorPdf documentoId={d.id} titulo={d.nombre} className="shrink-0 text-primary hover:underline">Ver PDF →</VisorPdf>
              </li>
            ))}
          </ul>
        )}
      </CardContent></Card>

      <Card className="mb-4"><CardContent className="py-4">
        <h2 className="mb-3 text-base font-medium">Firmas</h2>
        {documentos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Genera el PDF del contrato antes de recoger las firmas.</p>
        ) : (
          <FirmasContrato
            contratoId={c.id}
            puedeFirmar={puedeEditar}
            contratante={{
              nombre: snap?.firmaContratanteNombre ?? '',
              firmado: !!c.firmaContratantePath,
              fecha: c.firmaContratanteFecha ? formatFechaLarga(c.firmaContratanteFecha) : null,
            }}
            contratista={{
              nombre: snap?.firmaContratistaNombre ?? `${c.colaborador.nombres} ${c.colaborador.apellidos}`,
              firmado: !!c.firmaContratistaPath,
              fecha: c.firmaContratistaFecha ? formatFechaLarga(c.firmaContratistaFecha) : null,
            }}
          />
        )}
        <p className="mt-2 text-xs text-muted-foreground">
          La autorización de tratamiento de datos (Ley 1581) la firma únicamente el contratista, junto con el contrato, desde su autoservicio.
        </p>
      </CardContent></Card>

      <h2 className="text-lg font-medium mb-3">Cuentas de cobro</h2>
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
