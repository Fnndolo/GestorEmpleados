import { notFound } from 'next/navigation'
import Link from 'next/link'
import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatFechaLarga, formatFechaISO } from '@/lib/fechas'
import { GestorDocumentos } from '@/components/documentos/gestor-documentos'
import { fmtCOP } from '@/lib/moneda'
import { PazYSalvoChecklist } from './paz-y-salvo'

export const metadata = { title: 'Terminación · Smart Gadgets RH' }

const TIPO: Record<string, string> = {
  RENUNCIA_VOLUNTARIA: 'Renuncia voluntaria', SIN_JUSTA_CAUSA: 'Sin justa causa', CON_JUSTA_CAUSA: 'Con justa causa',
  TERMINACION_ANTICIPADA: 'Terminación anticipada', MUTUO_ACUERDO: 'Mutuo acuerdo', VENCIMIENTO_PLAZO: 'Vencimiento del plazo',
  PERIODO_PRUEBA: 'Periodo de prueba', FIN_OPS: 'Fin OPS',
}

export default async function TerminacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const usuario = await requerirPermiso('terminaciones', 'VER')
  const puedeEditar = tienePermiso(usuario, 'terminaciones', 'EDITAR')
  const puedeAprobar = tienePermiso(usuario, 'terminaciones', 'APROBAR')

  const t = await prisma.terminacion.findUnique({
    where: { id },
    include: {
      colaborador: { select: { id: true, nombres: true, apellidos: true, numeroDocumento: true } },
      liquidacion: true,
      pazYSalvo: { include: { items: true } },
      procesoDisciplinario: { select: { id: true, asunto: true, decision: true, fechaApertura: true } },
    },
  })
  if (!t) notFound()
  const liq = t.liquidacion

  // Actas y soportes de la terminación (carta, liquidación firmada, acta de entrega…)
  const [documentos, tiposDocumento] = await Promise.all([
    prisma.documento.findMany({
      where: { entidadTipo: 'Terminacion', entidadId: id },
      include: { tipoDocumento: { select: { nombre: true } } },
      orderBy: { creadoEn: 'desc' },
    }),
    prisma.tipoDocumento.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } }),
  ])

  return (
    <div className="mx-auto max-w-3xl">
      <Encabezado
        titulo={`${t.colaborador.nombres} ${t.colaborador.apellidos}`}
        descripcion={`${TIPO[t.tipo]} · ${formatFechaLarga(t.fechaRetiro)}`}
        acciones={<Badge variant={t.estado === 'CERRADA' ? 'default' : 'outline'}>{t.estado}</Badge>}
      />

      <p className="mb-4">
        <Link href={`/colaboradores/${t.colaborador.id}`} className="text-sm text-primary hover:underline">Ver ficha del colaborador →</Link>
      </p>

      {/* Justa causa: proceso disciplinario que la sustenta (debido proceso) */}
      {t.tipo === 'CON_JUSTA_CAUSA' && (
        <Card className="mb-4"><CardContent className="py-3">
          {t.procesoDisciplinario ? (
            <p className="text-sm">
              <span className="font-medium">Sustentada en el proceso disciplinario:</span>{' '}
              <Link href={`/juridica/disciplinarios/${t.procesoDisciplinario.id}`} className="text-primary hover:underline">
                {t.procesoDisciplinario.asunto} ({formatFechaLarga(t.procesoDisciplinario.fechaApertura)})
              </Link>
              {t.procesoDisciplinario.decision && <span className="text-muted-foreground"> · {t.procesoDisciplinario.decision}</span>}
            </p>
          ) : (
            <p className="text-sm text-destructive">
              ⚠ Terminación con justa causa sin proceso disciplinario vinculado (registrada antes del control de debido proceso).
            </p>
          )}
        </CardContent></Card>
      )}

      {/* Liquidación definitiva */}
      {liq && (
        <Card className="mb-4"><CardContent className="py-4">
          <h3 className="text-sm font-medium mb-3">Liquidación definitiva (borrador para revisión contable)</h3>
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2 text-sm">
            <Row k="Días liquidados" v={`${liq.diasLiquidados}`} />
            <Row k="Salario base" v={fmtCOP(Number(liq.salarioBase))} />
            <Row k="Cesantías" v={fmtCOP(Number(liq.cesantias))} />
            <Row k="Intereses cesantías" v={fmtCOP(Number(liq.interesesCesantias))} />
            <Row k="Prima" v={fmtCOP(Number(liq.prima))} />
            <Row k="Vacaciones" v={fmtCOP(Number(liq.vacaciones))} />
            {Number(liq.indemnizacion) > 0 && <Row k="Indemnización" v={fmtCOP(Number(liq.indemnizacion))} />}
            {Number(liq.deducciones) > 0 && <Row k="Deducciones (saldo préstamo)" v={`− ${fmtCOP(Number(liq.deducciones))}`} />}
          </dl>
          <div className="flex items-center justify-between border-t mt-3 pt-3">
            <span className="font-medium">Total a pagar</span>
            <span className="font-semibold text-lg text-emerald-600">{fmtCOP(Number(liq.total))}</span>
          </div>
        </CardContent></Card>
      )}

      {/* Paz y salvo */}
      {t.pazYSalvo && (
        <PazYSalvoChecklist
          estado={t.pazYSalvo.estado}
          items={t.pazYSalvo.items.map((i) => ({ id: i.id, area: i.area, concepto: i.concepto, cumplido: i.cumplido, observacion: i.observacion }))}
          terminacionId={t.id}
          terminacionEstado={t.estado}
          puedeEditar={puedeEditar}
          puedeAprobar={puedeAprobar}
        />
      )}

      {/* Actas y soportes: carta de terminación, liquidación firmada, renuncia, actas de entrega… */}
      <div className="mt-6">
        <GestorDocumentos
          entidadTipo="Terminacion"
          entidadId={t.id}
          sedeId={null}
          documentos={documentos.map((d) => ({
            id: d.id, nombre: d.nombre, tipoDocumentoNombre: d.tipoDocumento?.nombre ?? null,
            mimeType: d.mimeType, tamanoBytes: d.tamanoBytes,
            fechaVencimiento: formatFechaISO(d.fechaVencimiento) || null, creadoEn: d.creadoEn.toISOString(),
          }))}
          tiposDocumento={tiposDocumento.map((x) => ({ id: x.id, nombre: x.nombre, requiereVencimiento: x.requiereVencimiento }))}
          semaforo={[]}
          puedeEditar={puedeEditar}
        />
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return <div className="flex justify-between sm:block"><dt className="text-muted-foreground">{k}</dt><dd>{v}</dd></div>
}
