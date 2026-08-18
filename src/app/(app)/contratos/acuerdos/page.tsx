import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { AcuerdosCliente } from './acuerdos-cliente'
import { formatFechaISO } from '@/lib/fechas'

export const metadata = { title: 'Evaluación previa · Contratación' }

export default async function AcuerdosPage() {
  const usuario = await requerirPermiso('contratos', 'VER')
  const puedeCrear = tienePermiso(usuario, 'contratos', 'CREAR')
  const puedeEditar = tienePermiso(usuario, 'contratos', 'EDITAR')
  const puedeAprobar = tienePermiso(usuario, 'contratos', 'APROBAR')
  const puedeCrearColaborador = tienePermiso(usuario, 'colaboradores', 'CREAR')

  const [acuerdos, cargos, sedes] = await Promise.all([
    prisma.acuerdoEvaluacion.findMany({
      orderBy: { creadoEn: 'desc' },
      include: { sede: { select: { nombre: true } }, colaborador: { select: { id: true } } },
      take: 200,
    }),
    prisma.cargo.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' }, select: { id: true, nombre: true } }),
    prisma.sede.findMany({ where: { activa: true }, orderBy: { nombre: 'asc' }, select: { id: true, nombre: true } }),
  ])

  // Documentos del acuerdo (generado y, si ya volvió, el firmado) para poder abrirlos.
  const docs = await prisma.documento.findMany({
    where: { entidadTipo: 'AcuerdoEvaluacion', entidadId: { in: acuerdos.map((a) => a.id) } },
    select: { id: true, entidadId: true, nombre: true, creadoEn: true },
    orderBy: { creadoEn: 'desc' },
  })

  return (
    <div className="max-w-6xl">
      <Encabezado
        titulo="Evaluación previa"
        descripcion="Acuerdos de evaluación previa SIN relación laboral. El aspirante no es colaborador: solo entra a la base cuando la evaluación se aprueba y se convierte su ficha."
      />
      <AcuerdosCliente
        puedeCrear={puedeCrear}
        puedeEditar={puedeEditar}
        puedeAprobar={puedeAprobar}
        puedeCrearColaborador={puedeCrearColaborador}
        cargos={cargos}
        sedes={sedes}
        acuerdos={acuerdos.map((a) => ({
          id: a.id,
          numero: a.numero,
          nombre: `${a.nombres} ${a.apellidos}`,
          documento: `${a.tipoDocumento} ${a.numeroDocumento}`,
          email: a.email,
          cargoEvaluado: a.cargoEvaluado,
          sedeNombre: a.sede?.nombre ?? '',
          fechaInicio: formatFechaISO(a.fechaInicio),
          fechaFin: formatFechaISO(a.fechaFin),
          // Campos sueltos para poder reabrir el formulario con lo ya guardado.
          nombres: a.nombres,
          apellidos: a.apellidos,
          tipoDocumento: a.tipoDocumento,
          numeroDocumento: a.numeroDocumento,
          lugarExpedicionDoc: a.lugarExpedicionDoc ?? '',
          direccion: a.direccion ?? '',
          celular: a.celular ?? '',
          cargoId: a.cargoId ?? '',
          sedeId: a.sedeId ?? '',
          ciudadFirma: a.ciudadFirma ?? '',
          observaciones: a.observaciones ?? '',
          estado: a.estado,
          enviado: Boolean(a.enviadoEn),
          firmado: Boolean(a.firmadoEn),
          colaboradorId: a.colaborador?.id ?? null,
          documentos: docs
            .filter((d) => d.entidadId === a.id)
            .map((d) => ({ id: d.id, nombre: d.nombre })),
        }))}
      />
    </div>
  )
}
