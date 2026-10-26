'use server'

import { createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { subirArchivo, leerArchivo } from '@/server/storage'
import { guardarAutorizacionSubida } from '@/server/contratos-autorizacion-subida'
import { datosAutorizacionDeColaborador } from '@/server/contratos-autorizacion-datos'
import { alinearCargoFicha } from '@/server/colaborador-cargo'
import { accion, ErrorNegocio } from '@/server/accion'
import { borrarPdfTemporal, extensionDe, obtenerArchivoAdjunto, obtenerPdfAdjunto } from '@/server/archivos-temporales'
import { esComprimido } from '@/lib/archivos'
import {
  contratoSchema, prorrogaSchema, otrosiSchema, suspensionSchema, subirContratoLaboralSchema, subirContratoLaboralParaFirmaSchema, corregirPosicionFirmaLaboralSchema,
  anulacionContratoSchema, editarProrrogaSchema, editarOtrosiSchema, editarSuspensionSchema, editarVariacionSalarialSchema,
  type SubirContratoLaboralInput, type OtrosiInput, type EditarOtrosiInput,
} from '@/lib/validaciones/contrato'
import { parseFechaISO, formatFechaISO, hoyBogota } from '@/lib/fechas'
import { auditar } from '@/lib/auditoria'
import { exigirNoLiquidadaEnNominaCerrada } from '@/server/incapacidades'
import {
  FECHA_LEJANA, menorFecha, mayorFechaOAbierta, fechaFinTrasAnularProrroga, sigueSuspendido, esVariacionMasReciente, numeroOtrosiDeMotivo,
} from '@/server/contratos-modificaciones'
import { fechaBreve } from '@/lib/notificaciones/texto'
import { pdfAdjuntoCampos } from '@/lib/validaciones/pdf-adjunto'
import { publicarVencimiento, resolverVencimiento, cancelarVencimiento } from '@/server/vencimientos/servicio'
import { eliminarDocumento } from '@/server/documentos'
import { valorParametroVigente } from '@/server/nomina/parametros'
import { construirDatosPdfContratoLaboral, generarPdfContratoLaboral, generarPdfAutorizacionDatosLaboral } from '@/server/contratos-laboral-pdf'
import { construirDatosAutorizacion, leerFirmaComoDataUri } from '@/server/contratos-ops-pdf'
import { aplicarFirmaContratoLaboral, corregirPosicionFirmaLaboral as corregirPosicionFirmaLaboralServidor } from '@/server/contratos-laboral-firma'
import { leerDatosFirmaSubidoLaboral } from '@/server/contratos-laboral-estampar'
import { avisar, usuarioDeColaborador } from '@/server/notificaciones/avisar'
import { ubicarFirmasEnPdf, contarPaginas } from '@/server/pdf/firma-en-pdf'
import { resumenOtrosi, type ValoresOtrosi } from '@/lib/otrosi'
import { documentosFaltantesDe } from '@/server/expediente'
import type { FuncionesCargo } from '@/lib/contrato-variables'
import { vinculoDeContrato, vinculoCoincide, type TipoContratoLaboral, type TipoVinculo } from '@/lib/vinculo-contrato'
import { devolverAccesoNormal } from '@/server/rol-consulta'

/**
 * Serie CT-<año>-####: consecutivo sobre el MAYOR número ya usado en el año,
 * igual que KC-### en OPS y EV-### en acuerdos. Antes era «cantidad de
 * contratos + 1»: en cuanto se borró un contrato registrado por error, la
 * cuenta bajó y el siguiente alta repetía un número existente (`numero` es
 * único), así que ningún contrato laboral se podía crear.
 */
async function siguienteNumero(prefijo: 'CT'): Promise<string> {
  const serie = `${prefijo}-${new Date().getUTCFullYear()}-`
  const previos = await prisma.contrato.findMany({
    where: { numero: { startsWith: serie } },
    select: { numero: true },
  })
  const mayor = previos.reduce((m, c) => {
    const n = parseInt(c.numero.slice(serie.length), 10)
    return Number.isFinite(n) && n > m ? n : m
  }, 0)
  return `${serie}${String(mayor + 1).padStart(4, '0')}`
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

    const vinculoAjustado = await alinearVinculoFicha(d.colaboradorId, d.tipo)
    await alinearCargoFicha(d.colaboradorId, v(d.cargoId))
    const reactivado = await reactivarSiEstabaRetirado(d.colaboradorId)

    revalidatePath('/contratos')
    return { id: contrato.id, vinculoAjustado, reactivado }
  },
)

/**
 * Pone el `tipoVinculo` de la ficha de acuerdo con el contrato que se acaba de
 * firmar, y devuelve qué cambió (o null si ya coincidían).
 *
 * Manda el contrato, no la ficha: el contrato es el documento legal, mientras
 * que el campo de la ficha es un resumen que suele quedarse con el valor por
 * defecto del formulario. Se avisa a quien lo creó en vez de cambiarlo en
 * silencio, porque pasar a alguien de prestación de servicios a laboral (o al
 * revés) cambia qué trámites puede hacer en su autoservicio.
 */
async function alinearVinculoFicha(
  colaboradorId: string,
  tipoContrato: TipoContratoLaboral,
): Promise<{ antes: TipoVinculo; ahora: TipoVinculo } | null> {
  const colab = await prisma.colaborador.findUnique({
    where: { id: colaboradorId },
    select: { tipoVinculo: true },
  })
  if (!colab) return null
  const antes = colab.tipoVinculo as TipoVinculo
  if (vinculoCoincide(tipoContrato, antes)) return null
  const ahora = vinculoDeContrato(tipoContrato)
  await dbAuditado.colaborador.update({ where: { id: colaboradorId }, data: { tipoVinculo: ahora } })
  revalidatePath(`/colaboradores/${colaboradorId}`)
  return { antes, ahora }
}

/**
 * Devuelve a la vida la ficha de quien se está recontratando.
 *
 * Terminar hace tres cosas —marca la ficha como retirada, cierra el contrato y
 * baja el acceso a solo consulta— y crear el contrato nuevo solo deshacía la
 * segunda. La persona quedaba con contrato vigente pero marcada como retirada,
 * viendo en su autoservicio «tu vínculo laboral no está activo» y sin poder
 * pedir vacaciones ni firmar el contrato que se le acababa de hacer.
 *
 * Devuelve qué se reactivó, o null si la ficha ya estaba activa.
 */
async function reactivarSiEstabaRetirado(
  colaboradorId: string,
): Promise<{ accesoDevuelto: boolean } | null> {
  const colab = await prisma.colaborador.findUnique({
    where: { id: colaboradorId },
    select: { estado: true },
  })
  if (!colab || colab.estado === 'ACTIVO') return null

  await dbAuditado.colaborador.update({
    where: { id: colaboradorId },
    // La fecha de retiro se limpia: dejarla haría que la antigüedad y las
    // liquidaciones siguieran contando contra un retiro que ya no existe.
    data: { estado: 'ACTIVO', fechaRetiro: null },
  })
  const accesoDevuelto = await devolverAccesoNormal(colaboradorId)
  revalidatePath(`/colaboradores/${colaboradorId}`)
  revalidatePath('/autoservicio')
  return { accesoDevuelto }
}

/**
 * Alta de un contrato laboral cuyo PDF viene de fuera, compartida por los dos
 * caminos: el que llega ya firmado en físico (`subirContratoExistente`) y el que
 * se sube para firmarse en la app (`subirContratoParaFirma`). Valida, numera,
 * registra el contrato con los datos que necesitan nómina y las alertas, y
 * archiva el PDF aportado. Lo que difiere entre caminos llega en `origen`.
 */
async function registrarContratoSubido(
  d: SubirContratoLaboralInput,
  usuario: { id: string },
  origen: {
    origenPdf: 'SUBIDO' | 'SUBIDO_PARA_FIRMA'
    firmaEmpleadorEnPdf?: boolean
    esOtrosi?: boolean
  },
) {
  if (d.tipo === 'TERMINO_FIJO' && !d.fechaFin) throw new ErrorNegocio('Un contrato a término fijo requiere fecha de fin.')
  if (d.tipo === 'OBRA_LABOR' && !d.objetoObraLabor) throw new ErrorNegocio('Indica el objeto de la obra o labor.')
  if (d.tipo === 'TERMINO_FIJO' && d.fechaFin) {
    const dur = (parseFechaISO(d.fechaFin)!.getTime() - parseFechaISO(d.fechaInicio)!.getTime()) / (365 * 86_400_000)
    if (dur > 4) throw new ErrorNegocio('El contrato a término fijo no puede superar 4 años.')
  }

  // El archivo: por referencia al depósito temporal o, en pruebas, en base64.
  // Un contrato que se manda a firmar TIENE que ser un PDF (la app lo abre y le
  // estampa las firmas); uno ya firmado en físico es solo evidencia, y ahí vale
  // también el comprimido con los escaneos.
  const adjunto = origen.origenPdf === 'SUBIDO_PARA_FIRMA'
    ? { contenido: await obtenerPdfAdjunto(d, usuario.id), mimeType: 'application/pdf', nombre: null as string | null }
    : await obtenerArchivoAdjunto(d, usuario.id)
  const pdf = adjunto.contenido

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
      origenPdf: origen.origenPdf,
      firmaEmpleadorEnPdf: origen.firmaEmpleadorEnPdf ?? false,
      // Con otrosí queda dicho en el contrato por qué su documento no es el original.
      observaciones: [v(d.observaciones), origen.esOtrosi ? 'Documento firmado: otrosí (no se encontró el contrato original).' : null].filter(Boolean).join('\n') || null,
    },
  })

  // Subir el archivo aportado y registrarlo como Documento del contrato.
  const sha256 = createHash('sha256').update(pdf).digest('hex')
  const comprimido = esComprimido(adjunto.mimeType)
  const extension = extensionDe(adjunto.mimeType)
  const archivo = await subirArchivo(`contratos/${contrato.id}`, `contrato-${numero}.${extension}`, pdf, adjunto.mimeType)
  const documento = await dbAuditado.documento.create({
    data: {
      entidadTipo: 'Contrato',
      entidadId: contrato.id,
      nombre: origen.esOtrosi ? `Otrosí al contrato laboral ${numero}` : `Contrato laboral ${numero}${comprimido ? ' (comprimido)' : ''}`,
      bucket: archivo.bucket,
      storagePath: archivo.storagePath,
      mimeType: adjunto.mimeType,
      tamanoBytes: archivo.tamanoBytes,
      sha256,
      nivelAcceso: 'GENERAL',
      sedeId: contrato.sedeId,
      subidoPorId: usuario.id,
    },
  })

  return { contrato, numero, documentoId: documento.id }
}

/**
 * Con contrato de trabajo cambia lo que se le exige al expediente (Ajustes →
 * Tipos de documento, más la tarjeta profesional si el cargo la pide). Se le
 * dice al colaborador qué le falta al momento del alta, en vez de esperar a que
 * entre al autoservicio y lo descubra. Si no le falta nada, no se le escribe.
 */
async function avisarExpedientePendiente(colaboradorId: string) {
  const uid = await usuarioDeColaborador(colaboradorId)
  if (!uid) return
  const faltan = await documentosFaltantesDe(colaboradorId)
  if (faltan.length === 0) return
  const cuantos = faltan.length === 1 ? 'falta 1 documento' : `faltan ${faltan.length} documentos`
  await avisar(uid, {
    titulo: `Te ${cuantos} para tu expediente laboral`,
    mensaje: `${faltan.join(', ')} · Súbelos en Mis documentos.`,
    enlace: '/autoservicio/documentos',
    llamadoAccion: 'Subir mis documentos',
    evento: 'expediente_pendiente',
  }).catch(() => {})
}

/** Lo que sigue a cualquier alta de contrato laboral: alertas y ficha del colaborador. */
async function cerrarAltaContrato(contratoId: string, colaboradorId: string, tipo: TipoContratoLaboral, cargoId: string | null) {
  await publicarVencimientosContrato(contratoId)
  const vinculoAjustado = await alinearVinculoFicha(colaboradorId, tipo)
  await alinearCargoFicha(colaboradorId, cargoId)
  const reactivado = await reactivarSiEstabaRetirado(colaboradorId)
  await avisarExpedientePendiente(colaboradorId)
  revalidatePath('/contratos')
  return { vinculoAjustado, reactivado }
}

/**
 * Sube un contrato laboral YA EXISTENTE (firmado en físico / hecho fuera del sistema).
 * Crea el registro con los datos estructurados (los necesita nómina y las alertas de
 * vencimiento), marca `origenPdf: SUBIDO` y adjunta el PDF aportado como Documento.
 * No genera plantilla ni exige firma digital: entra ACTIVO (firmado en físico).
 */
export const subirContratoExistente = accion(
  { modulo: 'contratos', accion: 'CREAR', schema: subirContratoLaboralSchema },
  async (d, usuario) => {
    const { contrato, numero } = await registrarContratoSubido(d, usuario, { origenPdf: 'SUBIDO', esOtrosi: d.esOtrosi === true })

    await guardarAutorizacionSubida({
      autorizacionBase64: d.autorizacionBase64, autorizacionRef: d.autorizacionRef,
      entidadTipo: 'Contrato', entidadId: contrato.id, numero, sedeId: contrato.sedeId, usuarioId: usuario.id,
    })
    await Promise.all([borrarPdfTemporal(d.pdfRef), borrarPdfTemporal(d.autorizacionRef)])

    const cierre = await cerrarAltaContrato(contrato.id, d.colaboradorId, d.tipo, v(d.cargoId))
    return { id: contrato.id, ...cierre }
  },
)

/**
 * Sube el PDF de un contrato laboral que se firmará DENTRO de la app: espejo de
 * `subirContratoOpsParaFirma`. El empleado firma desde su autoservicio y el
 * empleador desde el detalle, salvo que el PDF ya venga firmado por él; las
 * firmas se estampan sobre el archivo aportado en las posiciones confirmadas.
 *
 * La autorización de datos (Ley 1581) va aparte del PDF: la arma la app y la
 * firma el empleado junto con el contrato, salvo que ya se haya recogido aparte.
 */
export const subirContratoParaFirma = accion(
  { modulo: 'contratos', accion: 'CREAR', schema: subirContratoLaboralParaFirmaSchema },
  async (d, usuario) => {
    // Sin usuario de acceso el empleado no puede entrar a firmar: se avisa al
    // crear, no cuando alguien se pregunte por qué nunca llegó la firma.
    const uid = await usuarioDeColaborador(d.colaboradorId)
    if (!uid) {
      throw new ErrorNegocio(
        'El colaborador no tiene usuario de acceso, así que no podría firmar desde el autoservicio. Créale el acceso antes de subir el contrato.',
      )
    }
    // O se indica dónde firma el empleador, o se declara que ya firmó en el PDF.
    const empleadorFirmoEnPdf = d.empleadorFirmoEnPdf === true
    if (!empleadorFirmoEnPdf && !d.posicionEmpleador) {
      throw new ErrorNegocio('Indica dónde firma el empleador dentro del PDF, o marca que ya viene firmado por él.')
    }

    const { contrato, numero, documentoId } = await registrarContratoSubido(d, usuario, {
      origenPdf: 'SUBIDO_PARA_FIRMA', firmaEmpleadorEnPdf: empleadorFirmoEnPdf, esOtrosi: d.esOtrosi === true,
    })
    await dbAuditado.contrato.update({
      where: { id: contrato.id },
      data: {
        posicionFirmas: {
          empleado: d.posicionEmpleado,
          empleador: empleadorFirmoEnPdf ? null : d.posicionEmpleador,
          documentoOriginalId: documentoId,
        } as object,
      },
    })

    if (d.generarAutorizacion !== false) {
      try {
        const autorizacion = await datosAutorizacionDeColaborador({
          colaboradorId: d.colaboradorId, vinculo: 'LABORAL', numero,
        })
        // Se guarda en el snapshot para regenerarla firmada cuando el empleado
        // firme; el contrato en sí no va aquí: ese es el PDF subido.
        await dbAuditado.contrato.update({ where: { id: contrato.id }, data: { contenidoPdf: { autorizacion } as object } })
        await generarPdfAutorizacionDatosLaboral({
          contratoId: contrato.id, numero, sedeId: contrato.sedeId, usuarioId: usuario.id, datos: autorizacion,
        })
      } catch (e) {
        // El contrato queda subido aunque falle la autorización; se regenera aparte.
        console.error('No se pudo generar la autorización de datos del contrato laboral subido:', e)
      }
    }

    await avisar(uid, {
      evento: 'contrato_pendiente_firma',
      titulo: d.esOtrosi ? `Firma el otrosí de tu contrato ${numero}` : `Firma tu contrato ${numero}`,
      mensaje: 'Está listo en tu autoservicio.',
      enlace: '/autoservicio/contratos',
      llamadoAccion: 'Revisar y firmar el contrato',
    }).catch(() => {})

    const cierre = await cerrarAltaContrato(contrato.id, d.colaboradorId, d.tipo, v(d.cargoId))
    await borrarPdfTemporal(d.pdfRef)
    revalidatePath(`/contratos/${contrato.id}`)
    return { id: contrato.id, documentoId, ...cierre }
  },
)

/**
 * Lee un PDF recién elegido y propone dónde firma cada parte de un contrato de
 * trabajo (etiquetas "EL TRABAJADOR" / "EL EMPLEADOR"). No guarda nada.
 */
export const analizarPdfContratoLaboral = accion(
  { modulo: 'contratos', accion: 'CREAR', schema: z.object(pdfAdjuntoCampos) },
  async (d, usuario) => {
    const pdf = await obtenerPdfAdjunto(d, usuario.id)
    const [posiciones, paginas] = await Promise.all([ubicarFirmasEnPdf(pdf, 'LABORAL'), contarPaginas(pdf)])
    return { paginas, ...posiciones }
  },
)

/**
 * Abre la corrección de la posición de las firmas de un contrato laboral subido:
 * devuelve el PDF ORIGINAL (sin estampar), las posiciones vigentes y la imagen
 * de cada firma ya dibujada, para que quien corrige vea el trazo real donde va a
 * quedar. No guarda nada.
 */
export const prepararCorreccionFirmaLaboral = accion(
  { modulo: 'contratos', accion: 'EDITAR', schema: z.object({ contratoId: z.uuid() }) },
  async (d) => {
    const c = await prisma.contrato.findUniqueOrThrow({
      where: { id: d.contratoId },
      select: { origenPdf: true, posicionFirmas: true, firmaEmpleadoPath: true, firmaEmpleadorPath: true, firmaEmpleadorEnPdf: true },
    })
    if (c.origenPdf !== 'SUBIDO_PARA_FIRMA') {
      throw new ErrorNegocio('Solo se corrige la posición en contratos cuyo PDF se subió para firmarse en la app.')
    }
    const datos = leerDatosFirmaSubidoLaboral(c.posicionFirmas)
    const original = await prisma.documento.findUnique({ where: { id: datos.documentoOriginalId }, select: { nombre: true, storagePath: true } })
    if (!original) throw new ErrorNegocio('No se encontró el PDF original del contrato.')
    const [pdf, firmaEmpleado, firmaEmpleador] = await Promise.all([
      leerArchivo(original.storagePath),
      c.firmaEmpleadoPath ? leerFirmaComoDataUri(c.firmaEmpleadoPath) : Promise.resolve(null),
      c.firmaEmpleadorPath ? leerFirmaComoDataUri(c.firmaEmpleadorPath) : Promise.resolve(null),
    ])
    const paginas = await contarPaginas(pdf)
    return {
      nombre: original.nombre,
      paginas,
      pdfBase64: `data:application/pdf;base64,${pdf.toString('base64')}`,
      empleado: datos.empleado,
      empleador: datos.empleador,
      empleadorEnPdf: c.firmaEmpleadorEnPdf,
      firmaEmpleado,
      firmaEmpleador,
    }
  },
)

/**
 * Guarda la posición corregida y, si el contrato ya estaba firmado, vuelve a
 * estampar las firmas sobre el original y reemplaza el PDF "(firmado)". Nadie
 * vuelve a firmar: solo cambia dónde se dibuja el trazo.
 */
export const corregirPosicionFirmaLaboral = accion(
  { modulo: 'contratos', accion: 'EDITAR', schema: corregirPosicionFirmaLaboralSchema },
  async (d, usuario) => {
    const r = await corregirPosicionFirmaLaboralServidor({
      contratoId: d.contratoId,
      posicionEmpleado: d.posicionEmpleado,
      posicionEmpleador: d.posicionEmpleador ?? null,
      usuarioId: usuario.id,
    })
    revalidatePath(`/contratos/${d.contratoId}`)
    revalidatePath('/autoservicio/contratos')
    return r
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
  // Es un contrato de trabajo: la autorización habla de "trabajador", no de contratista.
  const autorizacion = await construirDatosAutorizacion({ datos: datosContrato, genero: colab.genero, vinculo: 'LABORAL' })

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
        titulo: `Firma tu contrato ${c.numero}`,
        mensaje: 'Contrato y autorización de datos listos en tu autoservicio.',
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
        titulo: `Tu contrato ${c.numero} cambió antes de la firma`,
        mensaje: 'Revisa la versión nueva y fírmala desde tu autoservicio.',
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

type ContratoParaOtrosi = {
  salarioBase: { toString(): string } | number
  modalidadTrabajo: string
  fechaInicio: Date
  fechaFin: Date | null
  cargo: { nombre: string } | null
  sede: { nombre: string }
}
type CambiosOtrosi = Pick<OtrosiInput | EditarOtrosiInput, 'tiposCambio' | 'salarioNuevo' | 'cargoNuevoId' | 'sedeNuevaId' | 'modalidadNueva' | 'fechaInicioNueva' | 'fechaFinNueva'>

/**
 * Lo que un otrosí cambia en el contrato, a partir de lo marcado en pantalla:
 * los valores de antes y de después (cargo y sede por nombre, para que el
 * resumen se lea sin consultar nada) y los `update` del contrato y de la ficha.
 * Lo comparten el alta y la corrección del otrosí.
 */
async function calcularCambiosOtrosi(contrato: ContratoParaOtrosi, d: CambiosOtrosi, cambiaDuracion: boolean) {
  const antes: ValoresOtrosi = {}
  const despues: ValoresOtrosi = {}
  const updateContrato: Record<string, unknown> = {}
  const updateColab: Record<string, unknown> = {}

  if (d.tiposCambio.includes('SALARIO') && d.salarioNuevo != null) {
    antes.salario = Number(contrato.salarioBase)
    despues.salario = d.salarioNuevo
    updateContrato.salarioBase = d.salarioNuevo
  }
  if (d.tiposCambio.includes('CARGO') && v(d.cargoNuevoId)) {
    const cargo = await prisma.cargo.findUnique({ where: { id: d.cargoNuevoId! }, select: { nombre: true } })
    if (contrato.cargo) antes.cargo = contrato.cargo.nombre
    if (cargo) despues.cargo = cargo.nombre
    updateContrato.cargoId = d.cargoNuevoId
    updateColab.cargoId = d.cargoNuevoId
  }
  if (d.tiposCambio.includes('SEDE') && v(d.sedeNuevaId)) {
    const sede = await prisma.sede.findUnique({ where: { id: d.sedeNuevaId! }, select: { nombre: true } })
    antes.sede = contrato.sede.nombre
    if (sede) despues.sede = sede.nombre
    updateContrato.sedeId = d.sedeNuevaId
    updateColab.sedeId = d.sedeNuevaId
  }
  if (d.tiposCambio.includes('MODALIDAD_TRABAJO') && v(d.modalidadNueva)) {
    antes.modalidad = contrato.modalidadTrabajo
    despues.modalidad = d.modalidadNueva as string
    updateContrato.modalidadTrabajo = d.modalidadNueva
    updateColab.modalidadTrabajo = d.modalidadNueva
  }
  if (cambiaDuracion) {
    // El nuevo periodo pactado. La fecha de inicio del contrato no se toca: es
    // histórica; lo que cambia es hasta cuándo va, y eso mueve las alertas.
    antes.fechaInicio = formatFechaISO(contrato.fechaInicio)
    if (contrato.fechaFin) antes.fechaFin = formatFechaISO(contrato.fechaFin)
    despues.fechaInicio = d.fechaInicioNueva as string
    despues.fechaFin = d.fechaFinNueva as string
    updateContrato.fechaFin = parseFechaISO(d.fechaFinNueva)
  }
  return { antes, despues, updateContrato, updateColab }
}

export const agregarOtrosi = accion(
  { modulo: 'contratos', accion: 'EDITAR', schema: otrosiSchema },
  async (d, usuario) => {
    const contrato = await prisma.contrato.findUniqueOrThrow({
      where: { id: d.contratoId },
      include: {
        otrosis: { select: { numero: true } },
        cargo: { select: { nombre: true } },
        sede: { select: { nombre: true } },
      },
    })
    const pdf = await obtenerPdfAdjunto(d, usuario.id, 'El PDF del otrosí está vacío.')
    // El trabajador firma desde su autoservicio: sin usuario de acceso el otrosí
    // quedaría sin firmar para siempre. Se avisa al registrar, no después.
    const usuarioTrabajador = await usuarioDeColaborador(contrato.colaboradorId)
    if (!usuarioTrabajador) {
      throw new ErrorNegocio(
        'El trabajador no tiene usuario de acceso, así que no podría firmar el otrosí desde su autoservicio. Créale el acceso antes de registrarlo.',
      )
    }

    const numero = Math.max(0, ...contrato.otrosis.map((o) => o.numero)) + 1
    // Fecha del otrosí: si cambia la duración, es el inicio del nuevo periodo;
    // si no, la de hoy (se registra cuando se firma). Es la que rige el cambio
    // (p. ej. desde cuándo aplica el nuevo salario) y la que muestra el historial.
    const cambiaDuracion = d.tiposCambio.includes('DURACION') && !!v(d.fechaInicioNueva) && !!v(d.fechaFinNueva)
    const fechaOtrosi = cambiaDuracion
      ? parseFechaISO(d.fechaInicioNueva)!
      : (parseFechaISO(v(d.fecha)) ?? hoyBogota())
    const { antes, despues, updateContrato, updateColab } = await calcularCambiosOtrosi(contrato, d, cambiaDuracion)
    if (despues.salario != null) {
      await prisma.variacionSalarial.create({
        data: {
          colaboradorId: contrato.colaboradorId,
          salarioAnterior: contrato.salarioBase,
          salarioNuevo: despues.salario,
          fechaVigencia: fechaOtrosi,
          motivo: `Otrosí ${numero}`,
        },
      })
    }

    const otrosi = await dbAuditado.otrosiContrato.create({
      data: {
        contratoId: d.contratoId,
        numero,
        fecha: fechaOtrosi,
        tiposCambio: d.tiposCambio,
        valoresAnteriores: Object.keys(antes).length ? antes : undefined,
        valoresNuevos: Object.keys(despues).length ? despues : undefined,
        // El PDF subido es el otrosí; el trabajador lo firma en la app en esta posición.
        requiereFirma: true,
        posicionFirma: d.posicionFirma,
      },
    })

    // El PDF tal como se subió: base del estampado y referencia para comparar
    // con el firmado. Entidad propia para que la ficha no lo tome por el contrato.
    const sha256 = createHash('sha256').update(pdf).digest('hex')
    const archivo = await subirArchivo(`contratos/${contrato.id}/otrosi-${numero}`, `otrosi-${numero}.pdf`, pdf, 'application/pdf')
    const doc = await dbAuditado.documento.create({
      data: {
        entidadTipo: 'OtrosiContrato',
        entidadId: otrosi.id,
        nombre: `Otrosí ${numero} del contrato ${contrato.numero}`,
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
    await dbAuditado.otrosiContrato.update({
      where: { id: otrosi.id },
      data: { documentoId: doc.id, documentoOriginalId: doc.id },
    })

    if (Object.keys(updateContrato).length) await dbAuditado.contrato.update({ where: { id: d.contratoId }, data: updateContrato })
    if (Object.keys(updateColab).length) await dbAuditado.colaborador.update({ where: { id: contrato.colaboradorId }, data: updateColab })
    if (updateContrato.fechaFin) await publicarVencimientosContrato(d.contratoId)

    const resumen = resumenOtrosi(d.tiposCambio, despues)
    await avisar(usuarioTrabajador, {
      titulo: `Firma el otrosí ${numero} de tu contrato ${contrato.numero}`,
      mensaje: resumen || 'Está listo en tu autoservicio.',
      enlace: '/autoservicio/contratos',
      llamadoAccion: 'Revisar y firmar',
      evento: 'contrato_pendiente_firma',
    }).catch(() => {})

    await borrarPdfTemporal(d.pdfRef)
    revalidatePath(`/contratos/${d.contratoId}`)
    revalidatePath('/autoservicio/contratos')
    return { id: otrosi.id, numero }
  },
)

/**
 * Lee el PDF de un otrosí recién elegido y propone dónde firma el trabajador.
 * No guarda nada: es el paso previo a registrarlo, para que la app proponga la
 * posición y una persona la confirme. Un escaneo (sin capa de texto) devuelve
 * null y la posición se marca a mano.
 */
export const analizarPdfOtrosi = accion(
  { modulo: 'contratos', accion: 'EDITAR', schema: z.object(pdfAdjuntoCampos) },
  async (d, usuario) => {
    const pdf = await obtenerPdfAdjunto(d, usuario.id)
    const [posiciones, paginas] = await Promise.all([ubicarFirmasEnPdf(pdf, 'LABORAL'), contarPaginas(pdf)])
    // En un contrato de trabajo la persona es "EL TRABAJADOR"; la detección lo
    // entrega en la clave `contratista` (la de quien se vincula).
    return { paginas, trabajador: posiciones.contratista }
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

/**
 * Borra un contrato laboral que se registró por error (p. ej. se subió el PDF
 * a la persona equivocada o por duplicado). Solo para eso: un contrato con
 * historia —firmado por el trabajador en la app, con prórrogas, otrosíes o
 * suspensiones— no se borra, se termina por el módulo de Terminaciones.
 *
 * Se lleva su PDF y su autorización de datos, sus alertas de vencimiento y sus
 * evidencias de firma, y deja la ficha con el vínculo que le corresponde por
 * los contratos que le quedan. Queda en la auditoría quién lo borró.
 */
export const eliminarContratoLaboral = accion(
  { modulo: 'contratos', accion: 'ELIMINAR', schema: z.object({ id: z.uuid() }) },
  async ({ id }) => {
    const c = await prisma.contrato.findUniqueOrThrow({
      where: { id },
      include: { _count: { select: { prorrogas: true, otrosis: true, suspensiones: true } } },
    })
    if (c.firmaEmpleadoPath) {
      throw new ErrorNegocio('Este contrato ya lo firmó el trabajador en la app: no se borra, se termina desde Terminaciones.')
    }
    const historia = c._count.prorrogas + c._count.otrosis + c._count.suspensiones
    if (historia > 0) {
      throw new ErrorNegocio('Este contrato tiene prórrogas, otrosíes o suspensiones: no se borra, se termina desde Terminaciones.')
    }

    // Sus documentos (contrato, autorización de datos) y sus alertas.
    const docs = await prisma.documento.findMany({ where: { entidadTipo: 'Contrato', entidadId: id }, select: { id: true } })
    for (const d of docs) await eliminarDocumento(d.id)
    await cancelarVencimiento('Contrato', id)
    // Las evidencias de firma caen en cascada con el contrato.
    await dbAuditado.contrato.delete({ where: { id } })

    // La ficha vuelve al vínculo de lo que le queda: otro laboral activo, o su OPS.
    const [otroLaboral, ops] = await Promise.all([
      prisma.contrato.findFirst({ where: { colaboradorId: c.colaboradorId, estado: 'ACTIVO' }, orderBy: { fechaInicio: 'desc' }, select: { tipo: true } }),
      prisma.contratoOps.findFirst({ where: { colaboradorId: c.colaboradorId, estado: 'ACTIVO' }, select: { id: true } }),
    ])
    const vinculo: TipoVinculo | null = otroLaboral ? vinculoDeContrato(otroLaboral.tipo as TipoContratoLaboral) : ops ? 'OPS' : null
    if (vinculo) await dbAuditado.colaborador.update({ where: { id: c.colaboradorId }, data: { tipoVinculo: vinculo } })

    revalidatePath('/contratos')
    revalidatePath(`/colaboradores/${c.colaboradorId}`)
    revalidatePath('/autoservicio/contratos')
    return { colaboradorId: c.colaboradorId, numero: c.numero }
  },
)

export const reactivarContrato = accion(
  { modulo: 'contratos', accion: 'EDITAR', schema: z.object({ id: z.uuid() }) },
  async ({ id }) => {
    await dbAuditado.contrato.update({ where: { id }, data: { estado: 'ACTIVO' } })
    revalidatePath(`/contratos/${id}`)
  },
)

// ——— Corregir y anular las modificaciones del contrato ———

/** Resumen "del 01/07/2026 al 31/12/2026" para avisos y auditoría. */
function rango(ini: Date, fin: Date | null) {
  return fin ? `del ${fechaBreve(ini)} al ${fechaBreve(fin)}` : `desde el ${fechaBreve(ini)}`
}

/**
 * Deshace en el contrato y en la ficha lo que un otrosí había cambiado, con lo
 * guardado en `valoresAnteriores`. Cargo y sede se guardaron por nombre, así que
 * se buscan por nombre; si ya no existen, ese campo se deja como está.
 */
async function revertirValoresOtrosi(
  contrato: { id: string; colaboradorId: string },
  tipos: readonly string[],
  antes: ValoresOtrosi,
): Promise<void> {
  const updateContrato: Record<string, unknown> = {}
  const updateColab: Record<string, unknown> = {}
  if (tipos.includes('SALARIO') && antes.salario != null) updateContrato.salarioBase = antes.salario
  if (tipos.includes('CARGO') && antes.cargo !== undefined) {
    const cargo = await prisma.cargo.findFirst({ where: { nombre: antes.cargo }, select: { id: true } })
    if (cargo) { updateContrato.cargoId = cargo.id; updateColab.cargoId = cargo.id }
  }
  if (tipos.includes('SEDE') && antes.sede !== undefined) {
    const sede = await prisma.sede.findFirst({ where: { nombre: antes.sede }, select: { id: true } })
    if (sede) { updateContrato.sedeId = sede.id; updateColab.sedeId = sede.id }
  }
  if (tipos.includes('MODALIDAD_TRABAJO') && antes.modalidad) {
    updateContrato.modalidadTrabajo = antes.modalidad
    updateColab.modalidadTrabajo = antes.modalidad
  }
  if (tipos.includes('DURACION') && antes.fechaInicio !== undefined) {
    // Si antes no había fecha de fin (indefinido), vuelve a quedar sin ella.
    updateContrato.fechaFin = antes.fechaFin ? parseFechaISO(antes.fechaFin) : null
  }
  if (Object.keys(updateContrato).length) await dbAuditado.contrato.update({ where: { id: contrato.id }, data: updateContrato })
  if (Object.keys(updateColab).length) await dbAuditado.colaborador.update({ where: { id: contrato.colaboradorId }, data: updateColab })
}

/** Avisa al trabajador de un cambio en algo que estaba por firmar o que ya contaba. */
async function avisarCambioContrato(colaboradorId: string, titulo: string, mensaje: string) {
  const uid = await usuarioDeColaborador(colaboradorId)
  if (!uid) return
  await avisar(uid, { evento: 'contrato_actualizado', titulo, mensaje, enlace: '/autoservicio/contratos', llamadoAccion: 'Ver mis contratos' }).catch(() => {})
}

/**
 * Corregir las fechas de una prórroga. Si una nómina cerrada ya corrió sobre
 * fechas posteriores a su inicio, contó con este periodo: no se toca. Cuando
 * es la prórroga más reciente, el contrato se mueve con ella.
 */
export const editarProrroga = accion(
  { modulo: 'contratos', accion: 'EDITAR', schema: editarProrrogaSchema },
  async (d) => {
    const p = await prisma.prorrogaContrato.findUniqueOrThrow({
      where: { id: d.id },
      include: { contrato: { select: { id: true, colaboradorId: true, prorrogas: { select: { numero: true } } } } },
    })
    const inicio = parseFechaISO(d.fechaInicio)!, fin = parseFechaISO(d.fechaFin)!
    if (fin < inicio) throw new ErrorNegocio('La fecha de fin debe ser igual o posterior a la de inicio.')
    const cambiaFechas = p.fechaInicio.getTime() !== inicio.getTime() || p.fechaFin.getTime() !== fin.getTime()
    if (cambiaFechas) {
      await exigirNoLiquidadaEnNominaCerrada(
        { colaboradorId: p.contrato.colaboradorId, fechaInicio: menorFecha(p.fechaInicio, inicio), fechaFin: FECHA_LEJANA },
        `La prórroga ${p.numero}`,
      )
    }
    await dbAuditado.prorrogaContrato.update({
      where: { id: p.id },
      data: { fechaInicio: inicio, fechaFin: fin, fechaFirma: parseFechaISO(v(d.fechaFirma)) },
    })
    const esUltima = p.numero === Math.max(...p.contrato.prorrogas.map((x) => x.numero))
    if (esUltima && cambiaFechas) {
      await dbAuditado.contrato.update({ where: { id: p.contrato.id }, data: { fechaFin: fin } })
      await publicarVencimientosContrato(p.contrato.id)
    }
    revalidatePath(`/contratos/${p.contrato.id}`)
    revalidatePath('/contratos')
    return { ok: true }
  },
)

/**
 * Anular una prórroga registrada por error. Solo la más reciente: las anteriores
 * ya quedaron absorbidas por las que siguieron. El contrato vuelve a la fecha de
 * fin que tenía (ver `fechaFinTrasAnularProrroga`), y se borra su PDF.
 */
export const anularProrroga = accion(
  { modulo: 'contratos', accion: 'ELIMINAR', schema: anulacionContratoSchema },
  async (d) => {
    const p = await prisma.prorrogaContrato.findUniqueOrThrow({
      where: { id: d.id },
      include: { contrato: { select: { id: true, numero: true, colaboradorId: true, prorrogas: { select: { numero: true, fechaFin: true }, orderBy: { numero: 'asc' } } } } },
    })
    const ultima = p.contrato.prorrogas[p.contrato.prorrogas.length - 1]
    if (ultima.numero !== p.numero) {
      throw new ErrorNegocio(`Solo se anula la prórroga más reciente (la ${ultima.numero}): las anteriores ya quedaron cubiertas por las que siguieron.`)
    }
    await exigirNoLiquidadaEnNominaCerrada(
      { colaboradorId: p.contrato.colaboradorId, fechaInicio: p.fechaInicio, fechaFin: FECHA_LEJANA },
      `La prórroga ${p.numero}`,
    )
    const previa = p.contrato.prorrogas.find((x) => x.numero === p.numero - 1) ?? null
    const fechaFin = fechaFinTrasAnularProrroga(p, previa)

    if (p.documentoId) await eliminarDocumento(p.documentoId).catch(() => {})
    await dbAuditado.prorrogaContrato.delete({ where: { id: p.id } })
    await auditar('ELIMINAR', 'ProrrogaContrato', { registroId: p.id, descripcion: `Anulado: ${d.motivo}` })
    await dbAuditado.contrato.update({ where: { id: p.contrato.id }, data: { fechaFin } })
    await publicarVencimientosContrato(p.contrato.id)

    revalidatePath(`/contratos/${p.contrato.id}`)
    revalidatePath('/contratos')
    return { ok: true }
  },
)

/**
 * Corregir un otrosí que el trabajador todavía no firmó: fecha, descripción y lo
 * pactado. Lo pactado solo se cambia en el otrosí más reciente (los anteriores
 * ya fueron pisados por los que siguieron); el PDF no se cambia aquí: si está
 * mal, se anula el otrosí y se registra de nuevo. El trabajador recibe aviso
 * porque lo tenía pendiente de firma.
 */
export const editarOtrosi = accion(
  { modulo: 'contratos', accion: 'EDITAR', schema: editarOtrosiSchema },
  async (d) => {
    const o = await prisma.otrosiContrato.findUniqueOrThrow({
      where: { id: d.id },
      include: {
        contrato: { include: { otrosis: { select: { numero: true } }, cargo: { select: { nombre: true } }, sede: { select: { nombre: true } } } },
      },
    })
    if (o.firmaEmpleadoPath) throw new ErrorNegocio(`El otrosí ${o.numero} ya está firmado por el trabajador: no se puede cambiar ni anular.`)
    const contrato = o.contrato
    const esUltimo = o.numero === Math.max(...contrato.otrosis.map((x) => x.numero))

    const cambiaDuracion = d.tiposCambio.includes('DURACION') && !!v(d.fechaInicioNueva) && !!v(d.fechaFinNueva)
    const fechaNueva = cambiaDuracion ? parseFechaISO(d.fechaInicioNueva)! : (parseFechaISO(v(d.fecha)) ?? o.fecha)
    const antesGuardado = (o.valoresAnteriores as ValoresOtrosi | null) ?? {}
    const despuesGuardado = (o.valoresNuevos as ValoresOtrosi | null) ?? {}

    // Lo pactado cambia si cambian los tipos o alguno de sus valores.
    const previo = await calcularCambiosOtrosi(contrato, d, cambiaDuracion)
    const estable = (x: ValoresOtrosi) => JSON.stringify(x, Object.keys(x).sort())
    const tiposIguales = [...o.tiposCambio].sort().join() === [...d.tiposCambio].sort().join()
    const cambiaPactado = !tiposIguales || estable(previo.despues) !== estable(despuesGuardado)
    if (cambiaPactado && !esUltimo) {
      throw new ErrorNegocio(`Solo el otrosí más reciente puede cambiar lo pactado; en el otrosí ${o.numero} solo se corrige la fecha y la descripción.`)
    }
    const cambiaFecha = fechaNueva.getTime() !== o.fecha.getTime()
    if ((cambiaFecha || cambiaPactado) && (o.tiposCambio.includes('SALARIO') || d.tiposCambio.includes('SALARIO'))) {
      await exigirNoLiquidadaEnNominaCerrada(
        { colaboradorId: contrato.colaboradorId, fechaInicio: menorFecha(o.fecha, fechaNueva), fechaFin: FECHA_LEJANA },
        `El otrosí ${o.numero}`,
      )
    }

    let antes: ValoresOtrosi = antesGuardado
    let despues: ValoresOtrosi = despuesGuardado
    if (cambiaPactado) {
      // Primero se deshace lo que el otrosí había puesto (vuelve al "antes"
      // guardado) y luego se aplica lo nuevo sobre ese estado.
      await revertirValoresOtrosi(contrato, o.tiposCambio, antesGuardado)
      const base = await prisma.contrato.findUniqueOrThrow({
        where: { id: contrato.id },
        include: { cargo: { select: { nombre: true } }, sede: { select: { nombre: true } } },
      })
      const calc = await calcularCambiosOtrosi(base, d, cambiaDuracion)
      antes = calc.antes
      despues = calc.despues
      if (Object.keys(calc.updateContrato).length) await dbAuditado.contrato.update({ where: { id: contrato.id }, data: calc.updateContrato })
      if (Object.keys(calc.updateColab).length) await dbAuditado.colaborador.update({ where: { id: contrato.colaboradorId }, data: calc.updateColab })
    }

    // La variación salarial que dejó el otrosí sigue al otrosí.
    const variacion = await prisma.variacionSalarial.findFirst({ where: { colaboradorId: contrato.colaboradorId, motivo: `Otrosí ${o.numero}` } })
    if (despues.salario != null) {
      const datos = { salarioAnterior: antes.salario ?? Number(contrato.salarioBase), salarioNuevo: despues.salario, fechaVigencia: fechaNueva }
      if (variacion) await dbAuditado.variacionSalarial.update({ where: { id: variacion.id }, data: datos })
      else await dbAuditado.variacionSalarial.create({ data: { colaboradorId: contrato.colaboradorId, motivo: `Otrosí ${o.numero}`, ...datos } })
    } else if (variacion) {
      await dbAuditado.variacionSalarial.delete({ where: { id: variacion.id } })
    }

    await dbAuditado.otrosiContrato.update({
      where: { id: o.id },
      data: {
        fecha: fechaNueva,
        descripcion: v(d.descripcion),
        tiposCambio: d.tiposCambio,
        valoresAnteriores: Object.keys(antes).length ? antes : undefined,
        valoresNuevos: Object.keys(despues).length ? despues : undefined,
      },
    })
    if (cambiaPactado && (o.tiposCambio.includes('DURACION') || d.tiposCambio.includes('DURACION'))) await publicarVencimientosContrato(contrato.id)

    if (o.requiereFirma) {
      await avisarCambioContrato(contrato.colaboradorId, `El otrosí ${o.numero} de tu contrato ${contrato.numero} cambió antes de tu firma`, resumenOtrosi(d.tiposCambio, despues) || 'Revisa la versión nueva en tu autoservicio.')
    }
    revalidatePath(`/contratos/${contrato.id}`)
    revalidatePath(`/colaboradores/${contrato.colaboradorId}`)
    revalidatePath('/autoservicio/contratos')
    return { ok: true }
  },
)

/**
 * Anular un otrosí que el trabajador no ha firmado. Solo el más reciente, para
 * que al deshacer sus valores el contrato quede como estaba. Se lleva sus PDF
 * (subido y, si lo hubo, estampado) y la variación salarial que creó, y
 * restaura el salario, cargo, sede, modalidad y fecha de fin anteriores.
 */
export const anularOtrosi = accion(
  { modulo: 'contratos', accion: 'ELIMINAR', schema: anulacionContratoSchema },
  async (d) => {
    const o = await prisma.otrosiContrato.findUniqueOrThrow({
      where: { id: d.id },
      include: { contrato: { select: { id: true, numero: true, colaboradorId: true, otrosis: { select: { numero: true } } } } },
    })
    if (o.firmaEmpleadoPath) throw new ErrorNegocio(`El otrosí ${o.numero} ya está firmado por el trabajador: no se puede cambiar ni anular.`)
    const ultimo = Math.max(...o.contrato.otrosis.map((x) => x.numero))
    if (o.numero !== ultimo) {
      throw new ErrorNegocio(`Solo se anula el otrosí más reciente (el ${ultimo}): los anteriores ya quedaron pisados por los que siguieron.`)
    }
    if (o.tiposCambio.includes('SALARIO')) {
      await exigirNoLiquidadaEnNominaCerrada(
        { colaboradorId: o.contrato.colaboradorId, fechaInicio: o.fecha, fechaFin: FECHA_LEJANA },
        `El otrosí ${o.numero}`,
      )
    }

    const antes = (o.valoresAnteriores as ValoresOtrosi | null) ?? {}
    await revertirValoresOtrosi(o.contrato, o.tiposCambio, antes)
    await dbAuditado.variacionSalarial.deleteMany({ where: { colaboradorId: o.contrato.colaboradorId, motivo: `Otrosí ${o.numero}` } })

    const docs = await prisma.documento.findMany({ where: { entidadTipo: 'OtrosiContrato', entidadId: o.id }, select: { id: true } })
    for (const doc of docs) await eliminarDocumento(doc.id).catch(() => {})
    // Las evidencias de firma caen en cascada con el otrosí.
    await dbAuditado.otrosiContrato.delete({ where: { id: o.id } })
    await auditar('ELIMINAR', 'OtrosiContrato', { registroId: o.id, descripcion: `Anulado: ${d.motivo}` })
    if (o.tiposCambio.includes('DURACION')) await publicarVencimientosContrato(o.contrato.id)

    if (o.requiereFirma) {
      await avisarCambioContrato(o.contrato.colaboradorId, `Se anuló el otrosí ${o.numero} de tu contrato ${o.contrato.numero}`, `Ya no tienes que firmarlo. Motivo: ${d.motivo}`)
    }
    revalidatePath(`/contratos/${o.contrato.id}`)
    revalidatePath(`/colaboradores/${o.contrato.colaboradorId}`)
    revalidatePath('/autoservicio/contratos')
    return { ok: true }
  },
)

/** Deja el estado del contrato acorde con las suspensiones que le quedan. */
async function recalcularEstadoSuspension(contratoId: string) {
  const c = await prisma.contrato.findUniqueOrThrow({ where: { id: contratoId }, select: { estado: true, suspensiones: { select: { fechaFin: true } } } })
  if (c.estado !== 'ACTIVO' && c.estado !== 'SUSPENDIDO') return
  const estado = sigueSuspendido(c.suspensiones, hoyBogota()) ? 'SUSPENDIDO' : 'ACTIVO'
  if (estado !== c.estado) await dbAuditado.contrato.update({ where: { id: contratoId }, data: { estado } })
}

/**
 * Corregir una suspensión (fechas, causa, descripción). Si una nómina cerrada ya
 * descontó los días del periodo que cambia, no se toca.
 */
export const editarSuspension = accion(
  { modulo: 'contratos', accion: 'EDITAR', schema: editarSuspensionSchema },
  async (d) => {
    const s = await prisma.suspensionContrato.findUniqueOrThrow({ where: { id: d.id }, include: { contrato: { select: { id: true, colaboradorId: true } } } })
    const inicio = parseFechaISO(d.fechaInicio)!, fin = parseFechaISO(v(d.fechaFin))
    if (fin && fin < inicio) throw new ErrorNegocio('La fecha de fin debe ser igual o posterior a la de inicio.')
    const cambiaFechas = s.fechaInicio.getTime() !== inicio.getTime() || (s.fechaFin?.getTime() ?? null) !== (fin?.getTime() ?? null)
    if (cambiaFechas) {
      await exigirNoLiquidadaEnNominaCerrada(
        { colaboradorId: s.contrato.colaboradorId, fechaInicio: menorFecha(s.fechaInicio, inicio), fechaFin: mayorFechaOAbierta(s.fechaFin, fin) ?? FECHA_LEJANA },
        'Esta suspensión',
      )
    }
    await dbAuditado.suspensionContrato.update({
      where: { id: s.id },
      data: { fechaInicio: inicio, fechaFin: fin, causa: d.causa, descripcion: v(d.descripcion) },
    })
    await recalcularEstadoSuspension(s.contrato.id)
    revalidatePath(`/contratos/${s.contrato.id}`)
    revalidatePath('/contratos')
    return { ok: true }
  },
)

/** Anular una suspensión registrada por error; el contrato vuelve a ACTIVO si no le quedan suspensiones vigentes. */
export const anularSuspension = accion(
  { modulo: 'contratos', accion: 'ELIMINAR', schema: anulacionContratoSchema },
  async (d) => {
    const s = await prisma.suspensionContrato.findUniqueOrThrow({ where: { id: d.id }, include: { contrato: { select: { id: true, colaboradorId: true } } } })
    await exigirNoLiquidadaEnNominaCerrada(
      { colaboradorId: s.contrato.colaboradorId, fechaInicio: s.fechaInicio, fechaFin: s.fechaFin ?? FECHA_LEJANA },
      'Esta suspensión',
    )
    await dbAuditado.suspensionContrato.delete({ where: { id: s.id } })
    await auditar('ELIMINAR', 'SuspensionContrato', { registroId: s.id, descripcion: `Anulada (${rango(s.fechaInicio, s.fechaFin)}): ${d.motivo}` })
    await recalcularEstadoSuspension(s.contrato.id)
    revalidatePath(`/contratos/${s.contrato.id}`)
    revalidatePath('/contratos')
    return { ok: true }
  },
)

/** El contrato laboral vigente del colaborador, que es el que lleva el salario. */
async function contratoVigenteDe(colaboradorId: string) {
  return prisma.contrato.findFirst({
    where: { colaboradorId, estado: { in: ['ACTIVO', 'SUSPENDIDO'] } },
    orderBy: { fechaInicio: 'desc' },
    select: { id: true },
  })
}

/**
 * Corregir una variación salarial (valor, fecha, motivo). Si es la más reciente
 * del colaborador, el salario del contrato vigente queda en el valor corregido.
 * Las que nacieron de un otrosí se corrigen desde el otrosí, que es el documento.
 */
export const editarVariacionSalarial = accion(
  { modulo: 'contratos', accion: 'EDITAR', schema: editarVariacionSalarialSchema },
  async (d) => {
    const vs = await prisma.variacionSalarial.findUniqueOrThrow({ where: { id: d.id } })
    const otrosi = numeroOtrosiDeMotivo(vs.motivo)
    if (otrosi) throw new ErrorNegocio(`Esta variación nació del otrosí ${otrosi}: corrígela o anúlala desde el otrosí, en Modificaciones.`)
    const fecha = parseFechaISO(d.fechaVigencia)!
    const cambia = Number(vs.salarioNuevo) !== d.salarioNuevo || vs.fechaVigencia.getTime() !== fecha.getTime()
    if (cambia) {
      await exigirNoLiquidadaEnNominaCerrada(
        { colaboradorId: vs.colaboradorId, fechaInicio: menorFecha(vs.fechaVigencia, fecha), fechaFin: FECHA_LEJANA },
        'Esta variación salarial',
      )
    }
    await dbAuditado.variacionSalarial.update({
      where: { id: vs.id },
      data: { salarioNuevo: d.salarioNuevo, fechaVigencia: fecha, motivo: v(d.motivo) },
    })
    const todas = await prisma.variacionSalarial.findMany({ where: { colaboradorId: vs.colaboradorId }, select: { id: true, fechaVigencia: true, creadoEn: true } })
    if (cambia && esVariacionMasReciente(vs.id, todas)) {
      const c = await contratoVigenteDe(vs.colaboradorId)
      if (c) await dbAuditado.contrato.update({ where: { id: c.id }, data: { salarioBase: d.salarioNuevo } })
    }
    revalidatePath(`/colaboradores/${vs.colaboradorId}`)
    revalidatePath('/contratos')
    return { ok: true }
  },
)

/**
 * Eliminar una variación salarial registrada por error. Si era la más reciente,
 * el contrato vigente vuelve al salario anterior de esa variación.
 */
export const eliminarVariacionSalarial = accion(
  { modulo: 'contratos', accion: 'ELIMINAR', schema: anulacionContratoSchema },
  async (d) => {
    const vs = await prisma.variacionSalarial.findUniqueOrThrow({ where: { id: d.id } })
    const otrosi = numeroOtrosiDeMotivo(vs.motivo)
    if (otrosi) throw new ErrorNegocio(`Esta variación nació del otrosí ${otrosi}: anula el otrosí desde Modificaciones y la variación se va con él.`)
    await exigirNoLiquidadaEnNominaCerrada(
      { colaboradorId: vs.colaboradorId, fechaInicio: vs.fechaVigencia, fechaFin: FECHA_LEJANA },
      'Esta variación salarial',
    )
    const todas = await prisma.variacionSalarial.findMany({ where: { colaboradorId: vs.colaboradorId }, select: { id: true, fechaVigencia: true, creadoEn: true } })
    const eraLaVigente = esVariacionMasReciente(vs.id, todas)
    await dbAuditado.variacionSalarial.delete({ where: { id: vs.id } })
    await auditar('ELIMINAR', 'VariacionSalarial', { registroId: vs.id, descripcion: `Anulado: ${d.motivo}` })
    if (eraLaVigente) {
      const c = await contratoVigenteDe(vs.colaboradorId)
      if (c) await dbAuditado.contrato.update({ where: { id: c.id }, data: { salarioBase: vs.salarioAnterior } })
    }
    revalidatePath(`/colaboradores/${vs.colaboradorId}`)
    revalidatePath('/contratos')
    return { ok: true }
  },
)
