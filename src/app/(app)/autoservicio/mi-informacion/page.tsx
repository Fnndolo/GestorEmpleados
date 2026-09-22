import { requerirPermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { formatFechaISO } from '@/lib/fechas'
import type { MiFichaInput } from '@/lib/validaciones/colaborador'
import { MiInformacionForm } from './mi-informacion-form'
import { FotoUploader } from '@/app/(app)/colaboradores/[id]/foto-uploader'
import { iniciales } from '@/lib/etiquetas'
import { urlFoto } from '@/lib/foto'

export const metadata = { title: 'Mi información · Smart Gadgets RH' }

export default async function MiInformacionPage() {
  const usuario = await requerirPermiso('autoservicio', 'VER')
  if (!usuario.colaboradorId) {
    return (
      <div className="max-w-5xl">
        <Encabezado volver titulo="Mi información" />
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">Tu usuario no está vinculado a una ficha de colaborador. Contacta a Talento Humano.</CardContent></Card>
      </div>
    )
  }

  const [c, ciudades, entidades, bancos] = await Promise.all([
    prisma.colaborador.findUniqueOrThrow({ where: { id: usuario.colaboradorId } }),
    prisma.ciudad.findMany({ orderBy: { nombre: 'asc' }, select: { id: true, nombre: true, departamento: true } }),
    prisma.entidadSeguridadSocial.findMany({ where: { activa: true }, orderBy: { nombre: 'asc' }, select: { id: true, nombre: true, tipo: true } }),
    prisma.banco.findMany({ where: { activo: true }, orderBy: { nombre: 'asc' }, select: { id: true, nombre: true } }),
  ])

  const e = (s: string | null) => s ?? ''
  const catalogos = {
    ciudades: ciudades.map((x) => ({ id: x.id, nombre: `${x.nombre} (${x.departamento})` })),
    eps: entidades.filter((x) => x.tipo === 'EPS').map((x) => ({ id: x.id, nombre: x.nombre })),
    afp: entidades.filter((x) => x.tipo === 'AFP').map((x) => ({ id: x.id, nombre: x.nombre })),
    fondosCesantias: entidades.filter((x) => x.tipo === 'FONDO_CESANTIAS').map((x) => ({ id: x.id, nombre: x.nombre })),
    cajas: entidades.filter((x) => x.tipo === 'CAJA_COMPENSACION').map((x) => ({ id: x.id, nombre: x.nombre })),
    arl: entidades.filter((x) => x.tipo === 'ARL').map((x) => ({ id: x.id, nombre: x.nombre })),
    bancos: bancos.map((x) => ({ id: x.id, nombre: x.nombre })),
  }

  const valores: MiFichaInput = {
    fechaExpedicionDoc: formatFechaISO(c.fechaExpedicionDoc),
    lugarExpedicionDoc: e(c.lugarExpedicionDoc),
    fechaNacimiento: formatFechaISO(c.fechaNacimiento),
    lugarNacimiento: e(c.lugarNacimiento),
    genero: c.genero ?? '',
    estadoCivil: c.estadoCivil ?? '',
    grupoSanguineo: c.grupoSanguineo ?? '',
    direccion: e(c.direccion),
    ciudadResidenciaId: e(c.ciudadResidenciaId),
    emergenciaNombre: e(c.emergenciaNombre),
    emergenciaParentesco: e(c.emergenciaParentesco),
    emergenciaTelefono: e(c.emergenciaTelefono),
    nivelEducativoMax: c.nivelEducativoMax ?? '',
    epsId: e(c.epsId),
    afpId: e(c.afpId),
    fondoCesantiasId: e(c.fondoCesantiasId),
    cajaCompensacionId: e(c.cajaCompensacionId),
    arlId: e(c.arlId),
    bancoId: e(c.bancoId),
    tipoCuenta: c.tipoCuenta ?? '',
    numeroCuenta: e(c.numeroCuenta),
    tallaCamisa: e(c.tallaCamisa),
    tallaPantalon: e(c.tallaPantalon),
    tallaCalzado: e(c.tallaCalzado),
  }

  return (
    <div className="max-w-5xl">
      {/* Sin párrafo: en el celular el texto explicativo empujaba la foto y el
          formulario fuera de la primera pantalla. */}
      <Encabezado volver enLinea titulo="Mi información" />
      {/* La foto la cambia cada persona: es lo primero que ve el equipo en el
          menú y en las listas. */}
      <Card className="mb-4">
        <CardContent className="flex items-center gap-4 py-4">
          <FotoUploader
            colaboradorId={c.id}
            iniciales={iniciales(c.nombres, c.apellidos)}
            nombreCompleto={`${c.nombres} ${c.apellidos}`}
            fotoUrl={urlFoto(c.id, c.fotoPath)}
            puedeEditar
          />
          <div className="min-w-0">
            <p className="text-sm font-bold">Tu foto de perfil</p>
            <p className="text-xs text-muted-foreground">Toca la cámara para cambiarla o quitarla.</p>
          </div>
        </CardContent>
      </Card>
      <p className="mb-3 text-xs text-muted-foreground">
        Documento, nombre, correo y datos laborales los gestiona Talento Humano.
      </p>
      <MiInformacionForm catalogos={catalogos} valores={valores} />
    </div>
  )
}
