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
  const puedeEditar = tienePermiso(usuario, 'contratos', 'EDITAR')

  const cuentas = await prisma.cuentaCobroOps.findMany({
    orderBy: { creadoEn: 'desc' },
    take: 200,
    include: {
      soporteSs: { select: { estadoVerificacion: true } },
      colaborador: { select: { nombres: true, apellidos: true } },
      contratoOps: { select: { id: true, colaborador: { select: { nombres: true, apellidos: true } } } },
    },
  })

  // La planilla PILA que adjuntó el contratista (va con la misma entidad que el
  // PDF de la cuenta; se reconoce por el nombre). La más reciente de cada cuenta.
  const planillas = await prisma.documento.findMany({
    where: { entidadTipo: 'CuentaCobroOps', entidadId: { in: cuentas.map((c) => c.id) }, nombre: { startsWith: 'Planilla PILA' } },
    orderBy: { creadoEn: 'desc' },
    select: { id: true, entidadId: true, nombre: true, mimeType: true },
  })
  const planillaDe = new Map<string, { id: string; nombre: string; esImagen: boolean }>()
  for (const d of planillas) if (!planillaDe.has(d.entidadId)) planillaDe.set(d.entidadId, { id: d.id, nombre: d.nombre, esImagen: d.mimeType.startsWith('image/') })

  return (
    <div className="max-w-5xl">
      <Encabezado
        volver
        titulo="Cuentas de cobro"
        descripcion="Cuentas de cobro radicadas por colaboradores y contratistas (o por la empresa a su nombre). Revísalas, verifica la seguridad social (contratistas OPS) y apruébalas o recházalas."
        acciones={puedeCrear && <NuevaCuentaEmpresa />}
      />
      {cuentas.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-sm text-muted-foreground">Sin cuentas de cobro radicadas.</CardContent></Card>
      ) : (
        <CuentasRevision
          puedeAprobar={puedeAprobar}
          puedeEditar={puedeEditar}
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
            // La PILA solo aplica a contratistas OPS; si se pidió, bloquea la aprobación hasta verificarla.
            esOps: !!c.contratoOpsId,
            requierePila: c.requierePila,
            contratoOpsId: c.contratoOpsId,
            ss: c.soporteSs?.estadoVerificacion ?? null,
            planilla: planillaDe.get(c.id) ?? null,
          }))}
        />
      )}
    </div>
  )
}
