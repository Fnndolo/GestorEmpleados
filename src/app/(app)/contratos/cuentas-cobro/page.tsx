import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { CuentasRevision } from './cuentas-revision'
import { formatFechaISO } from '@/lib/fechas'

export const metadata = { title: 'Cuentas de cobro · Smart Gadgets RH' }

export default async function CuentasCobroPage() {
  const usuario = await requerirPermiso('contratos', 'VER')
  const puedeAprobar = tienePermiso(usuario, 'contratos', 'APROBAR')

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
    <div className="mx-auto max-w-3xl">
      <Encabezado
        titulo="Cuentas de cobro"
        descripcion="Cuentas de cobro radicadas por colaboradores y contratistas. Revísalas, verifica la seguridad social (contratistas OPS) y apruébalas o recházalas."
      />
      {cuentas.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Sin cuentas de cobro radicadas.</CardContent></Card>
      ) : (
        <CuentasRevision
          puedeAprobar={puedeAprobar}
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
              : c.contratoOps ? `${c.contratoOps.colaborador.nombres} ${c.contratoOps.colaborador.apellidos}` : '—',
            esOps: !!c.contratoOpsId,
            contratoOpsId: c.contratoOpsId,
            ssValida: c.soporteSs?.estadoVerificacion === 'VALIDA',
          }))}
        />
      )}
    </div>
  )
}
