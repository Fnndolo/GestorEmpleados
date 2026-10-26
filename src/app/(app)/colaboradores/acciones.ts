'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { dbAuditado, auditar } from '@/lib/auditoria'
import { eliminarDocumento } from '@/server/documentos'
import { eliminarArchivo } from '@/server/storage'
import { rutaMiniatura } from '@/lib/foto'
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
    ciudadResidenciaId: v(d.ciudadResidenciaId),
    celular: d.celular.trim(),
    emailPersonal: v(d.emailPersonal),
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
    // (o "Empleado" si el cargo no lo define). El correo personal es obligatorio.
    let usuarioCreado = false
    let correoYaTeniaUsuario = false
    const email = v(datos.emailPersonal)
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

/**
 * Sugerencia de sincronización del acceso tras editar un colaborador. NO cambia nada:
 * solo informa al cliente para que pida confirmación (cargo y rol se ajustan a propósito
 * por separado; nunca pisamos permisos sin que el admin lo apruebe).
 */
export type SugerenciaAcceso =
  | { tipo: 'rol'; rolId: string; rolNombre: string; rolActual: string | null }
  | { tipo: 'crearCuenta'; email: string }

async function calcularSugerenciaAcceso(
  previo: { cargoId: string | null; usuarioId: string | null } | null,
  datos: ColaboradorInput,
): Promise<SugerenciaAcceso | null> {
  if (!previo) return null

  // Caso 1: ya tiene cuenta y cambió el cargo → sugerir alinear el rol de acceso.
  if (previo.usuarioId) {
    const cargoNuevoId = v(datos.cargoId)
    if (!cargoNuevoId || cargoNuevoId === previo.cargoId) return null
    const cargo = await prisma.cargo.findUnique({ where: { id: cargoNuevoId }, select: { rolDefectoId: true } })
    if (!cargo?.rolDefectoId) return null
    const usuario = await prisma.user.findUnique({ where: { id: previo.usuarioId }, select: { rolId: true } })
    if (!usuario || usuario.rolId === cargo.rolDefectoId) return null
    const [rolNuevo, rolActual] = await Promise.all([
      prisma.rol.findUnique({ where: { id: cargo.rolDefectoId }, select: { nombre: true } }),
      prisma.rol.findUnique({ where: { id: usuario.rolId }, select: { nombre: true } }),
    ])
    if (!rolNuevo) return null
    return { tipo: 'rol', rolId: cargo.rolDefectoId, rolNombre: rolNuevo.nombre, rolActual: rolActual?.nombre ?? null }
  }

  // Caso 2: no tiene cuenta, pero ahora está activo y con correo → sugerir crear el acceso.
  const email = v(datos.emailPersonal)
  if (datos.estado === 'ACTIVO' && email) {
    const yaExiste = await prisma.user.findUnique({ where: { email: email.toLowerCase() }, select: { id: true } })
    if (!yaExiste) return { tipo: 'crearCuenta', email }
  }
  return null
}

export const editarColaborador = accion(
  { modulo: 'colaboradores', accion: 'EDITAR', schema: colaboradorSchema.extend({ id: z.uuid() }) },
  async (datos) => {
    const { id, ...resto } = datos
    const previo = await prisma.colaborador.findUnique({
      where: { id },
      select: { cargoId: true, usuarioId: true },
    })
    // El documento identifica a la persona: no puede quedar el de OTRO colaborador.
    // La base ya lo impide (@@unique tipoDocumento+numeroDocumento), pero aquí se
    // avisa con un mensaje entendible en vez de dejar reventar la restricción.
    const dup = await prisma.colaborador.findUnique({
      where: { tipoDocumento_numeroDocumento: { tipoDocumento: resto.tipoDocumento, numeroDocumento: resto.numeroDocumento.trim() } },
      select: { id: true },
    })
    if (dup && dup.id !== id) throw new ErrorNegocio('Ya existe otro colaborador con ese documento.')

    await dbAuditado.colaborador.update({ where: { id }, data: aDatosPrisma(resto) })
    revalidatePath('/colaboradores')
    revalidatePath(`/colaboradores/${id}`)

    const sugerencia = await calcularSugerenciaAcceso(previo, resto)
    return { sugerencia }
  },
)

/**
 * Aplica —solo tras confirmación explícita del admin— la sincronización sugerida por
 * `editarColaborador`: actualizar el rol de acceso, o crear la cuenta que faltaba.
 */
export const sincronizarAccesoColaborador = accion(
  {
    modulo: 'colaboradores',
    accion: 'EDITAR',
    schema: z.object({
      colaboradorId: z.uuid(),
      tipo: z.enum(['rol', 'crearCuenta']),
      rolId: z.uuid().optional(),
    }),
  },
  async ({ colaboradorId, tipo, rolId }) => {
    const col = await prisma.colaborador.findUniqueOrThrow({
      where: { id: colaboradorId },
      select: {
        usuarioId: true, nombres: true, apellidos: true,
        emailPersonal: true, sedeId: true, cargoId: true,
      },
    })

    if (tipo === 'rol') {
      if (!col.usuarioId) throw new ErrorNegocio('El colaborador no tiene usuario de acceso.')
      if (!rolId) throw new ErrorNegocio('Falta el rol a asignar.')
      const rol = await prisma.rol.findUniqueOrThrow({ where: { id: rolId } })
      await dbAuditado.user.update({
        where: { id: col.usuarioId },
        data: { rolId, role: rol.nombre === 'Administrador' ? 'admin' : 'user' },
      })
      revalidatePath('/configuracion/usuarios')
      revalidatePath(`/colaboradores/${colaboradorId}`)
      return { rolNombre: rol.nombre }
    }

    // Crear la cuenta que faltaba, con el rol del cargo (o "Empleado" por defecto).
    if (col.usuarioId) throw new ErrorNegocio('El colaborador ya tiene usuario de acceso.')
    const email = v(col.emailPersonal)
    if (!email) throw new ErrorNegocio('El colaborador no tiene correo para crear el acceso.')
    let rId = rolId ?? null
    if (!rId) {
      const cargo = col.cargoId
        ? await prisma.cargo.findUnique({ where: { id: col.cargoId }, select: { rolDefectoId: true } })
        : null
      rId = cargo?.rolDefectoId ?? (await prisma.rol.findUnique({ where: { nombre: 'Empleado' }, select: { id: true } }))?.id ?? null
    }
    if (!rId) throw new ErrorNegocio('No hay un rol para asignar al usuario.')
    const r = await crearUsuarioColaborador({
      email, nombre: `${col.nombres} ${col.apellidos}`, rolId: rId, colaboradorId, sedeId: col.sedeId,
    })
    revalidatePath(`/colaboradores/${colaboradorId}`)
    return { creado: !!r }
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

export const editarEducacion = accion(
  { modulo: 'colaboradores', accion: 'EDITAR', schema: educacionSchema.extend({ id: z.uuid() }) },
  async ({ id, ...d }) => {
    const edu = await prisma.educacionColaborador.findUniqueOrThrow({ where: { id }, select: { colaboradorId: true } })
    await dbAuditado.educacionColaborador.update({
      where: { id },
      data: { nivel: d.nivel, titulo: d.titulo, institucion: d.institucion, fechaGrado: parseFechaISO(d.fechaGrado), enCurso: d.enCurso },
    })
    revalidatePath(`/colaboradores/${edu.colaboradorId}`)
    return { ok: true }
  },
)

/**
 * Borrar una ficha creada por error (persona duplicada, alta equivocada). Solo
 * si no tiene historia: contratos, nóminas, novedades ni documentos aparte de
 * la foto. Con historia, lo que corresponde es cambiar su estado (Retirado), no
 * borrar: esos registros son la prueba de lo que pasó. El usuario de acceso, si
 * lo tenía, queda sin ficha y se desactiva desde Usuarios.
 */
export const eliminarColaborador = accion(
  { modulo: 'colaboradores', accion: 'ELIMINAR', schema: z.object({ id: z.uuid(), motivo: z.string().trim().min(5, 'Explica por qué se elimina.').max(300) }) },
  async ({ id, motivo }) => {
    const c = await prisma.colaborador.findUniqueOrThrow({
      where: { id },
      select: {
        nombres: true, apellidos: true, fotoPath: true, usuarioId: true,
        _count: {
          select: {
            contratos: true, contratosOps: true, liquidaciones: true, incapacidades: true, licencias: true, permisos: true,
            vacaciones: true, novedadesConcepto: true, bonificaciones: true, comisiones: true, prestamos: true, novedadesHoras: true,
            cuentasCobro: true, terminaciones: true, solicitudes: true, llamadosAtencion: true, procesosDisciplinarios: true, asignacionesActivo: true,
          },
        },
      },
    })
    const documentos = await prisma.documento.count({ where: { entidadTipo: 'Colaborador', entidadId: id } })
    const n = c._count
    const plural = (k: number, uno: string, varios: string) => (k === 1 ? `1 ${uno}` : `${k} ${varios}`)
    const tiene = [
      n.contratos + n.contratosOps > 0 ? plural(n.contratos + n.contratosOps, 'contrato', 'contratos') : null,
      n.liquidaciones > 0 ? plural(n.liquidaciones, 'nómina liquidada', 'nóminas liquidadas') : null,
      n.incapacidades + n.licencias + n.permisos + n.vacaciones + n.novedadesConcepto + n.bonificaciones + n.comisiones + n.prestamos + n.novedadesHoras > 0
        ? plural(n.incapacidades + n.licencias + n.permisos + n.vacaciones + n.novedadesConcepto + n.bonificaciones + n.comisiones + n.prestamos + n.novedadesHoras, 'novedad', 'novedades')
        : null,
      n.cuentasCobro > 0 ? plural(n.cuentasCobro, 'cuenta de cobro', 'cuentas de cobro') : null,
      n.solicitudes > 0 ? plural(n.solicitudes, 'solicitud', 'solicitudes') : null,
      n.terminaciones > 0 ? plural(n.terminaciones, 'terminación', 'terminaciones') : null,
      n.llamadosAtencion + n.procesosDisciplinarios > 0 ? plural(n.llamadosAtencion + n.procesosDisciplinarios, 'registro disciplinario', 'registros disciplinarios') : null,
      n.asignacionesActivo > 0 ? plural(n.asignacionesActivo, 'activo asignado', 'activos asignados') : null,
      documentos > 0 ? plural(documentos, 'documento', 'documentos') : null,
    ].filter((x): x is string => !!x)
    if (tiene.length > 0) {
      throw new ErrorNegocio(`No se puede eliminar: tiene ${tiene.join(', ')}. Una persona con historia no se borra; si se retiró, cambia su estado a Retirado desde Editar.`)
    }

    // Lo poco que puede tener una ficha sin historia: foto, estudios (con sus
    // certificados) y el vínculo con la evaluación de la que nació. Los archivos
    // se borran DESPUÉS de que la base aceptó el borrado: si otro módulo (SST,
    // comités…) todavía la referencia, la ficha queda intacta.
    const estudios = await prisma.educacionColaborador.findMany({ where: { colaboradorId: id }, select: { id: true } })
    const docsEdu = estudios.length
      ? await prisma.documento.findMany({ where: { entidadTipo: 'EducacionColaborador', entidadId: { in: estudios.map((e) => e.id) } }, select: { id: true } })
      : []
    await prisma.acuerdoEvaluacion.updateMany({ where: { colaboradorId: id }, data: { colaboradorId: null } })
    try {
      await dbAuditado.colaborador.delete({ where: { id } })
    } catch {
      throw new ErrorNegocio('No se puede eliminar: la ficha tiene registros relacionados en otros módulos (SST, activos, comités…). Si la persona se retiró, cambia su estado a Retirado desde Editar.')
    }
    for (const doc of docsEdu) await eliminarDocumento(doc.id).catch(() => {})
    if (c.fotoPath) {
      await eliminarArchivo(c.fotoPath).catch(() => {})
      await eliminarArchivo(rutaMiniatura(c.fotoPath)).catch(() => {})
    }
    await auditar('ELIMINAR', 'Colaborador', { registroId: id, descripcion: `Eliminado ${c.nombres} ${c.apellidos}: ${motivo}` })
    revalidatePath('/colaboradores')
    return { ok: true, teniaUsuario: !!c.usuarioId }
  },
)
