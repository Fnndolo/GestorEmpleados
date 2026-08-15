'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { accion, ErrorNegocio } from '@/server/accion'
import { parseFechaISO } from '@/lib/fechas'
import { diasHabilesRango } from '@/app/(app)/novedades/acciones'
import { generarCertificacion } from '@/server/certificaciones'
import { avisar, avisarPorRol } from '@/server/notificaciones/avisar'
import { miFichaSchema } from '@/lib/validaciones/colaborador'
import { TIPOS_LICENCIA, defLicencia, esDerecho } from '@/lib/licencias'
import { evaluarSolicitudVacaciones } from '@/server/vacaciones-reglas'
import { liquidarVacaciones, desgloseHtml } from '@/server/vacaciones-liquidacion'
import { usuarioDeColaborador } from '@/server/notificaciones/avisar'
import { fmtCOP } from '@/lib/moneda'
import type { UsuarioSesion } from '@/server/sesion'

const crearSolicitudSchema = z.object({
  tipo: z.enum(['VACACIONES', 'PERMISO', 'INCAPACIDAD', 'CERTIFICACION_LABORAL', 'LICENCIA']),
  // Vacaciones (rango) · Permiso (un solo día en fechaInicio) · Incapacidad (rango)
  fechaInicio: z.string().optional(),
  fechaFin: z.string().optional(),
  motivo: z.string().optional(),
  // Permiso: día completo u horas (desde-hasta)
  permisoTipo: z.enum(['DIA', 'HORAS']).optional(),
  horaInicio: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  horaFin: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  // Incapacidad
  incapacidadTipo: z.enum(['ENFERMEDAD_GENERAL', 'ACCIDENTE_TRABAJO', 'ENFERMEDAD_LABORAL', 'LICENCIA_MATERNIDAD', 'LICENCIA_PATERNIDAD']).optional(),
  entidad: z.string().optional(),
  // Licencia (rango). El tipo decide si es un derecho (se registra) o discrecional (se aprueba).
  licenciaTipo: z.enum(TIPOS_LICENCIA).optional(),
  // Certificación
  tipoCertificacion: z.enum(['SIMPLE', 'CON_SALARIO', 'CON_FUNCIONES', 'ENTIDAD_FINANCIERA']).optional(),
  dirigidaA: z.string().optional(),
  // Vacaciones anticipadas: el colaborador autoriza por escrito el descuento en caso
  // de retiro antes de causarlas (RIT art. 69 num. 4: toda deducción exige autorización
  // previa y escrita para cada caso).
  autorizaDescuentoAnticipadas: z.boolean().optional(),
})

/** Horas decimales entre dos "HH:MM" (mismo día). */
function horasEntre(ini: string, fin: string): number {
  const [hi, mi] = ini.split(':').map(Number)
  const [hf, mf] = fin.split(':').map(Number)
  return Math.max(0, Math.round(((hf * 60 + mf - (hi * 60 + mi)) / 60) * 10) / 10)
}

/** Días calendario inclusivos entre dos fechas ISO (yyyy-mm-dd). */
function diasCalendario(ini: string, fin: string): number {
  const a = Date.parse(`${ini}T00:00:00Z`)
  const b = Date.parse(`${fin}T00:00:00Z`)
  return Math.max(1, Math.floor((b - a) / 86_400_000) + 1)
}

async function colaboradorDe(usuario: UsuarioSesion): Promise<string> {
  if (!usuario.colaboradorId) throw new ErrorNegocio('Tu usuario no está vinculado a una ficha de colaborador.')
  return usuario.colaboradorId
}

/**
 * Segunda barrera (independiente del rol): solo un colaborador ACTIVO puede crear
 * trámites operativos. Cubre el caso del contrato a término fijo que vence por
 * fecha sin que se registre la terminación formal — así el aprobador nunca recibe
 * solicitudes de alguien ya desvinculado. La certificación laboral SÍ se permite
 * al retirado (dato legítimo de habeas data: la necesita para otro empleo/banco).
 */
async function exigirColaboradorActivo(colaboradorId: string): Promise<void> {
  const c = await prisma.colaborador.findUnique({ where: { id: colaboradorId }, select: { estado: true } })
  if (c?.estado !== 'ACTIVO') {
    throw new ErrorNegocio('Tu vínculo laboral no está activo: no puedes crear este tipo de solicitud. Si es un error, comunícate con Talento Humano.')
  }
}

/** Vacío → null (para no guardar cadenas vacías en campos opcionales). */
const vv = (s: string | undefined | null) => (s && s !== '' ? s : null)

/**
 * El PROPIO colaborador completa/actualiza su ficha desde el autoservicio. Solo
 * puede tocar SU registro y SOLO los campos de `miFichaSchema` (nunca identidad,
 * correo de acceso ni datos organizacionales/contractuales). Queda auditado.
 */
export const actualizarMiFicha = accion(
  { modulo: 'autoservicio', accion: 'CREAR', schema: miFichaSchema },
  async (d, usuario) => {
    const colaboradorId = await colaboradorDe(usuario)
    await dbAuditado.colaborador.update({
      where: { id: colaboradorId },
      data: {
        fechaExpedicionDoc: parseFechaISO(d.fechaExpedicionDoc || null),
        lugarExpedicionDoc: vv(d.lugarExpedicionDoc),
        fechaNacimiento: parseFechaISO(d.fechaNacimiento || null),
        lugarNacimiento: vv(d.lugarNacimiento),
        genero: (vv(d.genero) as 'MASCULINO' | null) ?? null,
        estadoCivil: (vv(d.estadoCivil) as 'SOLTERO' | null) ?? null,
        grupoSanguineo: (vv(d.grupoSanguineo) as 'A_POS' | null) ?? null,
        direccion: vv(d.direccion),
        ciudadResidenciaId: vv(d.ciudadResidenciaId),
        emergenciaNombre: vv(d.emergenciaNombre),
        emergenciaParentesco: vv(d.emergenciaParentesco),
        emergenciaTelefono: vv(d.emergenciaTelefono),
        nivelEducativoMax: (vv(d.nivelEducativoMax) as 'BACHILLER' | null) ?? null,
        epsId: vv(d.epsId),
        afpId: vv(d.afpId),
        fondoCesantiasId: vv(d.fondoCesantiasId),
        cajaCompensacionId: vv(d.cajaCompensacionId),
        arlId: vv(d.arlId),
        bancoId: vv(d.bancoId),
        tipoCuenta: (vv(d.tipoCuenta) as 'AHORROS' | null) ?? null,
        numeroCuenta: vv(d.numeroCuenta),
        tallaCamisa: vv(d.tallaCamisa),
        tallaPantalon: vv(d.tallaPantalon),
        tallaCalzado: vv(d.tallaCalzado),
      },
    })
    // Avisar a RRHH para que revise/valide la información aportada.
    const colab = await prisma.colaborador.findUnique({ where: { id: colaboradorId }, select: { nombres: true, apellidos: true } })
    await avisarPorRol(['Recursos Humanos', 'Administrador'], {
      evento: 'ficha_actualizada',
      titulo: 'Un colaborador completó su información',
      mensaje: `${colab?.nombres ?? ''} ${colab?.apellidos ?? ''} actualizó los datos de su ficha desde el autoservicio. Revísalos si corresponde.`,
      enlace: `/colaboradores/${colaboradorId}`,
      llamadoAccion: 'Ver la ficha',
    }).catch(() => {})
    revalidatePath('/autoservicio/mi-informacion')
    revalidatePath(`/colaboradores/${colaboradorId}`)
    return { ok: true }
  },
)

export const crearSolicitud = accion(
  { modulo: 'autoservicio', accion: 'CREAR', schema: crearSolicitudSchema },
  async (d, usuario) => {
    const colaboradorId = await colaboradorDe(usuario)
    // Vacaciones, permisos, licencias e incapacidades solo con vínculo activo.
    // La certificación laboral queda disponible aunque esté retirado.
    if (d.tipo !== 'CERTIFICACION_LABORAL') await exigirColaboradorActivo(colaboradorId)
    if (d.tipo === 'LICENCIA' && !d.licenciaTipo) throw new ErrorNegocio('Indica el tipo de licencia.')

    // Vacaciones: aplicar las reglas del RIT (cap. 9) antes de crear la solicitud.
    let datosSolicitud: Record<string, unknown> = { ...d }
    if (d.tipo === 'VACACIONES') {
      if (!d.fechaInicio || !d.fechaFin) throw new ErrorNegocio('Indica la fecha de inicio y fin de tus vacaciones.')
      if (d.fechaFin < d.fechaInicio) throw new ErrorNegocio('La fecha de fin no puede ser anterior a la de inicio.')
      const ev = await evaluarSolicitudVacaciones(colaboradorId, d.fechaInicio, d.fechaFin)
      if (ev.dias === 0) throw new ErrorNegocio('El rango elegido no contiene días hábiles.')
      if (ev.anticipadas && !d.autorizaDescuentoAnticipadas) {
        throw new ErrorNegocio(
          `Solicitas ${ev.dias} días hábiles pero tu saldo causado es de ${ev.saldo}. Los ${ev.diasAnticipados} días serían anticipados: debes autorizar por escrito su descuento en caso de retiro antes de causarlos (RIT art. 69 num. 4).`,
        )
      }
      // La evaluación queda en la solicitud para que el aprobador la vea y quede auditada.
      datosSolicitud = { ...d, calculoVacaciones: ev }
    }
    const colab = await prisma.colaborador.findUniqueOrThrow({
      where: { id: colaboradorId },
      select: { esRepresentanteLegal: true, jefeInmediatoId: true, jefeInmediato: { select: { usuario: { select: { rol: { select: { nombre: true } } } } } } },
    })

    const solicitud = await dbAuditado.solicitud.create({
      data: { colaboradorId, tipo: d.tipo, datos: datosSolicitud as object, estado: 'EN_APROBACION' },
    })

    // Cúspide de KUPOCELL (sin aprobador superior): el REPRESENTANTE LEGAL y la
    // SUBGERENCIA. Sus solicitudes se AUTO-REGISTRAN con constancia (no se
    // aprueban/rechazan) y quedan auditadas.
    const esCuspide = colab.esRepresentanteLegal || usuario.rolNombre === 'Subgerencia'
    if (esCuspide) {
      const quien = colab.esRepresentanteLegal ? 'el representante legal' : 'la Subgerencia'
      await ejecutarEfecto(solicitud.id, usuario.id, {
        constancia: `Auto-registrada por ${quien} (máxima autoridad, sin aprobación superior)`,
      })
      revalidatePath('/autoservicio')
      return { id: solicitud.id }
    }

    // Pasos de aprobación según el tipo:
    //  - Incapacidad: la valida y registra Talento Humano (no se "aprueba" al jefe);
    //    el jefe solo recibe aviso informativo.
    //  - Licencia por DERECHO (luto, maternidad, paternidad, calamidad, votación): la ley
    //    la concede, así que NO pasa por el jefe — negarla sería una falta del empleador.
    //    Talento Humano solo valida el soporte y la registra; el jefe recibe aviso.
    //  - Licencia DISCRECIONAL (matrimonio, estudio, no remunerada…): sí se aprueba.
    //  - Resto: jefe inmediato (nivel área, si existe) → Talento Humano (nivel empresa).
    // Si el jefe inmediato YA tiene autoridad de empresa (Talento Humano/Gerencia/Admin),
    // su única aprobación cubre ambos niveles y no se agrega un paso de Talento Humano aparte
    // (p. ej. Andrés cuyo jefe inmediato es Laura, administradora/Talento Humano).
    const ROLES_EMPRESA = ['Administrador', 'Recursos Humanos', 'Subgerencia']
    const jefeEsEmpresa = !!colab.jefeInmediato?.usuario?.rol && ROLES_EMPRESA.includes(colab.jefeInmediato.usuario.rol.nombre)
    // "Registro": lo valida Talento Humano, no lo decide el jefe.
    const esRegistro = d.tipo === 'INCAPACIDAD' || (d.tipo === 'LICENCIA' && esDerecho(d.licenciaTipo!))
    const tieneJefeStep = !esRegistro && !!colab.jefeInmediatoId

    const pasos: { orden: number; usaJefeInmediato: boolean; rolAprobador: string | null }[] = []
    let orden = 1
    if (tieneJefeStep) pasos.push({ orden: orden++, usaJefeInmediato: true, rolAprobador: null })
    if (!(tieneJefeStep && jefeEsEmpresa)) {
      pasos.push({ orden: orden++, usaJefeInmediato: false, rolAprobador: 'Recursos Humanos' })
    }

    await prisma.pasoAprobacion.createMany({
      data: pasos.map((p) => ({ solicitudId: solicitud.id, orden: p.orden, usaJefeInmediato: p.usaJefeInmediato, rolAprobador: p.rolAprobador })),
    })

    // Avisar a los aprobadores del primer paso
    await avisarAprobadoresDelPaso(solicitud.id, 1)

    // Registro (incapacidad o licencia por derecho): avisar al jefe, pero solo para
    // informarle — no decide. Se le dice explícitamente para que no la "espere aprobar".
    if (esRegistro && colab.jefeInmediatoId) {
      const jefe = await prisma.colaborador.findUnique({ where: { id: colab.jefeInmediatoId }, select: { usuarioId: true } })
      const yo = await prisma.colaborador.findUnique({ where: { id: colaboradorId }, select: { nombres: true, apellidos: true } })
      if (jefe?.usuarioId) {
        const quien = `${yo?.nombres ?? ''} ${yo?.apellidos ?? ''}`.trim()
        const esLic = d.tipo === 'LICENCIA'
        await avisar(jefe.usuarioId, {
          titulo: esLic ? 'Tu colaborador reportó una licencia de ley' : 'Tu colaborador reportó una incapacidad',
          mensaje: esLic
            ? `${quien} reportó una licencia de ${defLicencia(d.licenciaTipo!).label.toLowerCase()}. Es un derecho de ley, no requiere tu aprobación: Talento Humano valida el soporte y la registra. Te avisamos para que organices el trabajo del área.`
            : `${quien} reportó una incapacidad. Talento Humano la validará y registrará.`,
          enlace: '/autoservicio/aprobaciones',
          evento: esLic ? 'licencia_reportada' : 'incapacidad_reportada',
        })
      }
    }
    revalidatePath('/autoservicio')
    return { id: solicitud.id }
  },
)

async function avisarAprobadoresDelPaso(solicitudId: string, orden: number) {
  const paso = await prisma.pasoAprobacion.findFirst({ where: { solicitudId, orden } })
  if (!paso) return
  const solicitud = await prisma.solicitud.findUniqueOrThrow({
    where: { id: solicitudId },
    include: { colaborador: { select: { nombres: true, apellidos: true, jefeInmediatoId: true } } },
  })
  const quien = `${solicitud.colaborador.nombres} ${solicitud.colaborador.apellidos}`
  // Una licencia por derecho no se aprueba: se valida el soporte y se registra. El
  // aviso lo dice así para no inducir a "negar" algo que la ley ya concedió.
  const datosSol = solicitud.datos as Record<string, string>
  const esDerechoLic = solicitud.tipo === 'LICENCIA' && !!datosSol.licenciaTipo && esDerecho(datosSol.licenciaTipo)
  const opts = esDerechoLic
    ? {
        titulo: `Licencia de ${defLicencia(datosSol.licenciaTipo).label.toLowerCase()} por validar`,
        mensaje: `${quien} reportó una licencia de ley. No se aprueba ni se niega: valida el soporte y regístrala.`,
        enlace: '/autoservicio/aprobaciones', llamadoAccion: 'Validar el soporte', evento: 'solicitud_creada',
      }
    : {
        titulo: `Solicitud de ${etiquetaTipo(solicitud.tipo)} por aprobar`,
        mensaje: `${quien} solicita tu aprobación. Entra a la plataforma para revisarla y decidir.`,
        enlace: '/autoservicio/aprobaciones', llamadoAccion: 'Revisar la solicitud', evento: 'solicitud_creada',
      }

  if (paso.usaJefeInmediato && solicitud.colaborador.jefeInmediatoId) {
    const jefe = await prisma.colaborador.findUnique({
      where: { id: solicitud.colaborador.jefeInmediatoId },
      select: { usuarioId: true },
    })
    if (jefe?.usuarioId) await avisar(jefe.usuarioId, opts)
  } else if (paso.rolAprobador) {
    // Talento Humano: RRHH + Subgerencia + Administrador (la coordinadora de TH es administradora)
    const usuarios = await prisma.user.findMany({
      where: { estado: 'ACTIVO', rol: { nombre: { in: [paso.rolAprobador, 'Subgerencia', 'Administrador'] } } },
      select: { id: true },
    })
    for (const u of usuarios) await avisar(u.id, opts)
  }
}

export const resolverPaso = accion(
  {
    modulo: 'autoservicio',
    accion: 'APROBAR',
    schema: z.object({
      pasoId: z.uuid(),
      aprobar: z.boolean(),
      comentario: z.string().max(500).optional(),
      // El jefe puede aprobar proponiendo otras fechas
      nuevaFechaInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
      nuevaFechaFin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
    }),
  },
  async (d, usuario) => {
    const paso = await prisma.pasoAprobacion.findUniqueOrThrow({
      where: { id: d.pasoId },
      include: { solicitud: { include: { colaborador: true, pasos: { orderBy: { orden: 'asc' } } } } },
    })
    if (paso.estado !== 'PENDIENTE') throw new ErrorNegocio('Este paso ya fue resuelto.')
    if (paso.solicitud.estado === 'EN_NEGOCIACION') {
      throw new ErrorNegocio('Hay una contrapropuesta de fechas pendiente de respuesta del colaborador; espera su decisión.')
    }
    if (paso.solicitud.estado === 'DEVUELTA') {
      throw new ErrorNegocio('La solicitud está devuelta al colaborador para corregir el soporte; espera la corrección.')
    }

    // Segregación de funciones: nadie aprueba su propia solicitud (ni siquiera Admin/RRHH).
    // El único caso sin aprobador superior es el representante legal, y ese ni siquiera
    // llega aquí: sus solicitudes se auto-registran al crearse.
    if (usuario.colaboradorId && paso.solicitud.colaboradorId === usuario.colaboradorId) {
      throw new ErrorNegocio('No puedes aprobar tu propia solicitud; debe resolverla otra persona de nivel superior.')
    }

    const puede = await usuarioPuedeResolver(usuario, paso)
    if (!puede) throw new ErrorNegocio('No tienes permiso para aprobar este paso.')

    // Una licencia que la ley concede (luto, maternidad, paternidad, calamidad,
    // votación) no se niega por decisión del empleador: negarla es una falta. Lo
    // único que puede fallar es que el soporte no acredite el hecho, y eso hay que
    // dejarlo escrito y auditado.
    const datosPaso = paso.solicitud.datos as Record<string, string>
    const licDerecho = paso.solicitud.tipo === 'LICENCIA' && !!datosPaso.licenciaTipo && esDerecho(datosPaso.licenciaTipo)
    if (licDerecho && !d.aprobar && !d.comentario?.trim()) {
      throw new ErrorNegocio(
        'Una licencia de ley no se niega por decisión. Si el soporte no acredita el hecho, explica por escrito qué falta.',
      )
    }

    // Si propone otras fechas, actualizar la solicitud y avisar al solicitante del cambio
    let notaCambioFechas = ''
    if (d.aprobar && (d.nuevaFechaInicio || d.nuevaFechaFin)) {
      const datos = { ...(paso.solicitud.datos as Record<string, unknown>) } as Record<string, unknown> & { fechaInicio?: string; fechaFin?: string }
      if (d.nuevaFechaInicio) datos.fechaInicio = d.nuevaFechaInicio
      if (d.nuevaFechaFin) datos.fechaFin = d.nuevaFechaFin
      // Si cambian las fechas de unas vacaciones, se recalcula la evaluación del RIT
      // para que el registro y los pasos siguientes vean el saldo real.
      if (paso.solicitud.tipo === 'VACACIONES' && datos.fechaInicio && datos.fechaFin) {
        datos.calculoVacaciones = await evaluarSolicitudVacaciones(paso.solicitud.colaboradorId, datos.fechaInicio, datos.fechaFin)
      }
      await dbAuditado.solicitud.update({ where: { id: paso.solicitudId }, data: { datos: datos as object } })
      notaCambioFechas = ` Tu jefe propuso nuevas fechas: ${datos.fechaInicio ?? ''}${datos.fechaFin ? ` a ${datos.fechaFin}` : ''}.`
      await avisarSolicitante(paso.solicitudId, 'Tu solicitud fue aprobada con cambio de fechas', `${d.comentario ?? ''}${notaCambioFechas}`)
    }

    // La licencia por derecho no se "rechaza": queda DEVUELTA por soporte insuficiente.
    // El paso sigue PENDIENTE: cuando el colaborador corrija el soporte, la misma
    // solicitud vuelve a esta bandeja sin crear un expediente nuevo.
    if (licDerecho && !d.aprobar) {
      await dbAuditado.solicitud.update({
        where: { id: paso.solicitudId },
        data: { estado: 'DEVUELTA', resultado: `Soporte no validado: ${d.comentario}` },
      })
      await avisarSolicitante(
        paso.solicitudId,
        'Tu licencia necesita soporte',
        `Tu licencia es un derecho y no se está negando, pero el soporte no pudo validarse: ${d.comentario}. Corrígelo desde tu autoservicio: la misma solicitud sigue abierta.`,
      )
      revalidatePath('/autoservicio')
      revalidatePath('/autoservicio/aprobaciones')
      return { ok: true }
    }

    await dbAuditado.pasoAprobacion.update({
      where: { id: d.pasoId },
      data: {
        estado: d.aprobar ? 'APROBADO' : 'RECHAZADO', decididoPorId: usuario.id, decididoEn: new Date(),
        comentario: [d.comentario, notaCambioFechas].filter(Boolean).join(' ').trim() || null,
      },
    })

    if (!d.aprobar) {
      await dbAuditado.solicitud.update({
        where: { id: paso.solicitudId },
        data: { estado: 'RECHAZADA', resultado: d.comentario ?? 'Rechazada' },
      })
      await avisarSolicitante(
        paso.solicitudId,
        'Tu solicitud fue rechazada',
        d.comentario ?? 'Tu jefe inmediato rechazó la solicitud.',
      )
      revalidatePath('/autoservicio')
      revalidatePath('/autoservicio/aprobaciones')
      return { ok: true }
    }

    const siguiente = paso.solicitud.pasos.find((p) => p.orden > paso.orden && p.estado === 'PENDIENTE')
    if (siguiente) {
      await avisarAprobadoresDelPaso(paso.solicitudId, siguiente.orden)
    } else {
      await ejecutarEfecto(paso.solicitudId, usuario.id)
    }
    revalidatePath('/autoservicio')
    revalidatePath('/autoservicio/aprobaciones')
    return { ok: true }
  },
)

async function usuarioPuedeResolver(usuario: UsuarioSesion, paso: { usaJefeInmediato: boolean; rolAprobador: string | null; solicitud: { colaborador: { jefeInmediatoId: string | null } } }): Promise<boolean> {
  // RRHH/Admin/Subgerencia pueden resolver cualquier paso (pueden saltar el nivel 1)
  if (['Administrador', 'Recursos Humanos', 'Subgerencia'].includes(usuario.rolNombre)) return true
  if (paso.usaJefeInmediato) {
    return usuario.colaboradorId != null && usuario.colaboradorId === paso.solicitud.colaborador.jefeInmediatoId
  }
  return paso.rolAprobador != null && usuario.rolNombre === paso.rolAprobador
}

async function ejecutarEfecto(solicitudId: string, usuarioId: string, opts?: { constancia?: string }) {
  const s = await prisma.solicitud.findUniqueOrThrow({ where: { id: solicitudId } })
  const datos = s.datos as Record<string, string>
  let resultado = 'Aprobada'

  if (s.tipo === 'VACACIONES' && datos.fechaInicio && datos.fechaFin) {
    const dias = await diasHabilesRango(datos.fechaInicio, datos.fechaFin)
    const datosObj = s.datos as Record<string, unknown>
    const calculo = datosObj.calculoVacaciones as { anticipadas?: boolean; diasAnticipados?: number } | undefined
    // Constancia de vacaciones anticipadas con autorización de descuento (RIT art. 69 num. 4):
    // habilita el descuento en la liquidación definitiva si el retiro ocurre antes de causarlas.
    const observaciones = calculo?.anticipadas && datosObj.autorizaDescuentoAnticipadas === true
      ? `Anticipadas: ${calculo.diasAnticipados} día(s) sin causar. El colaborador autorizó por escrito en la solicitud el descuento en caso de retiro (RIT art. 69 num. 4).`
      : null
    await prisma.vacaciones.create({
      data: {
        colaboradorId: s.colaboradorId,
        fechaInicio: parseFechaISO(datos.fechaInicio)!, fechaFin: parseFechaISO(datos.fechaFin)!,
        diasHabiles: dias, estado: 'APROBADA', solicitudId, observaciones,
      },
    })
    resultado = `Vacaciones aprobadas (${dias} días hábiles${calculo?.anticipadas ? `, ${calculo.diasAnticipados} anticipados` : ''})`
    // Liquidación del pago (RIT art. 42) + correo con el desglose (RIT arts. 34 y 35).
    const liq = await liquidarVacaciones(s.colaboradorId, dias)
    if (liq) {
      await dbAuditado.solicitud.update({
        where: { id: solicitudId },
        data: { datos: { ...datosObj, liquidacionVacaciones: liq } as object },
      })
      resultado += ` · pago liquidado: ${fmtCOP(liq.total)}`
      const usuarioId = await usuarioDeColaborador(s.colaboradorId)
      if (usuarioId && !opts?.constancia) {
        await avisar(usuarioId, {
          titulo: 'Vacaciones aprobadas: desglose de tu pago',
          mensaje: desgloseHtml(liq, datos.fechaInicio, datos.fechaFin),
          enlace: '/autoservicio', llamadoAccion: 'Ver mi solicitud', evento: 'vacaciones_liquidadas',
        })
      }
    }
  } else if (s.tipo === 'PERMISO' && datos.fechaInicio) {
    const porHoras = datos.permisoTipo === 'HORAS' && !!datos.horaInicio && !!datos.horaFin
    await prisma.permiso.create({
      data: {
        colaboradorId: s.colaboradorId, fecha: parseFechaISO(datos.fechaInicio)!,
        diaCompleto: !porHoras,
        horaInicio: porHoras ? datos.horaInicio : null,
        horaFin: porHoras ? datos.horaFin : null,
        horas: porHoras ? horasEntre(datos.horaInicio!, datos.horaFin!) : null,
        motivo: datos.motivo ?? 'Permiso', remunerado: true, solicitudId,
      },
    })
    resultado = porHoras ? `Permiso aprobado (${datos.horaInicio}–${datos.horaFin})` : 'Permiso aprobado (día completo)'
  } else if (s.tipo === 'INCAPACIDAD' && datos.fechaInicio && datos.fechaFin) {
    const dias = diasCalendario(datos.fechaInicio, datos.fechaFin)
    await prisma.incapacidad.create({
      data: {
        colaboradorId: s.colaboradorId,
        tipo: (datos.incapacidadTipo as 'ENFERMEDAD_GENERAL') ?? 'ENFERMEDAD_GENERAL',
        fechaInicio: parseFechaISO(datos.fechaInicio)!, fechaFin: parseFechaISO(datos.fechaFin)!,
        dias, entidad: datos.entidad || null, observaciones: datos.motivo || null, solicitudId,
      },
    })
    resultado = `Incapacidad registrada (${dias} día(s))`
  } else if (s.tipo === 'LICENCIA' && datos.fechaInicio && datos.fechaFin) {
    const def = defLicencia(datos.licenciaTipo)
    // El luto y el compensatorio de votación los cuenta la ley en días HÁBILES;
    // maternidad y paternidad van en semanas calendario.
    const enHabiles = def.tipo === 'LUTO' || def.tipo === 'DIA_COMPENSATORIO_VOTACION'
    const dias = enHabiles
      ? await diasHabilesRango(datos.fechaInicio, datos.fechaFin)
      : diasCalendario(datos.fechaInicio, datos.fechaFin)
    await prisma.licencia.create({
      data: {
        colaboradorId: s.colaboradorId,
        tipo: def.tipo,
        fechaInicio: parseFechaISO(datos.fechaInicio)!, fechaFin: parseFechaISO(datos.fechaFin)!,
        dias, remunerada: def.remunerada,
        observaciones: datos.motivo || null, solicitudId,
      },
    })
    const unidad = enHabiles ? 'día(s) hábil(es)' : 'día(s)'
    resultado = def.derecho
      ? `Licencia de ${def.label.toLowerCase()} registrada (${dias} ${unidad}, ${def.remunerada ? 'remunerada' : 'no remunerada'})`
      : `Licencia de ${def.label.toLowerCase()} aprobada (${dias} ${unidad}, ${def.remunerada ? 'remunerada' : 'no remunerada'})`
  } else if (s.tipo === 'CERTIFICACION_LABORAL') {
    const { documentoId } = await generarCertificacion({
      colaboradorId: s.colaboradorId,
      tipo: (datos.tipoCertificacion as 'SIMPLE') ?? 'SIMPLE',
      dirigidaA: datos.dirigidaA ?? null,
      generadoPorId: usuarioId,
    })
    resultado = `Certificación generada:${documentoId}`
  }

  const resultadoFinal = opts?.constancia ? `${resultado} · ${opts.constancia}` : resultado
  await dbAuditado.solicitud.update({ where: { id: solicitudId }, data: { estado: 'APROBADA', resultado: resultadoFinal } })
  // En auto-registro (representante legal) no se notifica a sí mismo.
  if (!opts?.constancia) await avisarSolicitante(solicitudId, 'Tu solicitud fue aprobada', resultado)
}

/**
 * Emite la certificación de una solicitud aprobada (último paso): genera el PDF
 * membretado (con firma opcional) o adjunta un certificado ya subido, y lo envía
 * al colaborador. Si el aprobador no la emite ahora, la solicitud queda pendiente.
 */
export const emitirCertificacion = accion(
  {
    modulo: 'autoservicio',
    accion: 'APROBAR',
    schema: z.object({
      pasoId: z.uuid(),
      modo: z.enum(['GENERAR', 'SUBIR']),
      firmaDataUri: z.string().optional(),
      documentoId: z.uuid().optional(),
    }),
  },
  async (d, usuario) => {
    const paso = await prisma.pasoAprobacion.findUniqueOrThrow({
      where: { id: d.pasoId },
      include: { solicitud: { include: { colaborador: true, pasos: { orderBy: { orden: 'asc' } } } } },
    })
    if (paso.estado !== 'PENDIENTE') throw new ErrorNegocio('Este paso ya fue resuelto.')
    if (paso.solicitud.tipo !== 'CERTIFICACION_LABORAL') throw new ErrorNegocio('Esta solicitud no es una certificación.')
    if (!(await usuarioPuedeResolver(usuario, paso))) throw new ErrorNegocio('No tienes permiso para emitir esta certificación.')
    if (paso.solicitud.pasos.some((p) => p.orden < paso.orden && p.estado === 'PENDIENTE')) throw new ErrorNegocio('Faltan aprobaciones previas.')
    if (paso.solicitud.pasos.some((p) => p.orden > paso.orden && p.estado === 'PENDIENTE')) throw new ErrorNegocio('Aún hay pasos posteriores; aprueba para avanzar.')

    const datos = paso.solicitud.datos as Record<string, string>
    let documentoId = d.documentoId ?? null
    if (d.modo === 'GENERAR') {
      const r = await generarCertificacion({
        colaboradorId: paso.solicitud.colaboradorId,
        tipo: (datos.tipoCertificacion as 'SIMPLE') ?? 'SIMPLE',
        dirigidaA: datos.dirigidaA ?? null,
        generadoPorId: usuario.id,
        firmaDataUri: d.firmaDataUri || null,
      })
      documentoId = r.documentoId
    } else if (!documentoId) {
      throw new ErrorNegocio('Sube el certificado antes de emitir.')
    }

    await dbAuditado.pasoAprobacion.update({ where: { id: d.pasoId }, data: { estado: 'APROBADO', decididoPorId: usuario.id, decididoEn: new Date() } })
    await dbAuditado.solicitud.update({ where: { id: paso.solicitudId }, data: { estado: 'APROBADA', resultado: `Certificación generada:${documentoId}` } })
    await avisarSolicitante(paso.solicitudId, 'Tu certificación está lista', 'Tu certificación laboral fue emitida. Ya puedes descargarla desde tu autoservicio.')
    revalidatePath('/autoservicio')
    revalidatePath('/autoservicio/aprobaciones')
    return { documentoId }
  },
)

/**
 * Contrapropuesta de fechas (Flujo 1 — Camino B). El jefe no aprueba ni rechaza:
 * propone otras fechas y la solicitud queda EN_NEGOCIACION hasta que el colaborador
 * responda. Sustento: RIT art. 29 lit. c (el disfrute se concierta entre trabajador
 * y jefe inmediato) y art. 34 (la empresa fija la época procurando descanso efectivo
 * y continuidad del servicio).
 */
export const proponerFechas = accion(
  {
    modulo: 'autoservicio',
    accion: 'APROBAR',
    schema: z.object({
      pasoId: z.uuid(),
      fechaInicio: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      fechaFin: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      comentario: z.string().max(500).optional(),
    }),
  },
  async (d, usuario) => {
    const paso = await prisma.pasoAprobacion.findUniqueOrThrow({
      where: { id: d.pasoId },
      include: { solicitud: { include: { colaborador: true, pasos: { orderBy: { orden: 'asc' } } } } },
    })
    if (paso.estado !== 'PENDIENTE') throw new ErrorNegocio('Este paso ya fue resuelto.')
    if (paso.solicitud.tipo !== 'VACACIONES') throw new ErrorNegocio('La contrapropuesta de fechas solo aplica a vacaciones.')
    if (paso.solicitud.estado === 'EN_NEGOCIACION') throw new ErrorNegocio('Ya hay una contrapropuesta pendiente de respuesta.')
    if (usuario.colaboradorId && paso.solicitud.colaboradorId === usuario.colaboradorId) {
      throw new ErrorNegocio('No puedes negociar tu propia solicitud.')
    }
    if (!(await usuarioPuedeResolver(usuario, paso))) throw new ErrorNegocio('No tienes permiso para proponer fechas en este paso.')
    if (d.fechaFin < d.fechaInicio) throw new ErrorNegocio('La fecha de fin no puede ser anterior a la de inicio.')

    const datos = { ...(paso.solicitud.datos as Record<string, unknown>) }
    datos.contrapropuesta = {
      fechaInicio: d.fechaInicio,
      fechaFin: d.fechaFin,
      comentario: d.comentario ?? null,
      propuestaPorId: usuario.id,
      pasoId: d.pasoId,
    }
    await dbAuditado.solicitud.update({
      where: { id: paso.solicitudId },
      data: { estado: 'EN_NEGOCIACION', datos: datos as object },
    })
    await avisarSolicitante(
      paso.solicitudId,
      'Tu jefe propone otras fechas de vacaciones',
      `Por necesidades del servicio, se proponen las fechas ${d.fechaInicio} a ${d.fechaFin} (RIT art. 34).${d.comentario ? ` Comentario: ${d.comentario}` : ''} Entra a tu autoservicio para aceptarlas o rechazarlas.`,
    )
    revalidatePath('/autoservicio')
    revalidatePath('/autoservicio/aprobaciones')
    return { ok: true }
  },
)

/**
 * Respuesta del colaborador a la contrapropuesta. Si acepta, las nuevas fechas
 * quedan concertadas (RIT art. 29 lit. c): el paso del proponente se marca aprobado
 * y la solicitud sigue su circuito normal. Si la rechaza, vuelve al aprobador con
 * las fechas originales para que decida (aprobar, rechazar o volver a proponer).
 */
export const responderContrapropuesta = accion(
  {
    modulo: 'autoservicio',
    accion: 'CREAR',
    schema: z.object({ solicitudId: z.uuid(), aceptar: z.boolean(), comentario: z.string().max(500).optional() }),
  },
  async (d, usuario) => {
    const s = await prisma.solicitud.findUniqueOrThrow({
      where: { id: d.solicitudId },
      include: { pasos: { orderBy: { orden: 'asc' } } },
    })
    if (s.colaboradorId !== usuario.colaboradorId) throw new ErrorNegocio('Esta solicitud no es tuya.')
    if (s.estado !== 'EN_NEGOCIACION') throw new ErrorNegocio('Esta solicitud no tiene una contrapropuesta pendiente.')
    const datos = { ...(s.datos as Record<string, unknown>) }
    const cp = datos.contrapropuesta as { fechaInicio: string; fechaFin: string; propuestaPorId: string; pasoId: string } | undefined
    if (!cp) throw new ErrorNegocio('No se encontró la contrapropuesta.')

    if (d.aceptar) {
      datos.fechaInicio = cp.fechaInicio
      datos.fechaFin = cp.fechaFin
      datos.calculoVacaciones = await evaluarSolicitudVacaciones(s.colaboradorId, cp.fechaInicio, cp.fechaFin)
      datos.contrapropuesta = { ...cp, aceptada: true, respuesta: d.comentario ?? null }
      await dbAuditado.solicitud.update({ where: { id: s.id }, data: { estado: 'EN_APROBACION', datos: datos as object } })
      // El proponente ya concertó estas fechas: su paso queda aprobado y se avanza.
      const paso = s.pasos.find((p) => p.id === cp.pasoId && p.estado === 'PENDIENTE')
      if (paso) {
        await dbAuditado.pasoAprobacion.update({
          where: { id: paso.id },
          data: {
            estado: 'APROBADO', decididoPorId: cp.propuestaPorId, decididoEn: new Date(),
            comentario: `Fechas concertadas con el colaborador: ${cp.fechaInicio} a ${cp.fechaFin} (RIT art. 29 lit. c).`,
          },
        })
        const siguiente = s.pasos.find((p) => p.orden > paso.orden && p.estado === 'PENDIENTE')
        if (siguiente) {
          await avisarAprobadoresDelPaso(s.id, siguiente.orden)
        } else {
          await ejecutarEfecto(s.id, cp.propuestaPorId)
        }
      }
      await avisarUsuario(cp.propuestaPorId, 'Contrapropuesta aceptada', 'El colaborador aceptó las fechas propuestas; la solicitud continúa su trámite.')
    } else {
      datos.contrapropuesta = { ...cp, aceptada: false, respuesta: d.comentario ?? null }
      await dbAuditado.solicitud.update({ where: { id: s.id }, data: { estado: 'EN_APROBACION', datos: datos as object } })
      await avisarUsuario(
        cp.propuestaPorId,
        'Contrapropuesta rechazada',
        `El colaborador no aceptó las fechas propuestas${d.comentario ? `: ${d.comentario}` : '.'} La solicitud vuelve a tu bandeja con las fechas originales para que decidas.`,
      )
    }
    revalidatePath('/autoservicio')
    revalidatePath('/autoservicio/aprobaciones')
    return { ok: true }
  },
)

async function avisarUsuario(usuarioId: string, titulo: string, mensaje: string) {
  await avisar(usuarioId, { titulo, mensaje, enlace: '/autoservicio/aprobaciones', evento: 'solicitud_resuelta' })
}

export const cancelarSolicitud = accion(
  { modulo: 'autoservicio', accion: 'CREAR', schema: z.object({ id: z.uuid() }) },
  async ({ id }, usuario) => {
    const s = await prisma.solicitud.findUniqueOrThrow({ where: { id } })
    if (s.colaboradorId !== usuario.colaboradorId) throw new ErrorNegocio('No puedes cancelar esta solicitud.')
    if (s.estado === 'APROBADA' || s.estado === 'RECHAZADA') throw new ErrorNegocio('La solicitud ya fue resuelta.')
    await dbAuditado.solicitud.update({ where: { id }, data: { estado: 'CANCELADA' } })
    revalidatePath('/autoservicio')
  },
)

/**
 * Corrección de soporte de una licencia DEVUELTA: el colaborador adjunta el nuevo
 * archivo (vía /api/documentos/subir, antes de llamar aquí) y la MISMA solicitud
 * vuelve al paso de validación pendiente — no se crea un expediente nuevo.
 */
export const corregirMiSoporte = accion(
  { modulo: 'autoservicio', accion: 'CREAR', schema: z.object({ solicitudId: z.uuid() }) },
  async (d, usuario) => {
    const s = await prisma.solicitud.findUniqueOrThrow({
      where: { id: d.solicitudId },
      include: { pasos: { orderBy: { orden: 'asc' } } },
    })
    if (s.colaboradorId !== usuario.colaboradorId) throw new ErrorNegocio('Esta solicitud no es tuya.')
    if (s.estado !== 'DEVUELTA') throw new ErrorNegocio('Esta solicitud no está devuelta para corrección.')

    const datos = { ...(s.datos as Record<string, unknown>) }
    // Rastro para el validador: la solicitud vuelve con soporte corregido.
    datos.soporteCorregidoEn = new Date().toISOString()
    await dbAuditado.solicitud.update({
      where: { id: s.id },
      data: { estado: 'EN_APROBACION', resultado: null, datos: datos as object },
    })

    const paso = s.pasos.find((p) => p.estado === 'PENDIENTE')
    if (paso) await avisarAprobadoresDelPaso(s.id, paso.orden)
    revalidatePath('/autoservicio')
    revalidatePath('/autoservicio/aprobaciones')
    return { ok: true }
  },
)

async function avisarSolicitante(solicitudId: string, titulo: string, mensaje: string) {
  const s = await prisma.solicitud.findUniqueOrThrow({
    where: { id: solicitudId },
    include: { colaborador: { select: { usuarioId: true } } },
  })
  if (s.colaborador.usuarioId) await avisar(s.colaborador.usuarioId, { titulo, mensaje, enlace: '/autoservicio', llamadoAccion: 'Ver mi solicitud', evento: 'solicitud_resuelta' })
}

function etiquetaTipo(tipo: string): string {
  return tipo === 'VACACIONES' ? 'vacaciones' : tipo === 'PERMISO' ? 'permiso'
    : tipo === 'INCAPACIDAD' ? 'incapacidad' : tipo === 'LICENCIA' ? 'licencia' : 'certificación'
}
