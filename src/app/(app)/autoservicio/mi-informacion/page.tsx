import Link from 'next/link'
import { requerirPermiso } from '@/server/sesion'
import { prisma } from '@/lib/db'
import { Encabezado } from '@/components/shell/encabezado'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'
import { formatFechaISO } from '@/lib/fechas'
import type { MiFichaInput } from '@/lib/validaciones/colaborador'
import { MiInformacionForm } from './mi-informacion-form'

export const metadata = { title: 'Mi información · Smart Gadgets RH' }

export default async function MiInformacionPage() {
  const usuario = await requerirPermiso('autoservicio', 'VER')
  if (!usuario.colaboradorId) {
    return (
      <div className="max-w-5xl">
        <Encabezado titulo="Mi información" />
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
      <Encabezado
        titulo="Mi información"
        descripcion="Completa y mantén al día tus datos personales, de contacto, seguridad social y bancarios. Talento Humano los revisa."
        acciones={
          <Button variant="outline" size="sm" asChild>
            <Link href="/autoservicio"><ArrowLeft className="size-4" /> Volver</Link>
          </Button>
        }
      />
      <div className="mb-4 rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
        Estos son los datos que puedes actualizar tú. Tu identidad (documento, nombre), tu correo de acceso
        y tus datos laborales (vínculo, cargo, salario) los gestiona Talento Humano.
      </div>
      <MiInformacionForm catalogos={catalogos} valores={valores} />
    </div>
  )
}
