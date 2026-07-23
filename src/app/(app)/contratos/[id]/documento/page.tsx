import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { requerirPermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { valorParametroVigente } from '@/server/nomina/parametros'
import { formatFechaISO } from '@/lib/fechas'
import { Encabezado } from '@/components/shell/encabezado'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import type { SnapshotContratoLaboral } from '@/server/contratos-laboral-pdf'
import { FormContrato } from '../../form-contrato'

export const metadata = { title: 'Editar contrato · Smart Gadgets RH' }

export default async function EditarContratoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await requerirPermiso('contratos', 'EDITAR')

  const c = await prisma.contrato.findUnique({
    where: { id },
    include: { colaborador: { select: { nombres: true, apellidos: true } } },
  })
  if (!c) notFound()
  // Congelado desde la primera firma: los cambios posteriores van por otrosí.
  if (c.firmaEmpleadoPath || c.firmaEmpleadorPath) redirect(`/contratos/${id}`)

  const [sedes, cargos, smmlv, auxTransporte, plantillas, empresa] = await Promise.all([
    prisma.sede.findMany({ where: { activa: true }, include: { ciudad: true }, orderBy: { nombre: 'asc' } }),
    prisma.cargo.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' } }),
    valorParametroVigente('SMMLV'),
    valorParametroVigente('AUX_TRANSPORTE'),
    prisma.plantillaContrato.findMany({
      where: { activa: true, tipo: { not: 'OPS' } },
      include: { clausulas: { orderBy: { orden: 'asc' } } },
    }),
    prisma.configuracionEmpresa.findFirst(),
  ])

  // Documento fuente (texto con {{variables}}) tal como quedó al crear/última edición.
  const snapshot = c.contenidoPdf as unknown as SnapshotContratoLaboral | null
  const fuente = snapshot?.plantillaFuente ?? null

  return (
    <div className="mx-auto max-w-[1400px]">
      <Encabezado
        titulo={`Editar contrato ${c.numero}`}
        descripcion={`${c.colaborador.nombres} ${c.colaborador.apellidos} — editable hasta que alguna de las partes firme; al guardar se regenera el documento.`}
        acciones={
          <Button variant="outline" size="sm" asChild>
            <Link href={`/contratos/${id}`}><ArrowLeft className="size-4" /> Volver al contrato</Link>
          </Button>
        }
      />
      <FormContrato
        catalogos={{
          sedes: sedes.map((s) => ({ id: s.id, nombre: s.nombre, ciudad: s.ciudad.nombre })),
          cargos: cargos.map((x) => ({ id: x.id, nombre: x.nombre, funciones: (x.funcionesContrato as { grupo: string; items: string[] }[] | null) ?? null })),
          smmlv, auxTransporte,
        }}
        plantillas={plantillas.map((p) => ({
          tipo: p.tipo,
          titulo: p.titulo,
          intro: p.intro,
          cierre: p.cierre,
          clausulas: p.clausulas.map((cl) => ({ titulo: cl.titulo, cuerpo: cl.cuerpo, esFunciones: cl.esFunciones, orden: cl.orden })),
        }))}
        empresa={{
          razonSocial: empresa?.razonSocial ?? '',
          marca: empresa?.nombreComercial ?? null,
          nit: empresa?.nit ?? null,
          representanteLegal: empresa?.representanteLegal ?? null,
          representanteLegalCc: empresa?.representanteLegalCc ?? null,
          direccion: empresa?.direccion ?? null,
        }}
        inicial={{
          contratoId: c.id,
          numero: c.numero,
          colaboradorNombre: `${c.colaborador.nombres} ${c.colaborador.apellidos}`,
          form: {
            colaboradorId: c.colaboradorId,
            tipo: c.tipo,
            cargoId: c.cargoId ?? '',
            sedeId: c.sedeId,
            jornada: c.jornada,
            horasSemanales: c.horasSemanales ?? undefined,
            modalidadTrabajo: c.modalidadTrabajo,
            salarioBase: Number(c.salarioBase),
            ganaSalarioMinimo: c.ganaSalarioMinimo,
            tieneAuxTransporte: c.tieneAuxTransporte,
            auxConectividad: c.auxConectividad ? Number(c.auxConectividad) : 0,
            tipoSalario: c.tipoSalario,
            fechaInicio: formatFechaISO(c.fechaInicio),
            fechaFin: c.fechaFin ? formatFechaISO(c.fechaFin) : '',
            objetoObraLabor: c.objetoObraLabor ?? '',
            etapaAprendizaje: c.etapaAprendizaje ?? '',
            periodoPruebaDias: c.periodoPruebaDias ?? undefined,
            observaciones: c.observaciones ?? '',
          },
          doc: fuente
            ? {
                titulo: fuente.titulo,
                intro: fuente.intro,
                cierre: fuente.cierre,
                clausulas: fuente.clausulas,
                funciones: fuente.funciones,
              }
            : null,
        }}
      />
    </div>
  )
}
