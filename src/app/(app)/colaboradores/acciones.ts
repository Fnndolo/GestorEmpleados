'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { dbAuditado } from '@/lib/auditoria'
import { prisma } from '@/lib/db'
import { accion, ErrorNegocio } from '@/server/accion'
import { colaboradorSchema, educacionSchema } from '@/lib/validaciones/colaborador'
import { parseFechaISO } from '@/lib/fechas'
import { normalizarTexto } from '@/lib/texto'
import { crearUsuarioColaborador } from '@/server/usuarios'
import type { ColaboradorInput } from '@/lib/validaciones/colaborador'

const v = (s: string | undefined | null) => (s && s !== '' ? s : null)

function aDatosPrisma(d: ColaboradorInput) {
  return {
    tipoDocumento: d.tipoDocumento,
    numeroDocumento: d.numeroDocumento.trim(),
    busquedaNormalizada: normalizarTexto(`${d.nombres} ${d.apellidos} ${d.numeroDocumento}`),
    fechaExpedicionDoc: parseFechaISO(d.fechaExpedicionDoc),
    lugarExpedicionDoc: v(d.lugarExpedicionDoc),
    nombres: d.nombres.trim(),
    apellidos: d.apellidos.trim(),
    fechaNacimiento: parseFechaISO(d.fechaNacimiento),
    lugarNacimiento: v(d.lugarNacimiento),
    genero: (v(d.genero) as ColaboradorInput['genero']) || null,
    estadoCivil: (v(d.estadoCivil) as ColaboradorInput['estadoCivil']) || null,
    grupoSanguineo: (v(d.grupoSanguineo) as ColaboradorInput['grupoSanguineo']) || null,
    direccion: v(d.direccion),
    barrio: v(d.barrio),
    ciudadResidenciaId: v(d.ciudadResidenciaId),
    celular: d.celular.trim(),
    telefono: v(d.telefono),
    emailPersonal: v(d.emailPersonal),
    emailCorporativo: v(d.emailCorporativo),
    emergenciaNombre: v(d.emergenciaNombre),
    emergenciaParentesco: v(d.emergenciaParentesco),
    emergenciaTelefono: v(d.emergenciaTelefono),
    nivelEducativoMax: (v(d.nivelEducativoMax) as ColaboradorInput['nivelEducativoMax']) || null,
    epsId: v(d.epsId),
    afpId: v(d.afpId),
    fondoCesantiasId: v(d.fondoCesantiasId),
    cajaCompensacionId: v(d.cajaCompensacionId),
    arlId: v(d.arlId),
    claseRiesgoArl: (v(d.claseRiesgoArl) as ColaboradorInput['claseRiesgoArl']) || null,
    bancoId: v(d.bancoId),
    tipoCuenta: (v(d.tipoCuenta) as ColaboradorInput['tipoCuenta']) || null,
    numeroCuenta: v(d.numeroCuenta),
    tipoVinculo: d.tipoVinculo,
    sedeId: d.sedeId,
    areaId: v(d.areaId),
    cargoId: v(d.cargoId),
    jefeInmediatoId: v(d.jefeInmediatoId),
    modalidadTrabajo: d.modalidadTrabajo,
    fechaIngreso: parseFechaISO(d.fechaIngreso)!,
    estado: d.estado,
    tallaCamisa: v(d.tallaCamisa),
    tallaPantalon: v(d.tallaPantalon),
    tallaCalzado: v(d.tallaCalzado),
  }
}

export const crearColaborador = accion(
  { modulo: 'colaboradores', accion: 'CREAR', schema: colaboradorSchema },
  async (datos) => {
    const dup = await prisma.colaborador.findUnique({
      where: { tipoDocumento_numeroDocumento: { tipoDocumento: datos.tipoDocumento, numeroDocumento: datos.numeroDocumento.trim() } },
    })
    if (dup) throw new ErrorNegocio('Ya existe un colaborador con ese documento.')
    const creado = await dbAuditado.colaborador.create({ data: aDatosPrisma(datos) })

    // Crear el usuario de acceso del colaborador con el rol por defecto de su cargo
    // (o "Empleado" si el cargo no lo define). Requiere un correo (corporativo o personal).
    let usuarioCreado = false
    let correoYaTeniaUsuario = false
    const email = v(datos.emailCorporativo) ?? v(datos.emailPersonal)
    if (email && datos.estado === 'ACTIVO') {
      correoYaTeniaUsuario = !!(await prisma.user.findUnique({ where: { email: email.toLowerCase() }, select: { id: true } }))
      const cargo = datos.cargoId ? await prisma.cargo.findUnique({ where: { id: datos.cargoId }, select: { rolDefectoId: true } }) : null
      let rolId = cargo?.rolDefectoId ?? null
      if (!rolId) rolId = (await prisma.rol.findUnique({ where: { nombre: 'Empleado' }, select: { id: true } }))?.id ?? null
      if (rolId) {
        const r = await crearUsuarioColaborador({
          email, nombre: `${datos.nombres.trim()} ${datos.apellidos.trim()}`,
          rolId, colaboradorId: creado.id, sedeId: datos.sedeId,
        }).catch((e) => { console.error('No se pudo crear el usuario del colaborador:', e); return null })
        usuarioCreado = !!r
      }
    }

    revalidatePath('/colaboradores')
    return { id: creado.id, usuarioCreado, sinCorreo: !email, correoYaTeniaUsuario }
  },
)

export const editarColaborador = accion(
  { modulo: 'colaboradores', accion: 'EDITAR', schema: colaboradorSchema.extend({ id: z.uuid() }) },
  async (datos) => {
    const { id, ...resto } = datos
    await dbAuditado.colaborador.update({ where: { id }, data: aDatosPrisma(resto) })
    revalidatePath('/colaboradores')
    revalidatePath(`/colaboradores/${id}`)
  },
)

// — Educación (tabla hija) —
export const agregarEducacion = accion(
  { modulo: 'colaboradores', accion: 'EDITAR', schema: educacionSchema },
  async (d) => {
    const edu = await dbAuditado.educacionColaborador.create({
      data: {
        colaboradorId: d.colaboradorId,
        nivel: d.nivel,
        titulo: d.titulo,
        institucion: d.institucion,
        fechaGrado: parseFechaISO(d.fechaGrado),
        enCurso: d.enCurso,
      },
    })
    revalidatePath(`/colaboradores/${d.colaboradorId}`)
    return { id: edu.id }
  },
)

export const eliminarEducacion = accion(
  { modulo: 'colaboradores', accion: 'EDITAR', schema: z.object({ id: z.uuid(), colaboradorId: z.uuid() }) },
  async ({ id, colaboradorId }) => {
    await dbAuditado.educacionColaborador.delete({ where: { id } })
    revalidatePath(`/colaboradores/${colaboradorId}`)
  },
)
