'use server'

import { createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dbAuditado, auditar } from '@/lib/auditoria'
import { subirArchivo, leerArchivo } from '@/server/storage'
import { guardarAutorizacionSubida } from '@/server/contratos-autorizacion-subida'
import { datosAutorizacionDeColaborador } from '@/server/contratos-autorizacion-datos'
import { alinearCargoFicha } from '@/server/colaborador-cargo'
import { accion, ErrorNegocio } from '@/server/accion'
import { borrarPdfTemporal, obtenerPdfAdjunto } from '@/server/archivos-temporales'
import { pdfAdjuntoCampos } from '@/lib/validaciones/pdf-adjunto'
import { contratoOpsSchema, subirContratoOpsSchema, subirContratoOpsParaFirmaSchema, habilitarFirmaOpsSchema, corregirPosicionFirmaOpsSchema, soporteSsSchema, firmarContratoOpsSchema, entregableOpsSchema, cerrarContratoOpsSchema } from '@/lib/validaciones/contrato'
import { parseFechaISO, formatFechaISO, hoyBogota } from '@/lib/fechas'
import { publicarVencimiento, resolverVencimiento, cancelarVencimiento } from '@/server/vencimientos/servicio'
import { eliminarDocumento } from '@/server/documentos'
import { vinculoDeContrato, type TipoContratoLaboral, type TipoVinculo } from '@/lib/vinculo-contrato'
import { construirDatosPdfContratoOps, construirDatosAutorizacion, generarPdfContratoOps, generarPdfAutorizacionDatos, leerFirmaComoDataUri, type SnapshotContratoOps } from '@/server/contratos-ops-pdf'
import { fechaLarga } from '@/lib/numero-letras'
import { aplicarFirmaContratoOps, corregirPosicionFirmaContratoOps as corregirPosicionFirmaOpsServidor } from '@/server/contratos-ops-firma'
import { leerDatosFirmaSubido } from '@/server/contratos-ops-estampar'
import { avisar, usuarioDeColaborador } from '@/server/notificaciones/avisar'
import { fechaBreve } from '@/lib/notificaciones/texto'
import { generarPdfCuentaCobro } from '@/server/cuentas-cobro'
import { parseFuncionesTexto, type FuncionesCargo, type ClausulaPlantilla } from '@/lib/contrato-variables'
import { ubicarFirmasEnPdf, contarPaginas } from '@/server/pdf/firma-en-pdf'
import { restringirAccesoSiSinVinculo } from '@/server/rol-consulta'
import { MOTIVO_CIERRE_TEXTO } from '@/lib/contratos-cierre'

const v = (s: string | undefined | null) => (s && s !== '' ? s : null)

/**
 * Publica (o resuelve) el vencimiento de un contrato OPS.
 *
 * Un contrato de prestación de servicios vence en su fecha de fin igual que un
 * laboral a término fijo, pero hasta ahora nadie lo publicaba: los OPS no
 * generaban ninguna alerta previa, y lo único que avisaba era el recordatorio
 * semanal de «contrato vencido sin cerrar», que por diseño llega cuando la fecha
 * ya pasó. Por eso la notificación siempre parecía tardía.
 *
 * Se resuelve cuando el contrato deja de estar vigente o se queda sin fecha de
 * fin, para no seguir alertando por algo que ya se cerró.
 *
 * NO se exporta: en un archivo `'use server'` cada export queda expuesto como
 * endpoint invocable desde el navegador y sin la validación de permisos que da
 * `accion()`. El relleno de los contratos ya existentes vive en
 * `@/server/vencimientos/contratos-ops`, que es código server-only normal.
 */
async function publicarVencimientoOps(contratoId: string) {
  const c = await prisma.contratoOps.findUniqueOrThrow({
    where: { id: contratoId },
    include: { colaborador: { select: { nombres: true, apellidos: true } } },
  })
  const vigente = c.estado === 'ACTIVO' || c.estado === 'FIRMADO'
  if (!vigente || !c.fechaFin) {
    await resolverVencimiento('ContratoOps', c.id, 'CONTRATO_OPS')
    return
  }
  const persona = c.colaborador
    ? `${c.colaborador.nombres} ${c.colaborador.apellidos}`
    : 'contratista sin ficha'
  await publicarVencimiento({
    origen: 'CONTRATO_OPS',
    entidadTipo: 'ContratoOps',
    entidadId: c.id,
    titulo: `Vence contrato OPS ${c.numero} — ${persona}`,
    detalle: c.objeto,
    fechaVencimientoISO: formatFechaISO(c.fechaFin),
    sedeId: c.sedeId,
  })
}

/** Serie KC-###: siguiente consecutivo desde el mayor existente (no se repite aunque se borren). */
async function siguienteNumeroOps(): Promise<string> {
  const contratos = await prisma.contratoOps.findMany({
    where: { numero: { startsWith: 'KC-' } },
    select: { numero: true },
  })
  const mayor = contratos.reduce((m, c) => {
    const n = parseInt(c.numero.slice(3), 10)
    return Number.isFinite(n) && n > m ? n : m
  }, 0)
  return `KC-${String(mayor + 1).padStart(3, '0')}`
}

/**
 * El objeto ya no se teclea aparte al crear: lo dice la cláusula de OBJETO, que
 * se redacta con el rol pactado (`cargoObjeto`). Aquí se deriva el resumen que
 * guardamos en la columna, porque listados, detalle y autoservicio lo muestran.
 */
async function objetoDerivado(d: { objeto?: string; cargoObjeto?: string; cargoId?: string }): Promise<string> {
  const explicito = d.objeto?.trim()
  if (explicito) return explicito
  const rol = d.cargoObjeto?.trim()
    || (d.cargoId
      ? (await prisma.cargo.findUnique({ where: { id: d.cargoId }, select: { nombre: true } }))?.nombre
      : null)
  return rol ? `Prestación de servicios como ${rol}` : 'Prestación de servicios'
}

export const crearContratoOps = accion(
  { modulo: 'contratos', accion: 'CREAR', schema: contratoOpsSchema },
  async (d, usuario) => {
    const numero = v(d.numero) ?? (await siguienteNumeroOps())
    const c = await dbAuditado.contratoOps.create({
      data: {
        numero,
        ...(d.colaboradorId ? { colaboradorId: d.colaboradorId } : {}),
        objeto: await objetoDerivado(d),
        valorTotal: d.valorTotal,
        valorMensual: d.valorMensual ?? null,
        supervisorId: v(d.supervisorId),
        cargoId: v(d.cargoId),
        sedeId: d.sedeId,
        fechaInicio: parseFechaISO(d.fechaInicio)!,
        fechaFin: parseFechaISO(d.fechaFin)!,
        rut: v(d.rut),
        estado: 'ACTIVO',
      },
    })

    if (d.entregables && d.entregables.length > 0) {
      await dbAuditado.entregableOps.createMany({
        data: d.entregables.map((e) => ({
          contratoOpsId: c.id,
          descripcion: e.descripcion,
          fechaEntrega: e.fechaEntrega ? parseFechaISO(e.fechaEntrega) : null,
        })),
      })
    }

    let documentoId: string | null = null
    if (d.generarPdf !== false) {
      try {
        // Plantilla: usa el texto editado en el formulario; si no vino, la de la BD.
        let clausulas: ClausulaPlantilla[]
        let titulo = v(d.plantillaTitulo) ?? ''
        let intro = d.plantillaIntro ?? ''
        let cierre = d.plantillaCierre ?? ''
        if (d.clausulas && d.clausulas.length > 0) {
          clausulas = d.clausulas.map((cl, i) => ({ titulo: cl.titulo, cuerpo: cl.cuerpo, esFunciones: cl.esFunciones ?? false, orden: i + 1 }))
        } else {
          const pl = await prisma.plantillaContrato.findFirst({ where: { tipo: 'OPS', activa: true }, include: { clausulas: { orderBy: { orden: 'asc' } } } })
          if (!pl) throw new Error('No hay plantilla OPS activa.')
          titulo = titulo || pl.titulo
          intro = intro || pl.intro
          cierre = cierre || pl.cierre
          clausulas = pl.clausulas.map((cl) => ({ titulo: cl.titulo, cuerpo: cl.cuerpo, esFunciones: cl.esFunciones, orden: cl.orden }))
        }

        // Funciones: estructura editada, o texto, o las del cargo.
        let funciones: FuncionesCargo | null = null
        if (d.funciones && d.funciones.length > 0) {
          funciones = d.funciones
        } else if (d.funcionesTexto && d.funcionesTexto.trim()) {
          funciones = parseFuncionesTexto(d.funcionesTexto)
        } else if (d.cargoId) {
          const cargo = await prisma.cargo.findUnique({ where: { id: d.cargoId } })
          funciones = (cargo?.funcionesContrato as FuncionesCargo | null) ?? null
        }

        const datosContrato = {
          empresa: {
            razonSocial: v(d.empresaRazonSocial) ?? '',
            marca: v(d.empresaMarca),
            nit: v(d.empresaNit),
            representanteLegal: v(d.empresaRepLegal),
            representanteLegalCc: v(d.empresaRepLegalCc),
            correoDevolucion: v(d.empresaCorreoDevolucion),
          },
          contratista: {
            nombre: v(d.contratistaNombre),
            cc: v(d.contratistaCc),
            ccLugar: v(d.contratistaCcLugar),
            direccion: v(d.contratistaDireccion),
            email: v(d.contratistaEmail),
            telefono: v(d.contratistaTelefono),
            genero: v(d.contratistaGenero),
          },
          contrato: {
            numero,
            ciudad: v(d.ciudad),
            fechaSuscripcion: v(d.fechaSuscripcion),
            fechaInicio: d.fechaInicio,
            fechaFin: d.fechaFin,
            plazoMeses: d.plazoMeses ?? null,
            valorTotal: d.valorTotal,
            honorarioMensual: d.valorMensual ?? null,
            cargoObjeto: v(d.cargoObjeto),
          },
        }

        // Snapshot de datos resueltos (contrato + autorización de datos): se guarda
        // para regenerar los documentos firmados más tarde sin re-derivar el formulario.
        const datosPdf = await construirDatosPdfContratoOps({
          datos: datosContrato,
          plantilla: { titulo, intro, cierre, clausulas },
          funciones,
        })
        const autorizacion = await construirDatosAutorizacion({ datos: datosContrato, genero: v(d.contratistaGenero) })
        await dbAuditado.contratoOps.update({
          where: { id: c.id },
          data: { contenidoPdf: { ...datosPdf, autorizacion } as object },
        })
        const pdfContrato = await generarPdfContratoOps({
          contratoId: c.id,
          numero,
          sedeId: d.sedeId,
          usuarioId: usuario.id,
          datos: datosPdf,
        })
        documentoId = pdfContrato.documentoId
        // Autorización de tratamiento de datos (Ley 1581): la firma solo el contratista.
        await generarPdfAutorizacionDatos({
          contratoId: c.id,
          numero,
          sedeId: d.sedeId,
          usuarioId: usuario.id,
          datos: autorizacion,
        })
      } catch (e) {
        // El contrato queda creado aunque falle el PDF; se puede regenerar luego.
        console.error('No se pudo generar el PDF del contrato OPS:', e)
      }
    }

    // Avisar al contratista (si tiene usuario) que su contrato quedó pendiente de firma.
    if (documentoId && d.colaboradorId) {
      const uid = await usuarioDeColaborador(d.colaboradorId)
      if (uid) {
        await avisar(uid, {
          evento: 'contrato_pendiente_firma',
          titulo: `Firma tu contrato ${numero}`,
          mensaje: 'Contrato y autorización de datos listos en tu autoservicio.',
          enlace: '/autoservicio/contratos',
          llamadoAccion: 'Revisar y firmar el contrato',
        })
      }
    }

    await publicarVencimientoOps(c.id)
    // La ficha muestra su propio cargo: se alinea con el del contrato (ver alinearCargoFicha).
    if (c.colaboradorId) await alinearCargoFicha(c.colaboradorId, c.cargoId)
    revalidatePath('/contratos')
    revalidatePath(`/contratos/ops/${c.id}`)
    return { id: c.id, documentoId }
  },
)

/**
 * Sube un contrato OPS YA EXISTENTE (firmado en físico / hecho fuera del sistema).
 * Crea el registro con los datos estructurados, marca `origenPdf: SUBIDO` y adjunta el
 * PDF aportado como Documento. No genera plantilla ni exige firma digital.
 */
export const subirContratoOpsExistente = accion(
  { modulo: 'contratos', accion: 'CREAR', schema: subirContratoOpsSchema },
  async (d, usuario) => {
    // El PDF: por referencia al depósito temporal o, en pruebas, en base64.
    const pdf = await obtenerPdfAdjunto(d, usuario.id)

    const numero = v(d.numero) ?? (await siguienteNumeroOps())
    const c = await dbAuditado.contratoOps.create({
      data: {
        numero,
        colaboradorId: d.colaboradorId,
        objeto: d.objeto,
        valorTotal: d.valorTotal,
        valorMensual: d.valorMensual ?? null,
        supervisorId: v(d.supervisorId),
        sedeId: d.sedeId,
        fechaInicio: parseFechaISO(d.fechaInicio)!,
        fechaFin: parseFechaISO(d.fechaFin)!,
        rut: v(d.rut),
        estado: 'ACTIVO',
        origenPdf: 'SUBIDO',
      },
    })

    // Subir el PDF aportado y registrarlo como Documento del contrato.
    const sha256 = createHash('sha256').update(pdf).digest('hex')
    const archivo = await subirArchivo(`contratos/${c.id}`, `contrato-${numero}.pdf`, pdf, 'application/pdf')
    await dbAuditado.documento.create({
      data: {
        entidadTipo: 'ContratoOps',
        entidadId: c.id,
        nombre: `Contrato OPS ${numero}`,
        bucket: archivo.bucket,
        storagePath: archivo.storagePath,
        mimeType: 'application/pdf',
        tamanoBytes: archivo.tamanoBytes,
        sha256,
        nivelAcceso: 'GENERAL',
        sedeId: c.sedeId,
        subidoPorId: usuario.id,
      },
    })

    await guardarAutorizacionSubida({
      autorizacionBase64: d.autorizacionBase64, autorizacionRef: d.autorizacionRef,
      entidadTipo: 'ContratoOps', entidadId: c.id, numero, sedeId: c.sedeId, usuarioId: usuario.id,
    })
    await Promise.all([borrarPdfTemporal(d.pdfRef), borrarPdfTemporal(d.autorizacionRef)])

    await publicarVencimientoOps(c.id)
    // La ficha muestra su propio cargo: se alinea con el del contrato (ver alinearCargoFicha).
    if (c.colaboradorId) await alinearCargoFicha(c.colaboradorId, c.cargoId)
    revalidatePath('/contratos')
    revalidatePath(`/contratos/ops/${c.id}`)
    return { id: c.id }
  },
)

/** Trae los datos del contratista (colaborador) para prellenar el contrato. */
export const datosContratistaOps = accion(
  { modulo: 'contratos', accion: 'CREAR', schema: z.object({ colaboradorId: z.uuid() }) },
  async (d) => {
    const c = await prisma.colaborador.findUnique({
      where: { id: d.colaboradorId },
      include: { ciudadResidencia: true, cargo: true, sede: { include: { ciudad: true } } },
    })
    if (!c) throw new ErrorNegocio('Colaborador no encontrado.')
    return {
      nombre: `${c.nombres} ${c.apellidos}`.toUpperCase(),
      cc: `${c.tipoDocumento} ${c.numeroDocumento}`,
      ccLugar: c.lugarExpedicionDoc ?? '',
      direccion: c.direccion ?? '',
      email: c.emailPersonal ?? '',
      telefono: c.celular ?? '',
      genero: c.genero ?? '',
      cargoId: c.cargoId ?? '',
      cargoNombre: c.cargo?.nombre ?? '',
      ciudad: c.ciudadResidencia?.nombre ?? c.sede?.ciudad?.nombre ?? '',
      sedeId: c.sedeId ?? '',
    }
  },
)

/**
 * Genera (retroactivamente) la autorización de tratamiento de datos para un
 * contrato creado antes de que existiera este documento. Reconstruye los datos
 * desde la ficha del colaborador, guarda el PDF y actualiza el snapshot para
 * que la firma del contratista también la cubra. Si el contratista ya firmó,
 * la genera directamente firmada.
 */
export const generarAutorizacionDatos = accion(
  { modulo: 'contratos', accion: 'EDITAR', schema: z.object({ contratoId: z.uuid() }) },
  async (d, usuario) => {
    const c = await prisma.contratoOps.findUniqueOrThrow({
      where: { id: d.contratoId },
      include: { colaborador: { include: { ciudadResidencia: true, cargo: true } }, cargo: true, sede: { include: { ciudad: true } } },
    })
    // Congelar el contenido: un contrato ya firmado por ambas partes no se toca.
    if (c.estado === 'FIRMADO') {
      throw new ErrorNegocio('El contrato ya está firmado; su contenido no puede modificarse.')
    }
    const col = c.colaborador
    const snapshot = (c.contenidoPdf ?? {}) as Record<string, unknown>
    if (!col) throw new ErrorNegocio('Este contrato usa datos manuales; la autorización ya se generó con el contrato.')

    const autorizacion = await datosAutorizacionDeColaborador({
      colaboradorId: col.id,
      vinculo: 'OPS',
      numero: c.numero,
      contrato: {
        // La ciudad de la sede del CONTRATO, no la del colaborador, si él no tiene residencia.
        ciudad: col.ciudadResidencia?.nombre ?? c.sede.ciudad.nombre,
        fechaSuscripcion: c.creadoEn.toISOString().slice(0, 10),
        cargoObjeto: c.cargo?.nombre,
      },
    })

    await dbAuditado.contratoOps.update({
      where: { id: c.id },
      data: { contenidoPdf: { ...snapshot, autorizacion } as object },
    })

    // Si el contratista ya firmó el contrato, la autorización nace firmada.
    const firmaImg = c.firmaContratistaPath ? await leerFirmaComoDataUri(c.firmaContratistaPath) : null
    await generarPdfAutorizacionDatos({
      contratoId: c.id,
      numero: c.numero,
      sedeId: c.sedeId,
      usuarioId: usuario.id,
      datos: autorizacion,
      firmaImg,
      firmaFecha: c.firmaContratistaFecha ? fechaLarga(c.firmaContratistaFecha.toISOString().slice(0, 10)) : null,
      nombreDocumento: firmaImg ? `Autorización de datos ${c.numero} (firmada)` : undefined,
    })

    revalidatePath(`/contratos/ops/${c.id}`)
    revalidatePath('/autoservicio/contratos')
    return { ok: true }
  },
)

/**
 * Regenera los PDF (contrato + autorización) de un contrato desde su snapshot,
 * respetando las firmas ya existentes. Útil cuando la generación falló al crear
 * y el contrato quedó con snapshot pero sin documentos.
 */
export const regenerarDocumentosContrato = accion(
  { modulo: 'contratos', accion: 'EDITAR', schema: z.object({ contratoId: z.uuid() }) },
  async (d, usuario) => {
    const c = await prisma.contratoOps.findUniqueOrThrow({ where: { id: d.contratoId } })
    // Solo los contratos de plantilla se pueden regenerar: en uno subido el
    // snapshot no guarda el texto (el contrato ES el PDF aportado), así que esto
    // produciría un documento vacío y lo archivaría junto al bueno. La UI ya
    // esconde el botón, pero una Server Action es una entrada pública y el
    // resultado sería un contrato en blanco con nombre de contrato real.
    if (c.origenPdf !== 'GENERADO') {
      throw new ErrorNegocio(
        'Este contrato no se redactó desde una plantilla: su documento es el PDF que se subió, así que no hay nada que regenerar.',
      )
    }
    if (!c.contenidoPdf) throw new ErrorNegocio('El contrato no tiene datos para regenerar. Debe recrearse.')
    const snapshot = c.contenidoPdf as unknown as SnapshotContratoOps

    const [imgContratante, imgContratista] = await Promise.all([
      c.firmaContratantePath ? leerFirmaComoDataUri(c.firmaContratantePath) : Promise.resolve(null),
      c.firmaContratistaPath ? leerFirmaComoDataUri(c.firmaContratistaPath) : Promise.resolve(null),
    ])
    const firmado = !!(c.firmaContratistaPath && (c.firmaContratantePath || c.firmaContratanteEnPdf))

    await generarPdfContratoOps({
      contratoId: c.id, numero: c.numero, sedeId: c.sedeId, usuarioId: usuario.id,
      datos: snapshot,
      firmas: {
        contratanteImg: imgContratante, contratistaImg: imgContratista,
        contratanteFecha: c.firmaContratanteFecha ? fechaLarga(c.firmaContratanteFecha.toISOString().slice(0, 10)) : null,
        contratistaFecha: c.firmaContratistaFecha ? fechaLarga(c.firmaContratistaFecha.toISOString().slice(0, 10)) : null,
      },
      nombreDocumento: firmado ? `Contrato OPS ${c.numero} (firmado)` : undefined,
    })

    if (snapshot.autorizacion) {
      await generarPdfAutorizacionDatos({
        contratoId: c.id, numero: c.numero, sedeId: c.sedeId, usuarioId: usuario.id,
        datos: snapshot.autorizacion,
        firmaImg: imgContratista,
        firmaFecha: c.firmaContratistaFecha ? fechaLarga(c.firmaContratistaFecha.toISOString().slice(0, 10)) : null,
        nombreDocumento: imgContratista ? `Autorización de datos ${c.numero} (firmada)` : undefined,
      })
    }

    revalidatePath(`/contratos/ops/${c.id}`)
    revalidatePath('/autoservicio/contratos')
    return { ok: true, tieneAutorizacion: !!snapshot.autorizacion }
  },
)

// Las cuentas de cobro las radica el propio contratista desde su autoservicio
// (ver crearMiCuentaCobro). El administrador solo las revisa, verifica la seguridad
// social y las aprueba/rechaza/paga (registrarSoporteSs, cambiarEstadoCuenta).

/**
 * Aplica la firma del CONTRATANTE (representante legal) al contrato OPS, desde
 * la administración. La firma del contratista solo puede aplicarla él mismo
 * desde su autoservicio (`firmarMiContratoOps`), donde además queda firmada la
 * autorización de tratamiento de datos.
 */
export const firmarContratoOps = accion(
  { modulo: 'contratos', accion: 'EDITAR', schema: firmarContratoOpsSchema },
  async (d, usuario) => {
    if (d.rol !== 'CONTRATANTE') {
      throw new ErrorNegocio('La firma del contratista solo puede aplicarla él mismo desde su autoservicio.')
    }
    const { firmado } = await aplicarFirmaContratoOps({
      contratoId: d.contratoId,
      rol: d.rol,
      firmaDataUri: d.firmaDataUri,
      usuarioId: usuario.id,
    })
    revalidatePath(`/contratos/ops/${d.contratoId}`)
    revalidatePath('/autoservicio/contratos')
    return { ok: true, firmado }
  },
)

// ── Entregables OPS ──
// El supervisor registra los entregables pactados y marca su cumplimiento;
// son el soporte del pago (informe de supervisión).

export const agregarEntregableOps = accion(
  { modulo: 'contratos', accion: 'EDITAR', schema: entregableOpsSchema },
  async (d) => {
    await prisma.contratoOps.findUniqueOrThrow({ where: { id: d.contratoOpsId }, select: { id: true } })
    await dbAuditado.entregableOps.create({
      data: {
        contratoOpsId: d.contratoOpsId,
        descripcion: d.descripcion,
        fechaEntrega: d.fechaEntrega ? parseFechaISO(d.fechaEntrega) : null,
      },
    })
    revalidatePath(`/contratos/ops/${d.contratoOpsId}`)
    return { ok: true }
  },
)

export const editarEntregableOps = accion(
  {
    modulo: 'contratos',
    accion: 'EDITAR',
    schema: z.object({
      id: z.uuid(),
      descripcion: z.string().trim().min(3, 'Describe el entregable').max(500),
      fechaEntrega: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
    }),
  },
  async (d) => {
    const e = await dbAuditado.entregableOps.update({
      where: { id: d.id },
      data: {
        descripcion: d.descripcion,
        fechaEntrega: d.fechaEntrega ? parseFechaISO(d.fechaEntrega) : null,
      },
    })
    revalidatePath(`/contratos/ops/${e.contratoOpsId}`)
    return { ok: true }
  },
)

export const marcarEntregableOps = accion(
  { modulo: 'contratos', accion: 'EDITAR', schema: z.object({ id: z.uuid(), cumplido: z.boolean() }) },
  async (d) => {
    const e = await dbAuditado.entregableOps.update({ where: { id: d.id }, data: { cumplido: d.cumplido } })
    revalidatePath(`/contratos/ops/${e.contratoOpsId}`)
    return { ok: true }
  },
)

export const eliminarEntregableOps = accion(
  { modulo: 'contratos', accion: 'EDITAR', schema: z.object({ id: z.uuid() }) },
  async (d) => {
    const e = await prisma.entregableOps.findUniqueOrThrow({ where: { id: d.id } })
    if (e.cumplido) throw new ErrorNegocio('Un entregable marcado como cumplido no se puede eliminar; desmárcalo primero.')
    await dbAuditado.entregableOps.delete({ where: { id: d.id } })
    revalidatePath(`/contratos/ops/${e.contratoOpsId}`)
    return { ok: true }
  },
)

/**
 * La EMPRESA radica una cuenta de cobro a nombre de un colaborador/contratista
 * (contraparte de `crearMiCuentaCobro` del autoservicio): útil cuando el
 * contratista no maneja la app o la administración liquida el cobro del mes.
 * Si tiene contrato OPS vigente se vincula (exige verificación de seguridad
 * social antes de aprobar/pagar, igual que las radicadas por él).
 */
export const crearCuentaCobroEmpresa = accion(
  {
    modulo: 'contratos',
    accion: 'CREAR',
    schema: z.object({
      colaboradorId: z.uuid(),
      periodo: z.string().regex(/^\d{4}-\d{2}$/, 'Periodo inválido (AAAA-MM)'),
      valor: z.coerce.number().min(1),
      concepto: z.string().trim().max(200).optional(),
      plantillaId: z.union([z.uuid(), z.literal('')]).optional(),
    }),
  },
  async (d, usuario) => {
    const contrato = await prisma.contratoOps.findFirst({
      where: { colaboradorId: d.colaboradorId, estado: { in: ['ACTIVO', 'FIRMADO'] } },
      orderBy: { fechaInicio: 'desc' },
    })
    const dup = await prisma.cuentaCobroOps.findFirst({ where: { colaboradorId: d.colaboradorId, periodo: d.periodo } })
    if (dup) throw new ErrorNegocio(`Ya existe una cuenta de cobro de ese colaborador para el periodo ${d.periodo} (${dup.numero}).`)

    const total = await prisma.cuentaCobroOps.count({ where: { colaboradorId: d.colaboradorId } })
    const cuenta = await dbAuditado.cuentaCobroOps.create({
      data: {
        colaboradorId: d.colaboradorId, contratoOpsId: contrato?.id ?? null,
        numero: `CC-${total + 1}`, periodo: d.periodo, concepto: d.concepto || null,
        valor: d.valor, fechaRadicacion: hoyBogota(), estado: 'RADICADA', creadaPorContratista: false,
      },
    })
    await generarPdfCuentaCobro(cuenta.id, d.plantillaId || null, usuario.id, null)

    // El titular debe enterarse: revisa el documento y, si es OPS, adjunta su planilla PILA.
    const usuarioColab = await usuarioDeColaborador(d.colaboradorId)
    if (usuarioColab) {
      await avisar(usuarioColab, {
        titulo: `Cuenta de cobro ${cuenta.numero} radicada a tu nombre`,
        mensaje: `Periodo ${d.periodo}${d.concepto ? ` · ${d.concepto}` : ''}${contrato ? ' · Adjunta tu planilla PILA para que se apruebe.' : ''}`,
        enlace: '/autoservicio/cuentas-cobro', llamadoAccion: 'Ver mi cuenta de cobro', evento: 'cuenta_cobro_radicada',
      })
    }
    revalidatePath('/contratos/cuentas-cobro')
    if (contrato) revalidatePath(`/contratos/ops/${contrato.id}`)
    return { id: cuenta.id, numero: cuenta.numero, vinculadaOps: !!contrato }
  },
)

export const registrarSoporteSs = accion(
  { modulo: 'contratos', accion: 'EDITAR', schema: soporteSsSchema },
  async (d, usuario) => {
    const cuenta = await prisma.cuentaCobroOps.findUniqueOrThrow({
      where: { id: d.cuentaCobroId },
      include: { contratoOps: true },
    })
    // Validación IBC ≥ 40% del valor mensualizado (Ley 1955 art. 244), tolerancia 1%
    const base = Number(cuenta.contratoOps?.valorMensual ?? cuenta.valor)
    if (d.ibcDeclarado != null && base > 0) {
      const minimo = base * 0.4 * 0.99
      if (d.estadoVerificacion === 'VALIDA' && d.ibcDeclarado < minimo) {
        throw new ErrorNegocio('El IBC declarado es menor al 40% del valor mensualizado. No puede marcarse como válido.')
      }
    }
    await dbAuditado.soporteSsOps.upsert({
      where: { cuentaCobroId: d.cuentaCobroId },
      create: {
        cuentaCobroId: d.cuentaCobroId,
        operador: v(d.operador),
        periodoCotizado: d.periodoCotizado,
        ibcDeclarado: d.ibcDeclarado ?? null,
        estadoVerificacion: d.estadoVerificacion,
        verificadoPorId: usuario.id,
        verificadoEn: new Date(),
        observaciones: v(d.observaciones),
      },
      update: {
        operador: v(d.operador),
        periodoCotizado: d.periodoCotizado,
        ibcDeclarado: d.ibcDeclarado ?? null,
        estadoVerificacion: d.estadoVerificacion,
        verificadoPorId: usuario.id,
        verificadoEn: new Date(),
        observaciones: v(d.observaciones),
      },
    })
    // Si el soporte es válido y la cuenta estaba bloqueada, pasarla a EN_VERIFICACION
    if (d.estadoVerificacion === 'VALIDA' && cuenta.estado === 'BLOQUEADA_SS') {
      await prisma.cuentaCobroOps.update({ where: { id: cuenta.id }, data: { estado: 'EN_VERIFICACION_SS' } })
    }
    // Soporte inválido: avisar al contratista qué debe corregir para poder cobrar.
    if (d.estadoVerificacion === 'INVALIDA') {
      const duenoId = cuenta.colaboradorId ?? cuenta.contratoOps?.colaboradorId
      const usuarioDueno = duenoId ? await usuarioDeColaborador(duenoId) : null
      if (usuarioDueno) {
        await avisar(usuarioDueno, {
          evento: 'soporte_ss_invalido',
          titulo: 'Tu planilla PILA no fue aceptada',
          mensaje: `Cuenta ${cuenta.numero}${d.observaciones ? ` · ${d.observaciones}` : ''} · Sube la corregida para seguir con el pago.`,
          enlace: '/autoservicio/cuentas-cobro',
          llamadoAccion: 'Corregir el soporte',
        })
      }
    }
    revalidatePath('/contratos/ops')
    return { ok: true }
  },
)

export const cambiarEstadoCuenta = accion(
  {
    modulo: 'contratos',
    accion: 'APROBAR',
    schema: z.object({
      id: z.uuid(),
      estado: z.enum(['EN_VERIFICACION_SS', 'BLOQUEADA_SS', 'APROBADA', 'PAGADA', 'RECHAZADA']),
      fechaPago: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal('')),
    }),
  },
  async (d) => {
    const cuenta = await prisma.cuentaCobroOps.findUniqueOrThrow({
      where: { id: d.id },
      include: { soporteSs: true },
    })
    // Regla legal SOLO para contratistas OPS (independientes): no se aprueba/paga sin
    // soporte de SS válido. Las cuentas de empleados no OPS (comisiones/saldos) no la requieren.
    if (cuenta.contratoOpsId && (d.estado === 'APROBADA' || d.estado === 'PAGADA') && cuenta.soporteSs?.estadoVerificacion !== 'VALIDA') {
      throw new ErrorNegocio('No se puede aprobar ni pagar sin el soporte de seguridad social verificado como válido.')
    }
    await dbAuditado.cuentaCobroOps.update({
      where: { id: d.id },
      data: {
        estado: d.estado,
        fechaPago: d.estado === 'PAGADA' && d.fechaPago ? parseFechaISO(d.fechaPago) : cuenta.fechaPago,
      },
    })

    // Avisar al dueño de la cuenta en los cambios que le exigen actuar o le confirman el pago.
    const MENSAJES: Record<string, { titulo: string; mensaje: string } | undefined> = {
      BLOQUEADA_SS: { titulo: `Tu cuenta ${cuenta.numero} quedó bloqueada`, mensaje: 'Seguridad social sin verificar · Sube la planilla corregida.' },
      APROBADA: { titulo: `Tu cuenta ${cuenta.numero} fue aprobada`, mensaje: 'En trámite de pago.' },
      PAGADA: { titulo: `Tu cuenta ${cuenta.numero} fue pagada`, mensaje: d.fechaPago ? `Pago del ${fechaBreve(d.fechaPago)}.` : '' },
      RECHAZADA: { titulo: `Tu cuenta ${cuenta.numero} fue rechazada`, mensaje: 'Consulta el detalle con la administración.' },
    }
    const aviso = MENSAJES[d.estado]
    if (aviso) {
      const cuentaCompleta = await prisma.cuentaCobroOps.findUnique({ where: { id: d.id }, select: { colaboradorId: true, contratoOps: { select: { colaboradorId: true } } } })
      const duenoId = cuentaCompleta?.colaboradorId ?? cuentaCompleta?.contratoOps?.colaboradorId
      const usuarioDueno = duenoId ? await usuarioDeColaborador(duenoId) : null
      if (usuarioDueno) {
        await avisar(usuarioDueno, { ...aviso, enlace: '/autoservicio/cuentas-cobro', llamadoAccion: 'Ver mis cuentas de cobro', evento: 'cuenta_cobro_estado' })
      }
    }

    revalidatePath('/contratos/ops')
    revalidatePath('/contratos/cuentas-cobro')
    return { ok: true }
  },
)

/**
 * Sube el PDF de un contrato OPS que se firmará DENTRO de la app.
 *
 * Es el punto medio entre los dos caminos que ya existían: como el alta normal,
 * el contrato entra al flujo de firma y el contratista lo firma desde su
 * autoservicio; como la carga de un contrato existente, el documento lo aporta
 * quien lo crea en vez de armarlo la plantilla. Sirve cuando el contrato se
 * redactó por fuera y forzar la plantilla saldría peor.
 *
 * Diferencia clave con `subirContratoOpsExistente`: aquel da por firmado el
 * documento (venía firmado en físico) y por eso omite la firma digital.
 */
export const subirContratoOpsParaFirma = accion(
  { modulo: 'contratos', accion: 'CREAR', schema: subirContratoOpsParaFirmaSchema },
  async (d, usuario) => {
    const pdf = await obtenerPdfAdjunto(d, usuario.id)

    // Sin usuario de acceso el contratista no puede entrar a firmar: se avisa al
    // crear, no cuando alguien se pregunte por qué nunca llegó la firma.
    const uid = await usuarioDeColaborador(d.colaboradorId)
    if (!uid) {
      throw new ErrorNegocio(
        'El contratista no tiene usuario de acceso, así que no podría firmar desde el autoservicio. Créale el acceso antes de subir el contrato.',
      )
    }
    // O se indica dónde firma el contratante, o se declara que ya firmó en el PDF.
    const contratanteFirmoEnPdf = d.contratanteFirmoEnPdf === true
    if (!contratanteFirmoEnPdf && !d.posicionContratante) {
      throw new ErrorNegocio('Indica dónde firma el contratante dentro del PDF, o marca que ya viene firmado por él.')
    }

    const numero = v(d.numero) ?? (await siguienteNumeroOps())
    const c = await dbAuditado.contratoOps.create({
      data: {
        numero,
        colaboradorId: d.colaboradorId,
        objeto: await objetoDerivado(d),
        valorTotal: d.valorTotal,
        valorMensual: d.valorMensual ?? null,
        supervisorId: v(d.supervisorId),
        cargoId: v(d.cargoId),
        sedeId: d.sedeId,
        fechaInicio: parseFechaISO(d.fechaInicio)!,
        fechaFin: parseFechaISO(d.fechaFin)!,
        rut: v(d.rut),
        estado: 'ACTIVO',
        origenPdf: 'SUBIDO_PARA_FIRMA',
        firmaContratanteEnPdf: contratanteFirmoEnPdf,
      },
    })

    if (d.entregables && d.entregables.length > 0) {
      await dbAuditado.entregableOps.createMany({
        data: d.entregables.map((e) => ({
          contratoOpsId: c.id,
          descripcion: e.descripcion,
          fechaEntrega: e.fechaEntrega ? parseFechaISO(e.fechaEntrega) : null,
        })),
      })
    }

    // El PDF aportado se guarda tal cual: es la base sobre la que se estamparán
    // las firmas y la referencia para comparar contra el documento firmado.
    const sha256 = createHash('sha256').update(pdf).digest('hex')
    const archivo = await subirArchivo(`contratos-ops/${c.id}`, `contrato-${numero}.pdf`, pdf, 'application/pdf')
    const documentoOriginal = await dbAuditado.documento.create({
      data: {
        entidadTipo: 'ContratoOps',
        entidadId: c.id,
        nombre: `Contrato OPS ${numero}`,
        bucket: archivo.bucket,
        storagePath: archivo.storagePath,
        mimeType: 'application/pdf',
        tamanoBytes: archivo.tamanoBytes,
        sha256,
        nivelAcceso: 'GENERAL',
        sedeId: d.sedeId,
        subidoPorId: usuario.id,
      },
    })

    await dbAuditado.contratoOps.update({
      where: { id: c.id },
      data: {
        posicionFirmas: {
          contratista: d.posicionContratista,
          // Sin posición del contratante cuando ya firmó en el PDF: no se le estampa nada.
          contratante: contratanteFirmoEnPdf ? null : d.posicionContratante ?? null,
          documentoOriginalId: documentoOriginal.id,
        } as object,
      },
    })

    // La autorización de datos (Ley 1581) no depende del PDF subido: la sigue
    // armando la app desde su plantilla y la firma solo el contratista. Se
    // omite si ya se recogió aparte.
    if (d.generarAutorizacion !== false) {
      try {
        // El titular sale de su ficha: este alta no pide sus datos (el contrato ya
        // viene redactado) y una autorización sin nombre ni cédula no autoriza nada.
        const autorizacion = await datosAutorizacionDeColaborador({
          colaboradorId: d.colaboradorId,
          vinculo: 'OPS',
          numero,
          contrato: { ciudad: d.ciudad, fechaSuscripcion: d.fechaSuscripcion, cargoObjeto: d.cargoObjeto },
          contratista: {
            nombre: d.contratistaNombre, cc: d.contratistaCc, ccLugar: d.contratistaCcLugar,
            direccion: d.contratistaDireccion, email: d.contratistaEmail, telefono: d.contratistaTelefono,
            genero: d.contratistaGenero,
          },
        })
        // Se guarda en el snapshot para poder regenerarla firmada cuando el
        // contratista firme; el contrato en sí no va aquí: ese es el PDF subido.
        await dbAuditado.contratoOps.update({ where: { id: c.id }, data: { contenidoPdf: { autorizacion } as object } })
        await generarPdfAutorizacionDatos({
          contratoId: c.id, numero, sedeId: d.sedeId, usuarioId: usuario.id, datos: autorizacion,
        })
      } catch (e) {
        // El contrato queda subido aunque falle la autorización; se regenera aparte.
        console.error('No se pudo generar la autorización de datos del contrato OPS subido:', e)
      }
    }

    await avisar(uid, {
      evento: 'contrato_pendiente_firma',
      titulo: `Firma tu contrato ${numero}`,
      mensaje: 'Está listo en tu autoservicio.',
      enlace: '/autoservicio/contratos',
      llamadoAccion: 'Revisar y firmar el contrato',
    }).catch(() => {})

    await publicarVencimientoOps(c.id)
    // La ficha muestra su propio cargo: se alinea con el del contrato (ver alinearCargoFicha).
    if (c.colaboradorId) await alinearCargoFicha(c.colaboradorId, c.cargoId)
    revalidatePath('/contratos')
    revalidatePath(`/contratos/ops/${c.id}`)
    await borrarPdfTemporal(d.pdfRef)
    return { id: c.id, documentoId: documentoOriginal.id }
  },
)

/**
 * El nombre no distingue de forma fiable al contrato de su autorización de
 * datos: los contratos subidos antes de que se nombraran de forma descriptiva
 * conservan el nombre del archivo original. Se descarta lo que claramente ES la
 * autorización y se toma el resto.
 */
const esAutorizacion = (nombre: string) =>
  nombre.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes('autoriz')

/** El PDF del contrato en sí (no la autorización) entre los documentos del contrato. */
async function documentoDelContratoOps(contratoId: string) {
  const docs = await prisma.documento.findMany({
    where: { entidadTipo: 'ContratoOps', entidadId: contratoId },
    orderBy: { creadoEn: 'asc' },
    select: { id: true, nombre: true, storagePath: true },
  })
  const doc = docs.find((d) => !esAutorizacion(d.nombre)) ?? docs[0]
  if (!doc) throw new ErrorNegocio('El contrato no tiene un PDF adjunto sobre el cual firmar.')
  return doc
}

/**
 * Carga lo necesario para colocar las firmas sobre un contrato ya subido: el PDF
 * guardado y la posición que propone la app.
 *
 * No cambia nada; es el paso previo a `habilitarFirmaContratoOps`, igual que
 * `analizarPdfContratoOps` lo es al alta. La diferencia es de dónde sale el PDF:
 * allá lo acaba de elegir el navegador, aquí ya está en el almacenamiento.
 */
export const prepararFirmaContratoOps = accion(
  { modulo: 'contratos', accion: 'EDITAR', schema: z.object({ contratoId: z.uuid() }) },
  async (d) => {
    const c = await prisma.contratoOps.findUniqueOrThrow({
      where: { id: d.contratoId },
      select: { id: true, origenPdf: true },
    })
    if (c.origenPdf !== 'SUBIDO') {
      throw new ErrorNegocio('Este contrato ya está en el flujo de firma de la app.')
    }
    const doc = await documentoDelContratoOps(c.id)
    const pdf = await leerArchivo(doc.storagePath)
    const [posiciones, paginas] = await Promise.all([ubicarFirmasEnPdf(pdf), contarPaginas(pdf)])
    return {
      nombre: doc.nombre,
      paginas,
      pdfBase64: `data:application/pdf;base64,${pdf.toString('base64')}`,
      ...posiciones,
    }
  },
)

/**
 * Abre la corrección de la posición de las firmas de un contrato OPS subido:
 * devuelve el PDF ORIGINAL (sin estampar), las posiciones vigentes y la imagen
 * de cada firma ya dibujada, para que quien corrige vea el trazo real donde va a
 * quedar. No guarda nada. Espejo de `prepararCorreccionFirmaLaboral`.
 */
export const prepararCorreccionFirmaOps = accion(
  { modulo: 'contratos', accion: 'EDITAR', schema: z.object({ contratoId: z.uuid() }) },
  async (d) => {
    const c = await prisma.contratoOps.findUniqueOrThrow({
      where: { id: d.contratoId },
      select: { origenPdf: true, posicionFirmas: true, firmaContratistaPath: true, firmaContratantePath: true, firmaContratanteEnPdf: true },
    })
    if (c.origenPdf !== 'SUBIDO_PARA_FIRMA') {
      throw new ErrorNegocio('Solo se corrige la posición en contratos cuyo PDF se subió para firmarse en la app.')
    }
    const datos = leerDatosFirmaSubido(c.posicionFirmas)
    const original = await prisma.documento.findUnique({ where: { id: datos.documentoOriginalId }, select: { nombre: true, storagePath: true } })
    if (!original) throw new ErrorNegocio('No se encontró el PDF original del contrato.')
    const [pdf, firmaContratista, firmaContratante] = await Promise.all([
      leerArchivo(original.storagePath),
      c.firmaContratistaPath ? leerFirmaComoDataUri(c.firmaContratistaPath) : Promise.resolve(null),
      c.firmaContratantePath ? leerFirmaComoDataUri(c.firmaContratantePath) : Promise.resolve(null),
    ])
    const paginas = await contarPaginas(pdf)
    return {
      nombre: original.nombre,
      paginas,
      pdfBase64: `data:application/pdf;base64,${pdf.toString('base64')}`,
      contratista: datos.contratista,
      contratante: datos.contratante,
      contratanteEnPdf: c.firmaContratanteEnPdf,
      firmaContratista,
      firmaContratante,
    }
  },
)

/**
 * Guarda la posición corregida y, si el contrato ya estaba firmado, vuelve a
 * estampar las firmas sobre el original y reemplaza el PDF "(firmado)". Nadie
 * vuelve a firmar: solo cambia dónde se dibuja el trazo.
 */
export const corregirPosicionFirmaOps = accion(
  { modulo: 'contratos', accion: 'EDITAR', schema: corregirPosicionFirmaOpsSchema },
  async (d, usuario) => {
    const r = await corregirPosicionFirmaOpsServidor({
      contratoId: d.contratoId,
      posicionContratista: d.posicionContratista,
      posicionContratante: d.posicionContratante ?? null,
      usuarioId: usuario.id,
    })
    revalidatePath(`/contratos/ops/${d.contratoId}`)
    revalidatePath('/autoservicio/contratos')
    return r
  },
)

/**
 * Pasa al flujo de firma un contrato OPS que se cargó como «ya firmado en físico».
 *
 * Repara el error más fácil de cometer: subir el contrato por «Subir contrato
 * existente» de la ficha del colaborador —pensada para papeles ya firmados— en
 * vez de «Subir el PDF» del contrato nuevo. Quedaba sin salida, porque el
 * autoservicio mira `origenPdf` para ofrecer la firma: el contratista veía el
 * PDF pero sin botón, y no había forma de corregirlo ni de borrar el contrato
 * para rehacerlo.
 *
 * No toca el documento: solo registra dónde firma cada parte y cambia el origen.
 */
export const habilitarFirmaContratoOps = accion(
  { modulo: 'contratos', accion: 'EDITAR', schema: habilitarFirmaOpsSchema },
  async (d) => {
    const c = await prisma.contratoOps.findUniqueOrThrow({
      where: { id: d.contratoId },
      select: {
        id: true, numero: true, colaboradorId: true, origenPdf: true,
        firmaContratistaPath: true, firmaContratantePath: true,
      },
    })
    if (c.origenPdf !== 'SUBIDO') {
      throw new ErrorNegocio('Este contrato ya está en el flujo de firma de la app.')
    }
    // Un contrato con firmas ya recogidas no se reabre: cambiar el origen haría
    // que se le estampen encima sobre un PDF que ya circuló.
    if (c.firmaContratistaPath || c.firmaContratantePath) {
      throw new ErrorNegocio('El contrato ya tiene firmas registradas.')
    }
    if (!c.colaboradorId) {
      throw new ErrorNegocio('El contrato no tiene contratista asignado, así que nadie podría firmarlo.')
    }
    // Sin usuario de acceso no hay autoservicio donde firmar: se avisa ahora, no
    // cuando alguien se pregunte por qué la firma nunca llegó.
    const uid = await usuarioDeColaborador(c.colaboradorId)
    if (!uid) {
      throw new ErrorNegocio(
        'El contratista no tiene usuario de acceso, así que no podría firmar desde el autoservicio. Créale el acceso primero.',
      )
    }
    const doc = await documentoDelContratoOps(c.id)
    // O se indica dónde firma el contratante, o se declara que ya firmó en el PDF.
    const contratanteFirmoEnPdf = d.contratanteFirmoEnPdf === true
    if (!contratanteFirmoEnPdf && !d.posicionContratante) {
      throw new ErrorNegocio('Indica dónde firma el contratante dentro del PDF, o marca que ya viene firmado por él.')
    }

    await dbAuditado.contratoOps.update({
      where: { id: c.id },
      data: {
        origenPdf: 'SUBIDO_PARA_FIRMA',
        firmaContratanteEnPdf: contratanteFirmoEnPdf,
        posicionFirmas: {
          contratista: d.posicionContratista,
          contratante: contratanteFirmoEnPdf ? null : d.posicionContratante ?? null,
          documentoOriginalId: doc.id,
        } as object,
      },
    })
    await auditar('EDITAR', 'ContratoOps', {
      registroId: c.id,
      descripcion: `Contrato ${c.numero}: habilitada la firma en la app sobre el PDF ya subido`,
    })

    await avisar(uid, {
      evento: 'contrato_pendiente_firma',
      titulo: `Firma tu contrato ${c.numero}`,
      mensaje: 'Está listo en tu autoservicio.',
      enlace: '/autoservicio/contratos',
      llamadoAccion: 'Revisar y firmar el contrato',
    }).catch(() => {})

    revalidatePath('/contratos')
    revalidatePath(`/contratos/ops/${c.id}`)
    revalidatePath('/autoservicio/contratos')
    return { ok: true }
  },
)

/**
 * Lee un PDF recién elegido en el formulario y propone dónde firma cada parte.
 *
 * No guarda nada: es el paso previo a subir el contrato, para que la app
 * proponga la posición y una persona la confirme. Un PDF escaneado (sin capa de
 * texto) devuelve las posiciones en null y la posición se marca a mano.
 */
export const analizarPdfContratoOps = accion(
  { modulo: 'contratos', accion: 'CREAR', schema: z.object(pdfAdjuntoCampos) },
  async (d, usuario) => {
    const pdf = await obtenerPdfAdjunto(d, usuario.id)
    const [posiciones, paginas] = await Promise.all([ubicarFirmasEnPdf(pdf), contarPaginas(pdf)])
    return { paginas, ...posiciones }
  },
)

/**
 * Cierra un contrato OPS: pasa a TERMINADO con fecha, motivo y quién lo cerró.
 *
 * Un OPS termina cuando vence el plazo o, antes, de mutuo acuerdo o de forma
 * anticipada. Cerrarlo NO retira a la persona —lo normal es que siga con un
 * contrato nuevo—; eso es cosa de Terminaciones. Lo que sí hace: apaga su
 * alerta de vencimiento, deja de ser el contrato al que se ligan las cuentas de
 * cobro nuevas (las ya radicadas siguen su curso), y si a la persona no le
 * queda ningún vínculo vigente le baja el acceso a solo consulta.
 *
 * Es un hecho con fecha y queda en auditoría: no se reabre. Si la relación
 * continúa, el camino es el contrato nuevo.
 */
export const cerrarContratoOps = accion(
  { modulo: 'contratos', accion: 'EDITAR', schema: cerrarContratoOpsSchema },
  async (d, usuario) => {
    const c = await prisma.contratoOps.findUniqueOrThrow({ where: { id: d.contratoId } })
    if (c.estado === 'TERMINADO') throw new ErrorNegocio('Este contrato ya está cerrado.')
    if (c.estado === 'BORRADOR') throw new ErrorNegocio('Un borrador no se cierra: elimínalo o actívalo.')

    const hoy = hoyBogota()
    let cerradoEn: Date
    if (d.motivo === 'VENCIMIENTO_PLAZO') {
      // La fecha es la pactada; si todavía no llega, no venció: es un cierre anticipado.
      if (c.fechaFin > hoy) {
        throw new ErrorNegocio(`El plazo vence el ${formatFechaISO(c.fechaFin)}, todavía no ha vencido. Si se cierra antes, registra una terminación anticipada o de mutuo acuerdo.`)
      }
      cerradoEn = c.fechaFin
    } else {
      cerradoEn = parseFechaISO(d.fechaCierre || null) ?? hoy
      if (cerradoEn > hoy) throw new ErrorNegocio('La fecha de cierre no puede ser futura: se cierra cuando ya ocurrió.')
      if (cerradoEn < c.fechaInicio) throw new ErrorNegocio('La fecha de cierre no puede ser anterior al inicio del contrato.')
    }

    await dbAuditado.contratoOps.update({
      where: { id: c.id },
      data: {
        estado: 'TERMINADO',
        cerradoEn,
        motivoCierre: d.motivo,
        cerradoPorId: usuario.id,
        observacionCierre: v(d.observacion),
      },
    })
    // Un contrato cerrado ya no vence: se apaga su alerta.
    await publicarVencimientoOps(c.id)

    let accesoRestringido = false
    if (c.colaboradorId) {
      accesoRestringido = await restringirAccesoSiSinVinculo(c.colaboradorId)
      const uid = await usuarioDeColaborador(c.colaboradorId)
      if (uid) {
        await avisar(uid, {
          evento: 'contrato_cerrado',
          titulo: `Tu contrato ${c.numero} se cerró`,
          mensaje: `Contrato ${c.numero} · ${fechaBreve(cerradoEn)} · ${MOTIVO_CIERRE_TEXTO[d.motivo]}${accesoRestringido ? ' · Tu acceso queda en solo consulta.' : ''}`,
          enlace: '/autoservicio/contratos',
          llamadoAccion: 'Ver mis contratos',
        }).catch(() => {})
      }
    }

    revalidatePath('/contratos')
    revalidatePath(`/contratos/ops/${c.id}`)
    revalidatePath('/autoservicio/contratos')
    return { ok: true, accesoRestringido }
  },
)

/**
 * Borra un contrato OPS que se registró por error (el PDF a la persona
 * equivocada, un duplicado, datos mal puestos antes de mandarlo a firmar).
 * Solo para eso: un contrato con historia —firmado por el contratista en la
 * app, o con cuentas de cobro— no se borra; se cierra desde el propio contrato
 * o se registra el retiro en Terminaciones.
 *
 * Se lleva su PDF y su autorización de datos, su alerta de vencimiento, sus
 * entregables y sus evidencias de firma. Deja la ficha con el vínculo que le
 * corresponda por los contratos que le queden. Queda en la auditoría quién lo
 * borró.
 */
export const eliminarContratoOps = accion(
  { modulo: 'contratos', accion: 'ELIMINAR', schema: z.object({ id: z.uuid() }) },
  async ({ id }) => {
    const c = await prisma.contratoOps.findUniqueOrThrow({
      where: { id },
      include: { _count: { select: { cuentasCobro: true } } },
    })
    if (c.firmaContratistaPath) {
      throw new ErrorNegocio('Este contrato ya lo firmó el contratista en la app: no se borra, se cierra desde el propio contrato.')
    }
    if (c._count.cuentasCobro > 0) {
      throw new ErrorNegocio('Este contrato tiene cuentas de cobro radicadas: no se borra, se cierra desde el propio contrato.')
    }

    // Sus documentos (contrato, autorización de datos) y su alerta de vencimiento.
    const docs = await prisma.documento.findMany({ where: { entidadTipo: 'ContratoOps', entidadId: id }, select: { id: true } })
    for (const d of docs) await eliminarDocumento(d.id)
    await cancelarVencimiento('ContratoOps', id, 'CONTRATO_OPS')
    // Entregables y evidencias de firma caen en cascada con el contrato.
    await dbAuditado.contratoOps.delete({ where: { id } })

    // La ficha vuelve al vínculo de lo que le queda: un laboral activo, u otro OPS.
    if (c.colaboradorId) {
      const [laboral, otroOps] = await Promise.all([
        prisma.contrato.findFirst({ where: { colaboradorId: c.colaboradorId, estado: 'ACTIVO' }, orderBy: { fechaInicio: 'desc' }, select: { tipo: true } }),
        prisma.contratoOps.findFirst({ where: { colaboradorId: c.colaboradorId, estado: 'ACTIVO' }, select: { id: true } }),
      ])
      const vinculo: TipoVinculo | null = laboral ? vinculoDeContrato(laboral.tipo as TipoContratoLaboral) : otroOps ? 'OPS' : null
      if (vinculo) await dbAuditado.colaborador.update({ where: { id: c.colaboradorId }, data: { tipoVinculo: vinculo } })
    }

    revalidatePath('/contratos')
    if (c.colaboradorId) revalidatePath(`/colaboradores/${c.colaboradorId}`)
    revalidatePath('/autoservicio/contratos')
    return { colaboradorId: c.colaboradorId, numero: c.numero }
  },
)
