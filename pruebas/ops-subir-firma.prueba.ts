import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { instalarSesionFalsa, actuarComo } from './sesion-falsa'

instalarSesionFalsa()

const { prisma } = await import('@/lib/db')
const { subirContratoOpsParaFirma, analizarPdfContratoOps, regenerarDocumentosContrato, firmarContratoOps } =
  await import('@/app/(app)/contratos/ops-acciones')
import type { UsuarioSesion } from '@/lib/permisos/tipos'

/**
 * «Subir y enviar a firma»: alta de un contrato OPS aportando el PDF.
 *
 * Se prueba de punta a punta y contra la base real porque los tres fallos que
 * motivaron estas pruebas vivían en los bordes, no en la lógica: una migración
 * sin aplicar, la autorización de datos generada sin titular, y la acción de
 * regenerar aceptando un contrato que no tiene plantilla que regenerar. Ninguno
 * lo habría visto una prueba de la validación o del cálculo.
 *
 * Por eso cada caso mira lo que queda DESPUÉS de guardar, no lo que devuelve la
 * acción: un contrato sin la posición de las firmas, o una autorización sin
 * nombre ni cédula, se «guardan bien» y solo fallan cuando alguien va a firmar.
 */

type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string }

/** Estrecha el resultado de una Server Action y falla con su propio mensaje. */
function datosDe<T>(res: Resultado<T>): T {
  if (!res.ok) throw new Error(res.error)
  return res.datos
}

/** El simétrico: exige que la acción haya fallado y devuelve el motivo. */
function errorDe<T>(res: Resultado<T>): string {
  if (res.ok) throw new Error('La acción debía fallar y salió bien.')
  return res.error
}

const MARCA = 'PRUEBA-OPS-FIRMA'
/** PNG 1×1 transparente: sirve como imagen de firma sin acarrear un archivo. */
const FIRMA_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

let admin: UsuarioSesion
let colab: { id: string; nombres: string; apellidos: string; tipoDocumento: string; numeroDocumento: string }
let sedeId: string
let pdfDataUri: string
const contratosCreados: string[] = []

async function sesionDe(email: string): Promise<UsuarioSesion> {
  const u = await prisma.user.findUniqueOrThrow({
    where: { email }, include: { rol: { include: { permisos: true } } },
  })
  const c = await prisma.colaborador.findFirst({ where: { usuarioId: u.id }, select: { id: true } })
  return {
    id: u.id, email: u.email, nombre: u.name, rolId: u.rolId!,
    rolNombre: u.rol!.nombre, rolNombres: [u.rol!.nombre], estado: u.estado,
    debeCambiarPassword: false, colaboradorId: c?.id ?? null, sedeIds: [],
    permisos: u.rol!.permisos.map((p) => ({
      modulo: p.modulo as never, accion: p.accion as never, alcance: p.alcance as never,
    })),
  }
}

/** Alta con los datos mínimos; cada caso ajusta lo que le interesa. */
async function subir(extra: Record<string, unknown> = {}) {
  const res = await subirContratoOpsParaFirma({
    pdfBase64: pdfDataUri,
    colaboradorId: colab.id,
    numero: '', cargoId: '', cargoObjeto: MARCA, sedeId,
    valorTotal: 12_000_000, valorMensual: undefined, supervisorId: '', rut: '',
    fechaInicio: '2026-09-01', fechaFin: '2026-12-31',
    ciudad: 'Pasto, Nariño', fechaSuscripcion: '',
    posicionContratista: { pagina: 1, x: 330, y: 150, ancho: 150, alto: 45 },
    posicionContratante: { pagina: 1, x: 80, y: 150, ancho: 150, alto: 45 },
    ...extra,
  })
  if (res.ok) contratosCreados.push(res.datos.id)
  return res
}

beforeAll(async () => {
  const users = await prisma.user.findMany({ include: { rol: { include: { permisos: true } } } })
  const conCrear = users.find((u) => u.rol?.permisos.some((p) => p.modulo === 'contratos' && p.accion === 'CREAR'))
  if (!conCrear) throw new Error('No hay usuario con permiso contratos:CREAR en la base local')
  admin = await sesionDe(conCrear.email)

  // El contratista firma desde su autoservicio, así que la acción exige que el
  // colaborador tenga usuario de acceso. Sin eso el caso ni siquiera aplica.
  const c = await prisma.colaborador.findFirst({
    where: { usuarioId: { not: null } },
    select: { id: true, sedeId: true, nombres: true, apellidos: true, tipoDocumento: true, numeroDocumento: true },
  })
  if (!c) throw new Error('No hay colaborador con usuario de acceso en la base local')
  colab = c
  sedeId = c.sedeId ?? (await prisma.sede.findFirstOrThrow({ where: { activa: true } })).id

  // PDF de una página con el bloque de firmas escrito, para que la detección
  // tenga capa de texto que leer (un escaneo devolvería null y se marca a mano).
  const { PDFDocument, StandardFonts } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const page = doc.addPage([612, 792])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  page.drawText('CONTRATO DE PRESTACION DE SERVICIOS', { x: 80, y: 700, size: 12, font })
  page.drawText('EL CONTRATANTE', { x: 80, y: 160, size: 10, font })
  page.drawText('EL CONTRATISTA', { x: 340, y: 160, size: 10, font })
  pdfDataUri = 'data:application/pdf;base64,' + Buffer.from(await doc.save()).toString('base64')
})

afterAll(async () => {
  for (const id of contratosCreados) {
    await prisma.evidenciaFirmaContrato.deleteMany({ where: { contratoOpsId: id } })
    await prisma.documento.deleteMany({ where: { entidadTipo: 'ContratoOps', entidadId: id } })
    await prisma.entregableOps.deleteMany({ where: { contratoOpsId: id } })
    await prisma.contratoOps.deleteMany({ where: { id } })
  }
})

describe('OPS · subir PDF y enviar a firma', () => {
  it('analiza el PDF y devuelve el número de páginas', async () => {
    actuarComo(admin)
    const res = await analizarPdfContratoOps({ pdfBase64: pdfDataUri })
    expect(res.ok).toBe(true)
    expect(datosDe(res).paginas).toBe(1)
  })

  it('guarda el contrato con el PDF archivado y la posición de las firmas', async () => {
    actuarComo(admin)
    const res = await subir()
    expect(res.ok).toBe(true)

    const { id } = datosDe(res)
    const c = await prisma.contratoOps.findUniqueOrThrow({ where: { id } })
    expect(c.origenPdf).toBe('SUBIDO_PARA_FIRMA')
    expect(c.objeto).toContain(MARCA)

    // Sin la posición guardada no hay dónde estampar la firma después.
    const pos = c.posicionFirmas as { contratista?: unknown; contratante?: unknown; documentoOriginalId?: string } | null
    expect(pos?.contratista).toBeTruthy()
    expect(pos?.contratante).toBeTruthy()

    const docs = await prisma.documento.findMany({ where: { entidadTipo: 'ContratoOps', entidadId: id } })
    expect(docs.some((doc) => doc.id === pos?.documentoOriginalId)).toBe(true)
  })

  it('genera la autorización de datos identificando al titular', async () => {
    actuarComo(admin)
    const res = await subir()
    expect(res.ok).toBe(true)

    const c = await prisma.contratoOps.findUniqueOrThrow({ where: { id: datosDe(res).id } })
    const aut = (c.contenidoPdf as { autorizacion?: Record<string, string> } | null)?.autorizacion
    expect(aut).toBeTruthy()

    // El formulario de alta con PDF no pide los datos del contratista: salen de
    // su ficha. Una autorización de tratamiento de datos sin nombre ni cédula no
    // identifica al titular, y entonces no autoriza nada.
    expect(aut!.contratistaNombre).toBe(`${colab.nombres} ${colab.apellidos}`.toUpperCase())
    expect(aut!.contratistaCc).toContain(colab.numeroDocumento)
    expect(aut!.empresa).toBeTruthy()

    const docs = await prisma.documento.findMany({ where: { entidadTipo: 'ContratoOps', entidadId: c.id } })
    expect(docs.some((doc) => doc.nombre.startsWith('Autorización'))).toBe(true)
  })

  it('estampa ambas firmas sobre el PDF aportado y marca el contrato FIRMADO', async () => {
    actuarComo(admin)
    const res = await subir()
    const { id } = datosDe(res)

    // La firma del contratista va por su autoservicio; aquí se aplica el mismo
    // núcleo compartido para no depender del código OTP enviado por correo.
    const { aplicarFirmaContratoOps } = await import('@/server/contratos-ops-firma')
    await aplicarFirmaContratoOps({ contratoId: id, rol: 'CONTRATISTA', firmaDataUri: FIRMA_PNG, usuarioId: admin.id })
    const firma = await firmarContratoOps({ contratoId: id, rol: 'CONTRATANTE', firmaDataUri: FIRMA_PNG })
    expect(firma.ok).toBe(true)

    const c = await prisma.contratoOps.findUniqueOrThrow({ where: { id } })
    expect(c.estado).toBe('FIRMADO')

    const docs = await prisma.documento.findMany({ where: { entidadTipo: 'ContratoOps', entidadId: id } })
    const firmado = docs.find((doc) => doc.nombre.includes('(firmado)'))
    expect(firmado, 'debe quedar el PDF estampado').toBeTruthy()
    // El original no se pisa: es la referencia para comparar contra lo firmado.
    const pos = c.posicionFirmas as { documentoOriginalId: string }
    expect(firmado!.id).not.toBe(pos.documentoOriginalId)
    expect(docs.some((doc) => doc.id === pos.documentoOriginalId)).toBe(true)
  })

  it('no deja regenerar un contrato subido: no hay plantilla que regenerar', async () => {
    actuarComo(admin)
    const res = await subir()
    const { id } = datosDe(res)

    // La UI ya esconde el botón, pero una Server Action es una entrada pública:
    // regenerar aquí archivaría un PDF en blanco con nombre de contrato real.
    const r = await regenerarDocumentosContrato({ contratoId: id })
    expect(r.ok).toBe(false)
    expect(errorDe(r)).toContain('no se redactó desde una plantilla')
  })

  it('rechaza al contratista sin usuario de acceso: no podría firmar', async () => {
    const sinUsuario = await prisma.colaborador.findFirst({ where: { usuarioId: null }, select: { id: true } })
    if (!sinUsuario) return // la base local no tiene ninguno; nada que comprobar

    actuarComo(admin)
    const res = await subir({ colaboradorId: sinUsuario.id })
    expect(res.ok).toBe(false)
    expect(errorDe(res)).toContain('usuario de acceso')
  })
})
