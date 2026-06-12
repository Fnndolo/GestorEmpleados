import { notFound } from 'next/navigation'
import { requerirPermiso, tienePermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { cargarCatalogos } from '@/server/consultas/catalogos'
import { Encabezado } from '@/components/shell/encabezado'
import { FormColaborador } from '../../form-colaborador'
import { formatFechaISO } from '@/lib/fechas'
import type { ColaboradorInput } from '@/lib/validaciones/colaborador'

export const metadata = { title: 'Editar colaborador · Smart Gadgets RH' }

export default async function EditarColaboradorPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const usuario = await requerirPermiso('colaboradores', 'EDITAR')
  const puedeEditarSalud = tienePermiso(usuario, 'colaboradores_salud', 'EDITAR')

  const c = await prisma.colaborador.findUnique({ where: { id } })
  if (!c) notFound()

  const catalogos = await cargarCatalogos()
  const e = (s: string | null) => s ?? ''

  const valores: Partial<ColaboradorInput> & { id: string } = {
    id: c.id,
    tipoDocumento: c.tipoDocumento,
    numeroDocumento: c.numeroDocumento,
    fechaExpedicionDoc: formatFechaISO(c.fechaExpedicionDoc),
    lugarExpedicionDoc: e(c.lugarExpedicionDoc),
    nombres: c.nombres,
    apellidos: c.apellidos,
    fechaNacimiento: formatFechaISO(c.fechaNacimiento),
    lugarNacimiento: e(c.lugarNacimiento),
    genero: c.genero ?? '',
    estadoCivil: c.estadoCivil ?? '',
    grupoSanguineo: c.grupoSanguineo ?? '',
    direccion: e(c.direccion),
    barrio: e(c.barrio),
    ciudadResidenciaId: e(c.ciudadResidenciaId),
    celular: c.celular,
    telefono: e(c.telefono),
    emailPersonal: e(c.emailPersonal),
    emailCorporativo: e(c.emailCorporativo),
    emergenciaNombre: e(c.emergenciaNombre),
    emergenciaParentesco: e(c.emergenciaParentesco),
    emergenciaTelefono: e(c.emergenciaTelefono),
    nivelEducativoMax: c.nivelEducativoMax ?? '',
    epsId: e(c.epsId),
    afpId: e(c.afpId),
    fondoCesantiasId: e(c.fondoCesantiasId),
    cajaCompensacionId: e(c.cajaCompensacionId),
    arlId: e(c.arlId),
    claseRiesgoArl: c.claseRiesgoArl ?? '',
    bancoId: e(c.bancoId),
    tipoCuenta: c.tipoCuenta ?? '',
    numeroCuenta: e(c.numeroCuenta),
    tipoVinculo: c.tipoVinculo,
    sedeId: c.sedeId,
    areaId: e(c.areaId),
    cargoId: e(c.cargoId),
    jefeInmediatoId: e(c.jefeInmediatoId),
    modalidadTrabajo: c.modalidadTrabajo,
    fechaIngreso: formatFechaISO(c.fechaIngreso),
    estado: c.estado,
    tallaCamisa: e(c.tallaCamisa),
    tallaPantalon: e(c.tallaPantalon),
    tallaCalzado: e(c.tallaCalzado),
  }

  return (
    <div className="mx-auto max-w-4xl">
      <Encabezado titulo={`Editar · ${c.nombres} ${c.apellidos}`} descripcion="Actualiza la ficha del colaborador." />
      <FormColaborador catalogos={catalogos} valores={valores} puedeEditarSalud={puedeEditarSalud} />
    </div>
  )
}
