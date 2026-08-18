'use server'

import { createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dbAuditado, auditar } from '@/lib/auditoria'
import { accion, ErrorNegocio } from '@/server/accion'
import { subirArchivo } from '@/server/storage'
import { enviarCorreo } from '@/server/notificaciones/correo'
import { crearUsuarioColaborador } from '@/server/usuarios'
import { renderAcuerdoEvaluacion } from '@/server/pdf/acuerdo-evaluacion'
import { parseFechaISO, hoyBogota } from '@/lib/fechas'
import {
  acuerdoEvaluacionSchema,
  decisionAcuerdoSchema,
  subirAcuerdoFirmadoSchema,
} from '@/lib/validaciones/acuerdo-evaluacion'

const RUTA = '/contratos/acuerdos'
const v = (s: string | undefined | null) => (s && s !== '' ? s : null)

/** Serie EV-###, igual criterio que los OPS: consecutivo sobre el mayor existente. */
async function siguienteNumero(): Promise<string> {
  const previos = await prisma.acuerdoEvaluacion.findMany({
    where: { numero: { startsWith: 'EV-' } },
    select: { numero: true },
  })
  const mayor = previos.reduce((m, a) => {
    const n = parseInt(a.numero.slice(3), 10)
    return Number.isFinite(n) && n > m ? n : m
  }, 0)
  return `EV-${String(mayor + 1).padStart(3, '0')}`
}

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]
const UNIDADES = [
  'cero', 'uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez',
  'once', 'doce', 'trece', 'catorce', 'quince', 'dieciséis', 'diecisiete', 'dieciocho',
  'diecinueve', 'veinte', 'veintiuno', 'veintidós', 'veintitrés', 'veinticuatro', 'veinticinco',
  'veintiséis', 'veintisiete', 'veintiocho', 'veintinueve', 'treinta', 'treinta y uno',
]

/**
 * Fecha como se escribe en un documento legal: "seis (06) de julio de 2026".
 * El día va en letras y en números porque así se redacta el acuerdo en físico.
 */
function fechaEnLetras(d: Date): string {
  const dia = d.getUTCDate()
  return `${UNIDADES[dia]} (${String(dia).padStart(2, '0')}) de ${MESES[d.getUTCMonth()]} de ${d.getUTCFullYear()}`
}

/**
 * Fecha de suscripción con la fórmula del cierre notarial: "seis (06) días del
 * mes de julio del año 2026". Va aparte de fechaEnLetras porque la frase de
 * cierre empieza con "a los", y ahí "seis (06) de julio" suena mal redactado.
 */
function fechaFirmaEnLetras(d: Date): string {
  const dia = d.getUTCDate()
  return `${UNIDADES[dia]} (${String(dia).padStart(2, '0')}) días del mes de ${MESES[d.getUTCMonth()]} del año ${d.getUTCFullYear()}`
}

function aniosEnLetras(n: number): string {
  return `${UNIDADES[n]} (${String(n).padStart(2, '0')}) ${n === 1 ? 'año' : 'años'}`
}

/** Arma el PDF del acuerdo con los datos de la empresa (fuente única: Configuración). */
async function construirPdf(acuerdoId: string): Promise<{ pdf: Buffer; numero: string; nombre: string }> {
  const a = await prisma.acuerdoEvaluacion.findUniqueOrThrow({ where: { id: acuerdoId } })
  const empresa = await prisma.configuracionEmpresa.findFirst()
  if (!empresa) throw new ErrorNegocio('Falta configurar los datos de la empresa (Configuración → Empresa).')

  const nombreAspirante = `${a.nombres} ${a.apellidos}`.trim().toUpperCase()
  const doc = `${a.tipoDocumento === 'CC' ? 'CC.' : a.tipoDocumento} ${a.numeroDocumento}${a.lugarExpedicionDoc ? ` de ${a.lugarExpedicionDoc}` : ''}`

  const pdf = await renderAcuerdoEvaluacion({
    empresa: {
      razonSocial: empresa.razonSocial,
      nombreComercial: empresa.nombreComercial,
      nit: empresa.nit,
      direccion: empresa.direccion,
      telefono: empresa.telefono,
      emailContacto: empresa.emailContacto,
      sitioWeb: empresa.sitioWeb,
    },
    numero: a.numero,
    representanteLegal: empresa.representanteLegal,
    aspiranteNombre: nombreAspirante,
    aspiranteDocumento: doc,
    aspiranteDireccion: a.direccion ?? '',
    aspiranteEmail: a.email,
    cargoEvaluado: a.cargoEvaluado.toUpperCase(),
    fechaInicioTexto: fechaEnLetras(a.fechaInicio),
    fechaFinTexto: fechaEnLetras(a.fechaFin),
    fechaFirmaTexto: fechaFirmaEnLetras(a.creadoEn),
    ciudadFirma: a.ciudadFirma ?? '',
    aniosConfidencialidad: aniosEnLetras(a.aniosConfidencialidad),
  })
  return { pdf, numero: a.numero, nombre: nombreAspirante }
}

/** Guarda un PDF como Documento del acuerdo (para el expediente del aspirante). */
async function guardarDocumento(
  acuerdoId: string, numero: string, pdf: Buffer, nombre: string, usuarioId: string, sedeId: string | null,
) {
  const sha256 = createHash('sha256').update(pdf).digest('hex')
  const archivo = await subirArchivo(`acuerdos/${acuerdoId}`, `${numero}.pdf`, pdf, 'application/pdf')
  await dbAuditado.documento.create({
    data: {
      entidadTipo: 'AcuerdoEvaluacion',
      entidadId: acuerdoId,
      nombre,
      bucket: archivo.bucket,
      storagePath: archivo.storagePath,
      mimeType: 'application/pdf',
      tamanoBytes: archivo.tamanoBytes,
      sha256,
      nivelAcceso: 'GENERAL',
      sedeId,
      subidoPorId: usuarioId,
    },
  })
}

export const crearAcuerdo = accion(
  { modulo: 'contratos', accion: 'CREAR', schema: acuerdoEvaluacionSchema },
  async (d, usuario) => {
    const numero = await siguienteNumero()
    const creado = await dbAuditado.acuerdoEvaluacion.create({
      data: {
        numero,
        nombres: d.nombres,
        apellidos: d.apellidos,
        tipoDocumento: d.tipoDocumento,
        numeroDocumento: d.numeroDocumento.trim(),
        lugarExpedicionDoc: v(d.lugarExpedicionDoc),
        direccion: v(d.direccion),
        email: d.email.toLowerCase(),
        celular: v(d.celular),
        cargoEvaluado: d.cargoEvaluado,
        cargoId: v(d.cargoId),
        sedeId: v(d.sedeId),
        fechaInicio: parseFechaISO(d.fechaInicio)!,
        fechaFin: parseFechaISO(d.fechaFin)!,
        ciudadFirma: v(d.ciudadFirma),
        aniosConfidencialidad: d.aniosConfidencialidad,
        observaciones: v(d.observaciones),
      },
    })

    // Se genera el PDF de una vez: el acuerdo solo sirve firmado, así que no tiene
    // sentido dejarlo pendiente de un segundo clic.
    const { pdf } = await construirPdf(creado.id)
    await guardarDocumento(creado.id, numero, pdf, `Acuerdo de evaluación ${numero}`, usuario.id, creado.sedeId)

    revalidatePath(RUTA)
    return { id: creado.id, numero }
  },
)

export const enviarAcuerdo = accion(
  { modulo: 'contratos', accion: 'EDITAR', schema: z.object({ id: z.uuid() }) },
  async ({ id }) => {
    const a = await prisma.acuerdoEvaluacion.findUniqueOrThrow({ where: { id } })
    const { pdf, numero, nombre } = await construirPdf(id)

    await enviarCorreo({
      para: a.email,
      asunto: `Acuerdo de evaluación previa ${numero}`,
      html: `
        <p>Hola ${a.nombres},</p>
        <p>Adjuntamos el <b>acuerdo de evaluación previa</b> para el cargo de ${a.cargoEvaluado}.</p>
        <p>Por favor imprímelo, fírmalo y devuélvelo escaneado respondiendo a este correo.</p>
        <p>Ten en cuenta que este acuerdo <b>no constituye contrato de trabajo ni precontrato laboral</b>;
        su objeto es evaluar tu idoneidad para el cargo.</p>`,
      adjuntos: [{ nombre: `Acuerdo de evaluación ${numero} - ${nombre}.pdf`, contenido: pdf }],
    })

    await dbAuditado.acuerdoEvaluacion.update({ where: { id }, data: { enviadoEn: new Date() } })
    await auditar('EDITAR', 'AcuerdoEvaluacion', { registroId: id, descripcion: `Acuerdo ${numero} enviado a ${a.email}` })
    revalidatePath(RUTA)
    return { ok: true }
  },
)

export const subirAcuerdoFirmado = accion(
  { modulo: 'contratos', accion: 'EDITAR', schema: subirAcuerdoFirmadoSchema },
  async (d, usuario) => {
    const a = await prisma.acuerdoEvaluacion.findUniqueOrThrow({ where: { id: d.id } })
    const pdf = Buffer.from(d.pdfBase64.split(',')[1] ?? '', 'base64')
    if (pdf.byteLength === 0) throw new ErrorNegocio('El PDF está vacío.')

    await guardarDocumento(a.id, `${a.numero}-firmado`, pdf, `Acuerdo de evaluación ${a.numero} (firmado)`, usuario.id, a.sedeId)
    await auditar('EDITAR', 'AcuerdoEvaluacion', { registroId: a.id, descripcion: `Acuerdo ${a.numero} firmado y cargado` })
    revalidatePath(RUTA)
    return { ok: true }
  },
)

export const decidirAcuerdo = accion(
  { modulo: 'contratos', accion: 'APROBAR', schema: decisionAcuerdoSchema },
  async (d) => {
    const a = await prisma.acuerdoEvaluacion.findUniqueOrThrow({ where: { id: d.id } })
    if (a.estado !== 'EN_EVALUACION') throw new ErrorNegocio('Esta evaluación ya tiene decisión.')

    await dbAuditado.acuerdoEvaluacion.update({
      where: { id: d.id },
      data: {
        estado: d.aprobado ? 'APROBADO' : 'NO_APROBADO',
        decididoEn: new Date(),
        observaciones: v(d.observaciones) ?? a.observaciones,
      },
    })
    revalidatePath(RUTA)
    return { ok: true }
  },
)

/**
 * Crea la ficha del colaborador a partir de un acuerdo APROBADO: es el momento en
 * que sí nace una relación contractual. Reaprovecha los datos capturados para el
 * acuerdo, de modo que no se teclean dos veces.
 *
 * Solo crea la ficha; el contrato OPS se hace después desde Contratación, que es
 * donde viven sus datos (valor, objeto, plazo).
 */
export const convertirEnColaborador = accion(
  {
    modulo: 'colaboradores',
    accion: 'CREAR',
    schema: z.object({ id: z.uuid(), sedeId: z.uuid('Selecciona la sede'), fechaIngreso: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }),
  },
  async (d) => {
    const a = await prisma.acuerdoEvaluacion.findUniqueOrThrow({ where: { id: d.id } })
    if (a.estado !== 'APROBADO') throw new ErrorNegocio('Solo se convierte un acuerdo aprobado.')
    if (a.colaboradorId) throw new ErrorNegocio('Este acuerdo ya tiene una ficha creada.')

    const dup = await prisma.colaborador.findUnique({
      where: { tipoDocumento_numeroDocumento: { tipoDocumento: a.tipoDocumento, numeroDocumento: a.numeroDocumento } },
      select: { id: true },
    })
    if (dup) throw new ErrorNegocio('Ya existe un colaborador con ese documento.')

    const colaborador = await dbAuditado.colaborador.create({
      data: {
        nombres: a.nombres,
        apellidos: a.apellidos,
        tipoDocumento: a.tipoDocumento,
        numeroDocumento: a.numeroDocumento,
        lugarExpedicionDoc: a.lugarExpedicionDoc,
        direccion: a.direccion,
        celular: a.celular ?? '',
        emailPersonal: a.email,
        // Nace como OPS: es el destino natural tras una evaluación aprobada.
        tipoVinculo: 'OPS',
        sedeId: d.sedeId,
        cargoId: a.cargoId,
        modalidadTrabajo: 'PRESENCIAL',
        fechaIngreso: parseFechaISO(d.fechaIngreso)!,
        estado: 'ACTIVO',
      },
    })

    await dbAuditado.acuerdoEvaluacion.update({ where: { id: a.id }, data: { colaboradorId: colaborador.id } })

    // Usuario de acceso con el rol por defecto del cargo (o Empleado).
    const cargo = a.cargoId ? await prisma.cargo.findUnique({ where: { id: a.cargoId }, select: { rolDefectoId: true } }) : null
    const rolId = cargo?.rolDefectoId ?? (await prisma.rol.findUnique({ where: { nombre: 'Empleado' }, select: { id: true } }))?.id ?? null
    let usuarioCreado = false
    if (rolId) {
      const r = await crearUsuarioColaborador({
        email: a.email,
        nombre: `${a.nombres} ${a.apellidos}`.trim(),
        rolId,
        colaboradorId: colaborador.id,
        sedeId: d.sedeId,
      }).catch((e) => { console.error('No se pudo crear el usuario del aspirante convertido:', e); return null })
      usuarioCreado = !!r
    }

    revalidatePath(RUTA)
    revalidatePath('/colaboradores')
    return { colaboradorId: colaborador.id, usuarioCreado }
  },
)

/** Hoy en Bogotá, para sugerir la fecha de ingreso al convertir. */
export async function hoyISO(): Promise<string> {
  return hoyBogota().toISOString().slice(0, 10)
}
