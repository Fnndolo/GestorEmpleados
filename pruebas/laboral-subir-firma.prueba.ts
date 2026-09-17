import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { instalarSesionFalsa, actuarComo } from './sesion-falsa'

instalarSesionFalsa()

const { prisma } = await import('@/lib/db')
const { subirContratoParaFirma, analizarPdfContratoLaboral, firmarContratoLaboral, prepararCorreccionFirmaLaboral, corregirPosicionFirmaLaboral } =
  await import('@/app/(app)/contratos/acciones')
import type { UsuarioSesion } from '@/lib/permisos/tipos'

/**
 * Contrato LABORAL subido como PDF para firmarse en la app: espejo de la prueba
 * del OPS. Se ejercita entero contra la base porque lo que aquí importa vive en
 * los bordes: el PDF archivado, la posición de las firmas guardada, la
 * autorización de datos generada (o no), y que al firmar las dos partes el
 * documento final salga estampado sobre el archivo aportado.
 */

type Resultado<T> = { ok: true; datos: T } | { ok: false; error: string }
function datosDe<T>(res: Resultado<T>): T {
  if (!res.ok) throw new Error(res.error)
  return res.datos
}
function errorDe<T>(res: Resultado<T>): string {
  if (res.ok) throw new Error('La acción debía fallar y salió bien.')
  return res.error
}

const MARCA = 'PRUEBA-LABORAL-FIRMA'
const FIRMA_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

let admin: UsuarioSesion
let colab: { id: string; nombres: string; apellidos: string; numeroDocumento: string }
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

/** Alta con los datos mínimos de un indefinido; cada caso ajusta lo que le interesa. */
async function subir(extra: Record<string, unknown> = {}) {
  const res = await subirContratoParaFirma({
    pdfBase64: pdfDataUri,
    colaboradorId: colab.id,
    tipo: 'TERMINO_INDEFINIDO', cargoId: '', sedeId,
    jornada: 'TIEMPO_COMPLETO', modalidadTrabajo: 'PRESENCIAL',
    salarioBase: 2_000_000, ganaSalarioMinimo: false, tieneAuxTransporte: true, tipoSalario: 'ORDINARIO',
    fechaInicio: '2026-09-01', fechaFin: '', objetoObraLabor: '', etapaAprendizaje: '',
    observaciones: MARCA,
    posicionEmpleado: { pagina: 1, x: 330, y: 150, ancho: 150, alto: 45 },
    posicionEmpleador: { pagina: 1, x: 80, y: 150, ancho: 150, alto: 45 },
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

  // Un empleado activo, con usuario de acceso (firma desde su autoservicio) y
  // vínculo indefinido: así el alta no le cambia nada a su ficha.
  const c = await prisma.colaborador.findFirst({
    where: { usuarioId: { not: null }, estado: 'ACTIVO', tipoVinculo: 'TERMINO_INDEFINIDO' },
    select: { id: true, sedeId: true, nombres: true, apellidos: true, numeroDocumento: true },
  })
  if (!c) throw new Error('No hay empleado indefinido con usuario de acceso en la base local')
  colab = c
  sedeId = c.sedeId ?? (await prisma.sede.findFirstOrThrow({ where: { activa: true } })).id

  // PDF de una página con el bloque de firmas de un contrato de trabajo.
  const { PDFDocument, StandardFonts } = await import('pdf-lib')
  const doc = await PDFDocument.create()
  const page = doc.addPage([612, 792])
  const font = await doc.embedFont(StandardFonts.Helvetica)
  page.drawText('CONTRATO INDIVIDUAL DE TRABAJO', { x: 80, y: 700, size: 12, font })
  page.drawText('EL EMPLEADOR', { x: 80, y: 160, size: 10, font })
  page.drawText('EL TRABAJADOR', { x: 340, y: 160, size: 10, font })
  pdfDataUri = 'data:application/pdf;base64,' + Buffer.from(await doc.save()).toString('base64')
})

afterAll(async () => {
  for (const id of contratosCreados) {
    await prisma.evidenciaFirmaContrato.deleteMany({ where: { contratoId: id } })
    await prisma.documento.deleteMany({ where: { entidadTipo: 'Contrato', entidadId: id } })
    await prisma.contrato.deleteMany({ where: { id } })
  }
})

describe('Laboral · subir PDF y enviar a firma', () => {
  it('propone dónde firma cada parte leyendo "EL TRABAJADOR" y "EL EMPLEADOR"', async () => {
    actuarComo(admin)
    const d = datosDe(await analizarPdfContratoLaboral({ pdfBase64: pdfDataUri }))
    expect(d.paginas).toBe(1)
    // Con las etiquetas de OPS no se encontraría nada: el contrato de trabajo dice otra cosa.
    expect(d.contratista).not.toBeNull()
    expect(d.contratante).not.toBeNull()
    expect(d.contratista!.x).toBeGreaterThan(d.contratante!.x)
  })

  it('guarda el contrato con el PDF archivado, la posición de las firmas y la autorización generada', async () => {
    actuarComo(admin)
    const { id } = datosDe(await subir())
    const c = await prisma.contrato.findUniqueOrThrow({ where: { id } })
    expect(c.origenPdf).toBe('SUBIDO_PARA_FIRMA')
    expect(c.firmaEmpleadorEnPdf).toBe(false)

    const pos = c.posicionFirmas as { empleado?: unknown; empleador?: unknown; documentoOriginalId?: string } | null
    expect(pos?.empleado).toBeTruthy()
    expect(pos?.empleador).toBeTruthy()

    const docs = await prisma.documento.findMany({ where: { entidadTipo: 'Contrato', entidadId: id } })
    expect(docs.some((d) => d.id === pos?.documentoOriginalId)).toBe(true)
    expect(docs.some((d) => d.nombre.startsWith('Autorización'))).toBe(true)

    // La autorización identifica al titular y lo trata como trabajador, no como contratista.
    const aut = (c.contenidoPdf as { autorizacion?: Record<string, string> } | null)?.autorizacion
    expect(aut?.contratistaNombre).toBe(`${colab.nombres} ${colab.apellidos}`.toUpperCase())
    expect(aut?.contratistaCc).toContain(colab.numeroDocumento)
    expect(aut?.vinculo).toBe('LABORAL')
  })

  it('pone en la ficha del colaborador el cargo del contrato (y su área)', async () => {
    // El cargo vive en la ficha y en el contrato; la ficha muestra el suyo. Quien
    // se creó sin cargo quedaba «Sin cargo» aunque su contrato lo tuviera.
    const antes = await prisma.colaborador.findUniqueOrThrow({ where: { id: colab.id }, select: { cargoId: true, areaId: true } })
    const otro = await prisma.cargo.findFirst({
      where: { activo: true, ...(antes.cargoId ? { NOT: { id: antes.cargoId } } : {}) },
      select: { id: true, areaId: true },
    })
    if (!otro) return
    try {
      actuarComo(admin)
      datosDe(await subir({ cargoId: otro.id }))
      const despues = await prisma.colaborador.findUniqueOrThrow({ where: { id: colab.id }, select: { cargoId: true, areaId: true } })
      expect(despues.cargoId).toBe(otro.id)
      expect(despues.areaId).toBe(otro.areaId)
    } finally {
      await prisma.colaborador.update({ where: { id: colab.id }, data: { cargoId: antes.cargoId, areaId: antes.areaId } })
    }
  })

  it('no incluye autorización si así se pide', async () => {
    actuarComo(admin)
    const { id } = datosDe(await subir({ generarAutorizacion: false }))
    const docs = await prisma.documento.findMany({ where: { entidadTipo: 'Contrato', entidadId: id } })
    expect(docs.some((d) => d.nombre.startsWith('Autorización'))).toBe(false)
    expect(docs).toHaveLength(1)
  })

  it('estampa ambas firmas sobre el PDF aportado y marca el contrato FIRMADO', async () => {
    actuarComo(admin)
    const { id } = datosDe(await subir())

    // La firma del empleado va por su autoservicio (con código al correo); aquí
    // se aplica el mismo núcleo compartido para no depender del OTP.
    const { aplicarFirmaContratoLaboral } = await import('@/server/contratos-laboral-firma')
    await aplicarFirmaContratoLaboral({ contratoId: id, rol: 'EMPLEADO', firmaDataUri: FIRMA_PNG, usuarioId: admin.id })
    const firma = await firmarContratoLaboral({ contratoId: id, firmaDataUri: FIRMA_PNG })
    expect(firma.ok).toBe(true)

    const c = await prisma.contrato.findUniqueOrThrow({ where: { id } })
    expect(c.firmaEmpleadoPath).toBeTruthy()
    expect(c.firmaEmpleadorPath).toBeTruthy()

    const docs = await prisma.documento.findMany({ where: { entidadTipo: 'Contrato', entidadId: id } })
    const firmado = docs.find((d) => d.nombre.includes('(firmado)') && !d.nombre.startsWith('Autorización'))
    expect(firmado, 'debe quedar el PDF estampado').toBeTruthy()
    // El original no se pisa: es la referencia para comparar contra lo firmado.
    const pos = c.posicionFirmas as { documentoOriginalId: string }
    expect(firmado!.id).not.toBe(pos.documentoOriginalId)
    // Y la autorización quedó firmada con la sola firma del empleado.
    expect(docs.some((d) => d.nombre.startsWith('Autorización') && d.nombre.includes('(firmada)'))).toBe(true)
  })

  it('si el empleador ya firmó en el PDF, basta la firma del empleado y se rechaza la digital del empleador', async () => {
    actuarComo(admin)
    const { id } = datosDe(await subir({ empleadorFirmoEnPdf: true, posicionEmpleador: undefined }))
    const c0 = await prisma.contrato.findUniqueOrThrow({ where: { id } })
    expect(c0.firmaEmpleadorEnPdf).toBe(true)
    expect((c0.posicionFirmas as { empleador: unknown }).empleador).toBeNull()

    // El empleador no tiene nada que firmar: ya lo hizo en el papel.
    expect(errorDe(await firmarContratoLaboral({ contratoId: id, firmaDataUri: FIRMA_PNG }))).toContain('ya firmó en el documento aportado')

    const { aplicarFirmaContratoLaboral } = await import('@/server/contratos-laboral-firma')
    const r = await aplicarFirmaContratoLaboral({ contratoId: id, rol: 'EMPLEADO', firmaDataUri: FIRMA_PNG, usuarioId: admin.id })
    expect(r.firmado).toBe(true)
    const docs = await prisma.documento.findMany({ where: { entidadTipo: 'Contrato', entidadId: id } })
    expect(docs.some((d) => d.nombre.includes('(firmado)') && !d.nombre.startsWith('Autorización'))).toBe(true)
  })

  it('corrige la posición de una firma ya estampada sin volver a firmar: reemplaza el PDF firmado y lo anota en el rastro', async () => {
    actuarComo(admin)
    const { id } = datosDe(await subir({ empleadorFirmoEnPdf: true, posicionEmpleador: undefined }))
    const { aplicarFirmaContratoLaboral } = await import('@/server/contratos-laboral-firma')
    const { METODO_CORRECCION_POSICION } = await import('@/server/contratos-estampar')
    await aplicarFirmaContratoLaboral({ contratoId: id, rol: 'EMPLEADO', firmaDataUri: FIRMA_PNG, usuarioId: admin.id })

    const esFirmado = (d: { nombre: string }) => d.nombre.includes('(firmado)') && !d.nombre.startsWith('Autorización')
    const antes = (await prisma.documento.findMany({ where: { entidadTipo: 'Contrato', entidadId: id } })).find(esFirmado)!
    expect(antes).toBeTruthy()

    // Al abrir la corrección se ve el ORIGINAL sin estampar, con la firma real.
    const prep = datosDe(await prepararCorreccionFirmaLaboral({ contratoId: id }))
    expect(prep.empleadorEnPdf).toBe(true)
    expect(prep.empleado.y).toBe(150)
    expect(prep.firmaEmpleado).toBe(FIRMA_PNG)
    expect(prep.firmaEmpleador).toBeNull()

    // La firma quedó muy abajo: se sube 300 puntos.
    const r = datosDe(await corregirPosicionFirmaLaboral({ contratoId: id, posicionEmpleado: { ...prep.empleado, y: 450 } }))
    expect(r.reestampado).toBe(true)

    const c = await prisma.contrato.findUniqueOrThrow({ where: { id } })
    const pos = c.posicionFirmas as { empleado: { y: number }; empleador: unknown; documentoOriginalId: string }
    expect(pos.empleado.y).toBe(450)
    expect(pos.empleador).toBeNull()
    // Nadie firmó de nuevo: la firma y su fecha son las mismas.
    expect(c.firmaEmpleadoPath).toBeTruthy()

    const docs = await prisma.documento.findMany({ where: { entidadTipo: 'Contrato', entidadId: id } })
    const firmados = docs.filter(esFirmado)
    expect(firmados, 'un solo PDF firmado: el corregido reemplaza al anterior').toHaveLength(1)
    expect(firmados[0].id).not.toBe(antes.id)
    expect(firmados[0].sha256).not.toBe(antes.sha256)
    expect(docs.some((d) => d.id === pos.documentoOriginalId), 'el original sigue intacto').toBe(true)

    // El rastro conserva la firma original y suma la corrección con el hash nuevo.
    const ev = await prisma.evidenciaFirmaContrato.findMany({ where: { contratoId: id }, orderBy: { firmadoEn: 'asc' } })
    expect(ev.map((e) => e.metodoAuth)).toEqual(['SESION', METODO_CORRECCION_POSICION])
    const docsEv = ev[1].documentos as { documentoId: string; sha256: string }[]
    expect(docsEv[0].documentoId).toBe(firmados[0].id)
    expect(docsEv[0].sha256).toBe(firmados[0].sha256)
  })

  it('exige la posición del empleador cuando el PDF no viene firmado por él', async () => {
    actuarComo(admin)
    expect(errorDe(await subir({ posicionEmpleador: undefined }))).toContain('dónde firma el empleador')
  })

  it('rechaza al empleado sin usuario de acceso: no podría firmar', async () => {
    const sinUsuario = await prisma.colaborador.findFirst({ where: { usuarioId: null }, select: { id: true } })
    if (!sinUsuario) return
    actuarComo(admin)
    expect(errorDe(await subir({ colaboradorId: sinUsuario.id }))).toContain('usuario de acceso')
  })
})
