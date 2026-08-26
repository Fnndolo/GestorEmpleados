import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { CuentasRevision } from './cuentas-revision'
import { NuevaCuentaEmpresa } from './nueva-cuenta-empresa'
import { formatFechaISO } from '@/lib/fechas'

export const metadata = { title: 'Cuentas de cobro · Smart Gadgets RH' }

export default async function CuentasCobroPage() {
  const usuario = await requerirPermiso('contratos', 'VER')
  const puedeAprobar = tienePermiso(usuario, 'contratos', 'APROBAR')
  const puedeCrear = tienePermiso(usuario, 'contratos', 'CREAR')

  // Se cargan también para quien solo aprueba: al rehacer una cuenta puede
  // elegir con qué plantilla armarla.
  const plantillas = puedeCrear || puedeAprobar
    ? await prisma.plantillaCuentaCobro.findMany({ where: { activa: true }, orderBy: [{ esDefecto: 'desc' }, { nombre: 'asc' }] })
    : []

  const cuentas = await prisma.cuentaCobroOps.findMany({
    orderBy: { creadoEn: 'desc' },
    take: 200,
    include: {
      soporteSs: { select: { estadoVerificacion: true } },
      colaborador: { select: { nombres: true, apellidos: true } },
      contratoOps: { select: { id: true, colaborador: { select: { nombres: true, apellidos: true } } } },
    },
  })

  return (
    <div className="max-w-5xl">
      <Encabezado
        titulo="Cuentas de cobro"
        descripcion="Cuentas de cobro radicadas por colaboradores y contratistas (o por la empresa a su nombre). Revísalas, verifica la seguridad social (contratistas OPS) y apruébalas o recházalas."
        acciones={puedeCrear && <NuevaCuentaEmpresa plantillas={plantillas.map((p) => ({ id: p.id, nombre: p.nombre }))} />}
      />
      {cuentas.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Sin cuentas de cobro radicadas.</CardContent></Card>
      ) : (
        <CuentasRevision
          puedeAprobar={puedeAprobar}
          plantillas={plantillas.map((pl) => ({ id: pl.id, nombre: pl.nombre }))}
          cuentas={cuentas.map((c) => ({
            id: c.id,
            numero: c.numero,
            periodo: c.periodo,
            concepto: c.concepto,
            valor: Number(c.valor),
            estado: c.estado,
            fechaRadicacion: formatFechaISO(c.fechaRadicacion),
            documentoId: c.documentoId,
            colaborador: c.colaborador
              ? `${c.colaborador.nombres} ${c.colaborador.apellidos}`
              : c.contratoOps?.colaborador ? `${c.contratoOps.colaborador.nombres} ${c.contratoOps.colaborador.apellidos}` : '—',
            esOps: !!c.contratoOpsId,
            contratoOpsId: c.contratoOpsId,
            ssValida: c.soporteSs?.estadoVerificacion === 'VALIDA',
          }))}
        />
      )}
    </div>
  )
}
