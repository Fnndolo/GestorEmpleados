'use server'

import { createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { subirArchivo } from '@/server/storage'
import { guardarAutorizacionSubida } from '@/server/contratos-autorizacion-subida'
import { accion, ErrorNegocio } from '@/server/accion'
import { contratoSchema, prorrogaSchema, otrosiSchema, suspensionSchema, subirContratoLaboralSchema } from '@/lib/validaciones/contrato'
import { parseFechaISO, formatFechaISO } from '@/lib/fechas'
import { publicarVencimiento, resolverVencimiento } from '@/server/vencimientos/servicio'
import { valorParametroVigente } from '@/server/nomina/parametros'
import { construirDatosPdfContratoLaboral, generarPdfContratoLaboral, generarPdfAutorizacionDatosLaboral } from '@/server/contratos-laboral-pdf'
import { construirDatosAutorizacion } from '@/server/contratos-ops-pdf'
import { aplicarFirmaContratoLaboral } from '@/server/contratos-laboral-firma'
import { avisar, usuarioDeColaborador } from '@/server/notificaciones/avisar'
import type { FuncionesCargo } from '@/lib/contrato-variables'

async function siguienteNumero(prefijo: string): Promise<string> {
  const anio = new Date().getUTCFullYear()
  const modelo = prefijo === 'CT' ? prisma.contrato : prisma.contratoOps
  const total = await (modelo as typeof prisma.contrato).count()
  return `${prefijo}-${anio}-${String(total + 1).padStart(4, '0')}`
}

function nombreColab(c: { nombres: string; apellidos: string }) {
  return `${c.nombres} ${c.apellidos}`
}

async function publicarVencimientosContrato(contratoId: string) {
  const c = await prisma.contrato.findUniqueOrThrow({
    where: { id: contratoId },
    include: { colaborador: true },
  })
  // Contrato a término fijo → alerta de vencimiento
  if (c.tipo === 'TERMINO_FIJO' && c.fechaFin && c.estado === 'ACTIVO') {
    await publicarVencimiento({
      origen: 'CONTRATO_FIJO',
      entidadTipo: 'Contrato',
      entidadId: c.id,
      titulo: `Vence contrato fijo ${c.numero} — ${nombreColab(c.colaborador)}`,
      fechaVencimientoISO: formatFechaISO(c.fechaFin),
      sedeId: c.sedeId,
    })
  } else {
    await resolverVencimiento('Contrato', c.id, 'CONTRATO_FIJO')
  }
  // Fin de periodo de prueba → alerta
  if (c.periodoPruebaFin && c.estado === 'ACTIVO' && c.periodoPruebaFin >= new Date()) {
    await publicarVencimiento({
      origen: 'PERIODO_PRUEBA',
      entidadTipo: 'Contrato',
      entidadId: c.id,
      titulo: `Fin de periodo de prueba ${c.numero} — ${nombreColab(c.colaborador)}`,
      fechaVencimientoISO: formatFechaISO(c.periodoPruebaFin),
      sedeId: c.sedeId,
    })
  }
}

const v = (s: string | undefined | null) => (s && s !== '' ? s : null)

export const crearContrato = accion(
  { modulo: 'contratos', accion: 'CREAR', schema: contratoSchema },
  async (d, usuario) => {
    if (d.tipo === 'TERMINO_FIJO' && !d.fechaFin) throw new ErrorNegocio('Un contrato a término fijo requiere fecha de fin.')
    if (d.tipo === 'OBRA_LABOR' && !d.objetoObraLabor) throw new ErrorNegocio('Indica el objeto de la obra o labor.')

    // Validación CST: término fijo ≤ 4 años
    if (d.tipo === 'TERMINO_FIJO' && d.fechaFin) {
      const dur = (parseFechaISO(d.fechaFin)!.getTime() - parseFechaISO(d.fechaInicio)!.getTime()) / (365 * 86_400_000)
      if (dur > 4) throw new ErrorNegocio('El contrato a término fijo no puede superar 4 años.')
    }

    let periodoPruebaFin: Date | null = null
    if (d.periodoPruebaDias && d.periodoPruebaDias > 0) {
      periodoPruebaFin = parseFechaISO(d.fechaInicio)!
      periodoPruebaFin.setUTCDate(periodoPruebaFin.getUTCDate() + d.periodoPruebaDias)
    }

    // Si gana salario mínimo, el salario base se fija al SMMLV vigente
    const ganaMin = d.ganaSalarioMinimo ?? false
    const salarioBase = ganaMin ? (await valorParametroVigente('SMMLV')) || d.salarioBase : d.salarioBase
    const auxConectividad = d.auxConectividad && d.auxConectividad > 0 ? d.auxConectividad : null

    const numero = await siguienteNumero('CT')
    const contrato = await dbAuditado.contrato.create({
      data: {
        numero,
        colaboradorId: d.colaboradorId,
        tipo: d.tipo,
        cargoId: v(d.cargoId),
        sedeId: d.sedeId,
        jornada: d.jornada,
        horasSemanales: d.horasSemanales ?? null,
        modalidadTrabajo: d.modalidadTrabajo,
        salarioBase,
        ganaSalarioMinimo: ganaMin,
        tieneAuxTransporte: d.tieneAuxTransporte ?? true,
        auxConectividad,
        tipoSalario: d.tipoSalario,
        fechaInicio: parseFechaISO(d.fechaInicio)!,
        fechaFin: parseFechaISO(d.fechaFin),
        objetoObraLabor: v(d.objetoObraLabor),
        etapaAprendizaje: (v(d.etapaAprendizaje) as 'LECTIVA' | 'PRODUCTIVA' | null) ?? null,
        apoyoSostenimiento: null,
        periodoPruebaDias: d.periodoPruebaDias ?? null,
        periodoPruebaFin,
        estado: 'ACTIVO',
        observaciones: v(d.observaciones),
      },
    })
    await publicarVencimientosContrato(contrato.id)

    // Generar el PDF del contrato desde la plantilla (el texto editado en el
    // formulario tiene prioridad sobre la plantilla de BD), junto con la
    // autorización de tratamiento de datos (Ley 1581).
    if (d.generarPdf !== false) {
      try {
        await generarDocumentosContratoLaboral(contrato.id, usuario.id, {
          titulo: v(d.plantillaTitulo),
          intro: d.plantillaIntro || null,
          cierre: d.plantillaCierre || null,
          clausulas: d.clausulas && d.clausulas.length > 0
            ? d.clausulas.map((cl, i) => ({ titulo: cl.titulo, cuerpo: cl.cuerpo, esFunciones: cl.esFunciones ?? false, orden: i + 1 }))
            : null,
          funciones: d.funciones && d.funciones.length > 0 ? d.funciones : null,
        })
      } catch (e) {
        // El contrato queda creado aunque falle el PDF; se puede regenerar luego.
        console.error('No se pudo generar el PDF del contrato laboral:', e)
      }
    }

    revalidatePath('/contratos')
    return { id: contrato.id }
  },
)

/**
 * Sube un contrato laboral YA EXISTENTE (firmado en físico / hecho fuera del sistema).
 * Crea el registro con los datos estructurados (los necesita nómina y las alertas de
 * vencimiento), marca `origenPdf: SUBIDO` y adjunta el PDF aportado como Documento.
 * No genera plantilla ni exige firma digital: entra ACTIVO (firmado en físico).
 */
export const subirContratoExistente = accion(
  { modulo: 'contratos', accion: 'CREAR', schema: subirContratoLaboralSchema },
  async (d, usuario) => {
    if (d.tipo === 'TERMINO_FIJO' && !d.fechaFin) throw new ErrorNegocio('Un contrato a término fijo requiere fecha de fin.')
    if (d.tipo === 'OBRA_LABOR' && !d.objetoObraLabor) throw new ErrorNegocio('Indica el objeto de la obra o labor.')
    if (d.tipo === 'TERMINO_FIJO' && d.fechaFin) {
      const dur = (parseFechaISO(d.fechaFin)!.getTime() - parseFechaISO(d.fechaInicio)!.getTime()) / (365 * 86_400_000)
      if (dur > 4) throw new ErrorNegocio('El contrato a término fijo no puede superar 4 años.')
    }

    // Decodificar el PDF (data URI base64) a Buffer.
    const base64 = d.pdfBase64.split(',')[1] ?? ''
    const pdf = Buffer.from(base64, 'base64')
    if (pdf.byteLength === 0) throw new ErrorNegocio('El PDF adjunto está vacío.')

    let periodoPruebaFin: Date | null = null
    if (d.periodoPruebaDias && d.periodoPruebaDias > 0) {
      periodoPruebaFin = parseFechaISO(d.fechaInicio)!
      periodoPruebaFin.setUTCDate(periodoPruebaFin.getUTCDate() + d.periodoPruebaDias)
    }
    const ganaMin = d.ganaSalarioMinimo ?? false
    const salarioBase = ganaMin ? (await valorParametroVigente('SMMLV')) || d.salarioBase : d.salarioBase
    const auxConectividad = d.auxConectividad && d.auxConectividad > 0 ? d.auxConectividad : null

    const numero = await siguienteNumero('CT')
    const contrato = await dbAuditado.contrato.create({
      data: {
        numero,
        colaboradorId: d.colaboradorId,
        tipo: d.tipo,
        cargoId: v(d.cargoId),
        sedeId: d.sedeId,
        jornada: d.jornada,
        horasSemanales: d.horasSemanales ?? null,
        modalidadTrabajo: d.modalidadTrabajo,
        salarioBase,
        ganaSalarioMinimo: ganaMin,
        tieneAuxTransporte: d.tieneAuxTransporte ?? true,
        auxConectividad,
        tipoSalario: d.tipoSalario,
        fechaInicio: parseFechaISO(d.fechaInicio)!,
        fechaFin: parseFechaISO(d.fechaFin),
        objetoObraLabor: v(d.objetoObraLabor),
        etapaAprendizaje: (v(d.etapaAprendizaje) as 'LECTIVA' | 'PRODUCTIVA' | null) ?? null,
        periodoPruebaDias: d.periodoPruebaDias ?? null,
        periodoPruebaFin,
        estado: 'ACTIVO',
        origenPdf: 'SUBIDO',
        observaciones: v(d.observaciones),
      },
    })

    // Subir el PDF aportado y registrarlo como Documento del contrato.
    const sha256 = createHash('sha256').update(pdf).digest('hex')
    const archivo = await subirArchivo(`contratos/${contrato.id}`, `contrato-${numero}.pdf`, pdf, 'application/pdf')
    await dbAuditado.documento.create({
      data: {
        entidadTipo: 'Contrato',
        entidadId: contrato.id,
        nombre: (d.pdfNombre && d.pdfNombre.trim()) || `Contrato laboral ${numero} (subido)`,
        bucket: archivo.bucket,
        storagePath: archivo.storagePath,
        mimeType: 'application/pdf',
        tamanoBytes: archivo.tamanoBytes,
        sha256,
        nivelAcceso: 'GENERAL',
        sedeId: contrato.sedeId,
        subidoPorId: usuario.id,
      },
    })

    await guardarAutorizacionSubida({
      autorizacionBase64: d.autorizacionBase64, autorizacionNombre: d.autorizacionNombre,
      entidadTipo: 'Contrato', entidadId: contrato.id, numero, sedeId: contrato.sedeId, usuarioId: usuario.id,
    })

    await publicarVencimientosContrato(contrato.id)
    revalidatePath('/contratos')
    return { id: contrato.id }
  },
)

type OverridesPlantilla = {
  titulo?: string | null
  intro?: string | null
  cierre?: string | null
  clausulas?: { titulo: string; cuerpo: string; esFunciones: boolean; orden: number }[] | null
  funciones?: FuncionesCargo | null
}

/**
 * Construye el snapshot desde la plantilla del tipo de contrato + los datos ya
 * guardados (colaborador, sede, empresa), genera el PDF del contrato y la
 * autorización de datos, y congela el snapshot en `Contrato.contenidoPdf`.
 * `overrides` trae el texto editado en el formulario (título, intro, cierre,
 * cláusulas, funciones): tiene prioridad sobre la plantilla de BD.
 * Si no hay plantilla activa para el tipo NI cláusulas editadas, no hace nada.
 */
async function generarDocumentosContratoLaboral(
  contratoId: string,
  usuarioId: string,
  overrides?: OverridesPlantilla,
  opciones?: { avisarEmpleado?: boolean },
): Promise<string | null> {
  const c = await prisma.contrato.findUniqueOrThrow({
    where: { id: contratoId },
    include: {
      colaborador: true,
      cargo: true,
      sede: { include: { ciudad: true } },
    },
  })
  const pl = await prisma.plantillaContrato.findFirst({
    where: { tipo: c.tipo, activa: true },
    include: { clausulas: { orderBy: { orden: 'asc' } } },
  })
  if (!pl && !overrides?.clausulas) return null

  const empresaCfg = await prisma.configuracionEmpresa.findFirst()
  const colab = c.colaborador

  // Auxilio de transporte: solo si aplica (bandera + salario ≤ 2 SMMLV, salario ordinario).
  const smmlv = (await valorParametroVigente('SMMLV')) ?? 0
  const auxTransporteParam = (await valorParametroVigente('AUX_TRANSPORTE')) ?? 0
  const salario = Number(c.salarioBase)
  const aplicaAux = c.tieneAuxTransporte && c.tipoSalario === 'ORDINARIO' && smmlv > 0 && salario <= 2 * smmlv
  const auxTransporte = aplicaAux ? auxTransporteParam : 0

  // Duración en meses (para el recuadro y la cláusula de duración del término fijo).
  let plazoMeses: number | null = null
  if (c.fechaFin) {
    const meses =
      (c.fechaFin.getUTCFullYear() - c.fechaInicio.getUTCFullYear()) * 12 +
      (c.fechaFin.getUTCMonth() - c.fechaInicio.getUTCMonth())
    plazoMeses = Math.max(1, Math.round(meses + (c.fechaFin.getUTCDate() >= c.fechaInicio.getUTCDate() - 1 ? 0 : -1)))
  }

  const ciudad = c.sede.ciudad ? `${c.sede.ciudad.nombre}` : ''
  const hoyIso = new Date().toISOString().slice(0, 10)

  const datosContrato = {
    empresa: {
      razonSocial: empresaCfg?.razonSocial ?? '',
      marca: empresaCfg?.nombreComercial,
      nit: empresaCfg?.nit,
      representanteLegal: empresaCfg?.representanteLegal,
      representanteLegalCc: empresaCfg?.representanteLegalCc,
      direccion: empresaCfg?.direccion,
      correoDevolucion: empresaCfg?.emailContacto,
    },
    contratista: {
      nombre: `${colab.nombres} ${colab.apellidos}`,
      cc: colab.numeroDocumento,
      ccLugar: colab.lugarExpedicionDoc,
      direccion: colab.direccion,
      email: colab.emailPersonal ?? colab.emailCorporativo,
      telefono: colab.celular,
      genero: colab.genero,
    },
    contrato: {
      numero: c.numero,
      ciudad,
      fechaSuscripcion: hoyIso,
      fechaInicio: formatFechaISO(c.fechaInicio),
      fechaFin: c.fechaFin ? formatFechaISO(c.fechaFin) : null,
      plazoMeses,
      salarioMensual: salario,
      auxTransporte,
      cargoObjeto: c.cargo?.nombre ?? null,
    },
  }

  const funciones = overrides?.funciones ?? (c.cargo?.funcionesContrato as FuncionesCargo | null) ?? null

  // Plantilla FUENTE (texto con {{variables}}) realmente usada: se guarda en el
  // snapshot para poder reabrir el contrato en el mismo formulario de creación.
  const plantillaFuente = {
    titulo: overrides?.titulo || pl?.titulo || 'CONTRATO DE TRABAJO',
    intro: overrides?.intro ?? pl?.intro ?? '',
    cierre: overrides?.cierre ?? pl?.cierre ?? '',
    clausulas:
      overrides?.clausulas ??
      (pl?.clausulas ?? []).map((cl) => ({ titulo: cl.titulo, cuerpo: cl.cuerpo, esFunciones: cl.esFunciones, orden: cl.orden })),
    funciones,
  }

  const datosPdf = await construirDatosPdfContratoLaboral({
    datos: datosContrato,
    tipoContrato: c.tipo,
    plantilla: plantillaFuente,
    funciones,
  })
  const autorizacion = await construirDatosAutorizacion({ datos: datosContrato, genero: colab.genero })

  await dbAuditado.contrato.update({
    where: { id: c.id },
    data: { contenidoPdf: { ...datosPdf, autorizacion, plantillaFuente } as object },
  })

  const pdf = await generarPdfContratoLaboral({ contratoId: c.id, numero: c.numero, sedeId: c.sedeId, usuarioId, datos: datosPdf })
  await generarPdfAutorizacionDatosLaboral({ contratoId: c.id, numero: c.numero, sedeId: c.sedeId, usuarioId, datos: autorizacion })

  // Avisar al empleado (si tiene usuario) que su contrato quedó pendiente de firma.
  // La edición manda su propio aviso de "actualizado" (avisarEmpleado: false aquí).
  if (opciones?.avisarEmpleado !== false) {
    const uid = await usuarioDeColaborador(c.colaboradorId)
    if (uid) {
      await avisar(uid, {
        evento: 'contrato_pendiente_firma',
        titulo: 'Contrato pendiente de tu firma',
        mensaje: `Tu contrato laboral ${c.numero} y la autorización de tratamiento de datos fueron generados. Revísalos y fírmalos desde tu autoservicio.`,
        enlace: '/autoservicio/contratos',
        llamadoAccion: 'Revisar y firmar el contrato',
      }).catch(() => {})
    }
  }
  return pdf.documentoId
}

/**
 * Edición COMPLETA de un contrato aún no firmado: mismos campos que al crear
 * (datos + documento). Actualiza el contrato, re-resuelve las variables y
 * regenera el PDF y la autorización. Solo mientras NADIE haya firmado: desde la
 * primera firma el contenido queda congelado y los cambios van por otrosí.
 */
export const actualizarContratoLaboral = accion(
  { modulo: 'contratos', accion: 'EDITAR', schema: contratoSchema.extend({ contratoId: z.uuid() }) },
  async (d, usuario) => {
    const c = await prisma.contrato.findUniqueOrThrow({ where: { id: d.contratoId } })
    if (c.firmaEmpleadoPath || c.firmaEmpleadorPath) {
      throw new ErrorNegocio('El contrato ya tiene firmas: está congelado. Los cambios posteriores van por otrosí.')
    }

    // Mismas validaciones de negocio que al crear.
    if (d.tipo === 'TERMINO_FIJO' && !d.fechaFin) throw new ErrorNegocio('Un contrato a término fijo requiere fecha de fin.')
    if (d.tipo === 'OBRA_LABOR' && !d.objetoObraLabor) throw new ErrorNegocio('Indica el objeto de la obra o labor.')
    if (d.tipo === 'TERMINO_FIJO' && d.fechaFin) {
      const dur = (parseFechaISO(d.fechaFin)!.getTime() - parseFechaISO(d.fechaInicio)!.getTime()) / (365 * 86_400_000)
      if (dur > 4) throw new ErrorNegocio('El contrato a término fijo no puede superar 4 años.')
    }

    let periodoPruebaFin: Date | null = null
    if (d.periodoPruebaDias && d.periodoPruebaDias > 0) {
      periodoPruebaFin = parseFechaISO(d.fechaInicio)!
      periodoPruebaFin.setUTCDate(periodoPruebaFin.getUTCDate() + d.periodoPruebaDias)
    }
    const ganaMin = d.ganaSalarioMinimo ?? false
    const salarioBase = ganaMin ? (await valorParametroVigente('SMMLV')) || d.salarioBase : d.salarioBase

    await dbAuditado.contrato.update({
      where: { id: c.id },
      data: {
        colaboradorId: d.colaboradorId,
        tipo: d.tipo,
        cargoId: v(d.cargoId),
        sedeId: d.sedeId,
        jornada: d.jornada,
        horasSemanales: d.horasSemanales ?? null,
        modalidadTrabajo: d.modalidadTrabajo,
        salarioBase,
        ganaSalarioMinimo: ganaMin,
        tieneAuxTransporte: d.tieneAuxTransporte ?? true,
        auxConectividad: d.auxConectividad && d.auxConectividad > 0 ? d.auxConectividad : null,
        tipoSalario: d.tipoSalario,
        fechaInicio: parseFechaISO(d.fechaInicio)!,
        fechaFin: parseFechaISO(d.fechaFin),
        objetoObraLabor: v(d.objetoObraLabor),
        etapaAprendizaje: (v(d.etapaAprendizaje) as 'LECTIVA' | 'PRODUCTIVA' | null) ?? null,
        periodoPruebaDias: d.periodoPruebaDias ?? null,
        periodoPruebaFin,
        observaciones: v(d.observaciones),
      },
    })
    await publicarVencimientosContrato(c.id)

    if (d.generarPdf !== false) {
      await generarDocumentosContratoLaboral(c.id, usuario.id, {
        titulo: v(d.plantillaTitulo),
        intro: d.plantillaIntro || null,
        cierre: d.plantillaCierre || null,
        clausulas: d.clausulas && d.clausulas.length > 0
          ? d.clausulas.map((cl, i) => ({ titulo: cl.titulo, cuerpo: cl.cuerpo, esFunciones: cl.esFunciones ?? false, orden: i + 1 }))
          : null,
        funciones: d.funciones && d.funciones.length > 0 ? d.funciones : null,
      }, { avisarEmpleado: false })
    }

    // Avisar al empleado que su contrato cambió (llega aunque no se regenere el PDF).
    const uid = await usuarioDeColaborador(d.colaboradorId)
    if (uid) {
      await avisar(uid, {
        evento: 'contrato_actualizado',
        titulo: 'Tu contrato fue actualizado',
        mensaje: `El contrato ${c.numero} fue modificado por la empresa antes de la firma. Revisa la versión actualizada${d.generarPdf !== false ? ' del documento' : ''} y fírmala desde tu autoservicio.`,
        enlace: '/autoservicio/contratos',
        llamadoAccion: 'Revisar el contrato actualizado',
      }).catch(() => {})
    }

    revalidatePath(`/contratos/${c.id}`)
    revalidatePath('/contratos')
    return { id: c.id }
  },
)

/**
 * Regenera el PDF del contrato laboral ANTES de firmar. Si el contrato ya tiene
 * snapshot (`contenidoPdf`), solo se re-renderiza desde ahí — así se conservan
 * las cláusulas editadas al crear y se corrigen problemas de render. Si no hay
 * snapshot (falló al crear), se deriva desde la plantilla de BD.
 */
export const regenerarPdfContratoLaboral = accion(
  { modulo: 'contratos', accion: 'EDITAR', schema: z.object({ contratoId: z.uuid() }) },
  async (d, usuario) => {
    const c = await prisma.contrato.findUniqueOrThrow({ where: { id: d.contratoId } })
    if (c.firmaEmpleadoPath || c.firmaEmpleadorPath) {
      throw new ErrorNegocio('El contrato ya tiene firmas: su contenido está congelado y no se puede regenerar.')
    }
    if (c.contenidoPdf) {
      const snapshot = c.contenidoPdf as unknown as import('@/server/contratos-laboral-pdf').SnapshotContratoLaboral
      const pdf = await generarPdfContratoLaboral({ contratoId: c.id, numero: c.numero, sedeId: c.sedeId, usuarioId: usuario.id, datos: snapshot })
      revalidatePath(`/contratos/${d.contratoId}`)
      return { documentoId: pdf.documentoId }
    }
    const docId = await generarDocumentosContratoLaboral(d.contratoId, usuario.id)
    if (!docId) throw new ErrorNegocio(`No hay una plantilla activa para el tipo de contrato ${c.tipo}. Créala primero.`)
    revalidatePath(`/contratos/${d.contratoId}`)
    return { documentoId: docId }
  },
)

/** Datos básicos del colaborador para la vista previa del contrato (nombre, cc, dirección…). */
export const datosColaboradorContrato = accion(
  { modulo: 'contratos', accion: 'CREAR', schema: z.object({ colaboradorId: z.uuid() }) },
  async (d) => {
    const c = await prisma.colaborador.findUniqueOrThrow({
      where: { id: d.colaboradorId },
      select: { nombres: true, apellidos: true, numeroDocumento: true, lugarExpedicionDoc: true, direccion: true, emailPersonal: true, emailCorporativo: true, celular: true, genero: true },
    })
    return {
      nombre: `${c.nombres} ${c.apellidos}`,
      cc: c.numeroDocumento,
      ccLugar: c.lugarExpedicionDoc,
      direccion: c.direccion,
      email: c.emailPersonal ?? c.emailCorporativo,
      telefono: c.celular,
      genero: c.genero,
    }
  },
)

/** El representante legal (administración) firma el contrato laboral. */
export const firmarContratoLaboral = accion(
  {
    modulo: 'contratos',
    accion: 'EDITAR',
    schema: z.object({ contratoId: z.uuid(), firmaDataUri: z.string().min(50) }),
  },
  async (d, usuario) => {
    const r = await aplicarFirmaContratoLaboral({
      contratoId: d.contratoId,
      rol: 'EMPLEADOR',
      firmaDataUri: d.firmaDataUri,
      usuarioId: usuario.id,
    })
    revalidatePath(`/contratos/${d.contratoId}`)
    return r
  },
)

export const agregarProrroga = accion(
  { modulo: 'contratos', accion: 'EDITAR', schema: prorrogaSchema },
  async (d) => {
    const contrato = await prisma.contrato.findUniqueOrThrow({
      where: { id: d.contratoId },
      include: { prorrogas: true },
    })
    if (contrato.tipo !== 'TERMINO_FIJO') throw new ErrorNegocio('Solo los contratos a término fijo se prorrogan.')

    const numero = contrato.prorrogas.length + 1
    // CST: tras 3 prórrogas de fijo < 1 año, la renovación mínima es 1 año
    const durOriginal = contrato.fechaFin
      ? (contrato.fechaFin.getTime() - contrato.fechaInicio.getTime()) / (365 * 86_400_000)
      : 0
    const durNueva = (parseFechaISO(d.fechaFin)!.getTime() - parseFechaISO(d.fechaInicio)!.getTime()) / (365 * 86_400_000)
    if (durOriginal < 1 && numero >= 4 && durNueva < 1) {
      throw new ErrorNegocio('Tras 3 prórrogas de un contrato fijo menor a 1 año, la renovación mínima es de 1 año (CST art. 46).')
    }

    await dbAuditado.prorrogaContrato.create({
      data: {
        contratoId: d.contratoId,
        numero,
        fechaInicio: parseFechaISO(d.fechaInicio)!,
        fechaFin: parseFechaISO(d.fechaFin)!,
        fechaFirma: parseFechaISO(d.fechaFirma),
      },
    })
    await dbAuditado.contrato.update({ where: { id: d.contratoId }, data: { fechaFin: parseFechaISO(d.fechaFin)! } })
    await publicarVencimientosContrato(d.contratoId)
    revalidatePath(`/contratos/${d.contratoId}`)
  },
)

export const agregarOtrosi = accion(
  { modulo: 'contratos', accion: 'EDITAR', schema: otrosiSchema },
  async (d) => {
    const contrato = await prisma.contrato.findUniqueOrThrow({
      where: { id: d.contratoId },
      include: { otrosis: true },
    })
    const numero = contrato.otrosis.length + 1
    const antes: Record<string, number> = {}
    const despues: Record<string, number> = {}
    const updateContrato: Record<string, unknown> = {}
    const updateColab: Record<string, unknown> = {}

    if (d.tiposCambio.includes('SALARIO') && d.salarioNuevo != null) {
      antes.salario = Number(contrato.salarioBase)
      despues.salario = d.salarioNuevo
      updateContrato.salarioBase = d.salarioNuevo
      await prisma.variacionSalarial.create({
        data: {
          colaboradorId: contrato.colaboradorId,
          salarioAnterior: contrato.salarioBase,
          salarioNuevo: d.salarioNuevo,
          fechaVigencia: parseFechaISO(d.fecha)!,
          motivo: `Otrosí ${numero}`,
        },
      })
    }
    if (d.tiposCambio.includes('CARGO') && v(d.cargoNuevoId)) {
      updateContrato.cargoId = d.cargoNuevoId
      updateColab.cargoId = d.cargoNuevoId
    }
    if (d.tiposCambio.includes('SEDE') && v(d.sedeNuevaId)) {
      updateContrato.sedeId = d.sedeNuevaId
      updateColab.sedeId = d.sedeNuevaId
    }
    if (d.tiposCambio.includes('MODALIDAD_TRABAJO') && v(d.modalidadNueva)) {
      updateContrato.modalidadTrabajo = d.modalidadNueva
      updateColab.modalidadTrabajo = d.modalidadNueva
    }
    if (d.tiposCambio.includes('DURACION') && v(d.fechaFinNueva)) {
      updateContrato.fechaFin = parseFechaISO(d.fechaFinNueva)
    }

    await dbAuditado.otrosiContrato.create({
      data: {
        contratoId: d.contratoId,
        numero,
        fecha: parseFechaISO(d.fecha)!,
        tiposCambio: d.tiposCambio,
        descripcion: d.descripcion,
        valoresAnteriores: Object.keys(antes).length ? antes : undefined,
        valoresNuevos: Object.keys(despues).length ? despues : undefined,
      },
    })
    if (Object.keys(updateContrato).length) await dbAuditado.contrato.update({ where: { id: d.contratoId }, data: updateContrato })
    if (Object.keys(updateColab).length) await dbAuditado.colaborador.update({ where: { id: contrato.colaboradorId }, data: updateColab })
    if (updateContrato.fechaFin) await publicarVencimientosContrato(d.contratoId)
    revalidatePath(`/contratos/${d.contratoId}`)
  },
)

export const registrarSuspension = accion(
  { modulo: 'contratos', accion: 'EDITAR', schema: suspensionSchema },
  async (d) => {
    await dbAuditado.suspensionContrato.create({
      data: {
        contratoId: d.contratoId,
        fechaInicio: parseFechaISO(d.fechaInicio)!,
        fechaFin: parseFechaISO(d.fechaFin),
        causa: d.causa,
        descripcion: v(d.descripcion),
      },
    })
    await dbAuditado.contrato.update({ where: { id: d.contratoId }, data: { estado: 'SUSPENDIDO' } })
    revalidatePath(`/contratos/${d.contratoId}`)
  },
)

export const reactivarContrato = accion(
  { modulo: 'contratos', accion: 'EDITAR', schema: z.object({ id: z.uuid() }) },
  async ({ id }) => {
    await dbAuditado.contrato.update({ where: { id }, data: { estado: 'ACTIVO' } })
    revalidatePath(`/contratos/${id}`)
  },
)
