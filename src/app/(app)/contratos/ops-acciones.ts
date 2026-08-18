'use server'

import { createHash } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dbAuditado } from '@/lib/auditoria'
import { subirArchivo } from '@/server/storage'
import { guardarAutorizacionSubida } from '@/server/contratos-autorizacion-subida'
import { accion, ErrorNegocio } from '@/server/accion'
import { contratoOpsSchema, subirContratoOpsSchema, soporteSsSchema, firmarContratoOpsSchema, entregableOpsSchema } from '@/lib/validaciones/contrato'
import { parseFechaISO, hoyBogota } from '@/lib/fechas'
import { construirDatosPdfContratoOps, construirDatosAutorizacion, generarPdfContratoOps, generarPdfAutorizacionDatos, leerFirmaComoDataUri, type SnapshotContratoOps } from '@/server/contratos-ops-pdf'
import { fechaLarga } from '@/lib/numero-letras'
import { aplicarFirmaContratoOps } from '@/server/contratos-ops-firma'
import { avisar, usuarioDeColaborador } from '@/server/notificaciones/avisar'
import { generarPdfCuentaCobro } from '@/server/cuentas-cobro'
import { parseFuncionesTexto, type FuncionesCargo, type ClausulaPlantilla } from '@/lib/contrato-variables'

const v = (s: string | undefined | null) => (s && s !== '' ? s : null)

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

export const crearContratoOps = accion(
  { modulo: 'contratos', accion: 'CREAR', schema: contratoOpsSchema },
  async (d, usuario) => {
    const numero = v(d.numero) ?? (await siguienteNumeroOps())
    const c = await dbAuditado.contratoOps.create({
      data: {
        numero,
        colaboradorId: d.colaboradorId,
        objeto: d.objeto,
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
    if (documentoId) {
      const uid = await usuarioDeColaborador(d.colaboradorId)
      if (uid) {
        await avisar(uid, {
          evento: 'contrato_pendiente_firma',
          titulo: 'Contrato pendiente de tu firma',
          mensaje: `Tu contrato de prestación de servicios ${numero} y la autorización de tratamiento de datos fueron generados. Revísalos y fírmalos desde tu autoservicio.`,
          enlace: '/autoservicio/contratos',
          llamadoAccion: 'Revisar y firmar el contrato',
        })
      }
    }

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
    // Decodificar el PDF (data URI base64) a Buffer.
    const base64 = d.pdfBase64.split(',')[1] ?? ''
    const pdf = Buffer.from(base64, 'base64')
    if (pdf.byteLength === 0) throw new ErrorNegocio('El PDF adjunto está vacío.')

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
        nombre: (d.pdfNombre && d.pdfNombre.trim()) || `Contrato OPS ${numero} (subido)`,
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
      autorizacionBase64: d.autorizacionBase64, autorizacionNombre: d.autorizacionNombre,
      entidadTipo: 'ContratoOps', entidadId: c.id, numero, sedeId: c.sedeId, usuarioId: usuario.id,
    })

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

    const autorizacion = await construirDatosAutorizacion({
      datos: {
        empresa: { razonSocial: '' }, // se completa con la configuración de la empresa
        contratista: {
          nombre: `${col.nombres} ${col.apellidos}`.toUpperCase(),
          cc: `${col.tipoDocumento} ${col.numeroDocumento}`,
          ccLugar: col.lugarExpedicionDoc ?? '',
        },
        contrato: {
          ciudad: col.ciudadResidencia?.nombre ?? c.sede.ciudad.nombre,
          fechaSuscripcion: c.creadoEn.toISOString().slice(0, 10),
          cargoObjeto: c.cargo?.nombre ?? col.cargo?.nombre ?? '',
        },
      },
      genero: col.genero,
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
    if (!c.contenidoPdf) throw new ErrorNegocio('El contrato no tiene datos para regenerar. Debe recrearse.')
    const snapshot = c.contenidoPdf as unknown as SnapshotContratoOps

    const [imgContratante, imgContratista] = await Promise.all([
      c.firmaContratantePath ? leerFirmaComoDataUri(c.firmaContratantePath) : Promise.resolve(null),
      c.firmaContratistaPath ? leerFirmaComoDataUri(c.firmaContratistaPath) : Promise.resolve(null),
    ])
    const firmado = !!(c.firmaContratistaPath && c.firmaContratantePath)

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
        titulo: 'La empresa radicó tu cuenta de cobro',
        mensaje: `Se radicó a tu nombre la cuenta ${cuenta.numero} (periodo ${d.periodo}, ${d.concepto || 'sin concepto'}). Revísala en tu autoservicio${contrato ? ' y adjunta tu planilla PILA para que pueda aprobarse' : ''}.`,
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
          titulo: 'Tu planilla de seguridad social no pasó la verificación',
          mensaje: `El soporte de tu cuenta de cobro ${cuenta.numero} fue marcado como inválido${d.observaciones ? `: ${d.observaciones}` : '.'} Sube la planilla corregida desde tu autoservicio para continuar con el pago.`,
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
      BLOQUEADA_SS: { titulo: 'Cuenta de cobro bloqueada por seguridad social', mensaje: `Tu cuenta ${cuenta.numero} quedó bloqueada: el soporte de seguridad social no está al día. Sube la planilla corregida desde tu autoservicio.` },
      APROBADA: { titulo: 'Cuenta de cobro aprobada', mensaje: `Tu cuenta ${cuenta.numero} fue aprobada y está en trámite de pago.` },
      PAGADA: { titulo: 'Cuenta de cobro pagada', mensaje: `Tu cuenta ${cuenta.numero} fue pagada${d.fechaPago ? ` el ${d.fechaPago}` : ''}.` },
      RECHAZADA: { titulo: 'Cuenta de cobro rechazada', mensaje: `Tu cuenta ${cuenta.numero} fue rechazada. Contacta a la administración para conocer el detalle.` },
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
