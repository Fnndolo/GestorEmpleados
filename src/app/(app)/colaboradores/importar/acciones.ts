'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dbAuditado, auditar } from '@/lib/auditoria'
import { accion } from '@/server/accion'
import { parseFechaISO } from '@/lib/fechas'
import { normalizarTexto } from '@/lib/texto'

const filaSchema = z.object({
  tipoDocumento: z.string().default(''),
  numeroDocumento: z.string().default(''),
  nombres: z.string().default(''),
  apellidos: z.string().default(''),
  celular: z.string().default(''),
  emailPersonal: z.string().default(''),
  fechaNacimiento: z.string().default(''),
  direccion: z.string().default(''),
  tipoVinculo: z.string().default(''),
  modalidadTrabajo: z.string().default(''),
  sede: z.string().default(''),
  area: z.string().default(''),
  cargo: z.string().default(''),
  fechaIngreso: z.string().default(''),
  eps: z.string().default(''),
  afp: z.string().default(''),
  fondoCesantias: z.string().default(''),
  cajaCompensacion: z.string().default(''),
  arl: z.string().default(''),
  banco: z.string().default(''),
  tipoCuenta: z.string().default(''),
  numeroCuenta: z.string().default(''),
  vacacionesPendientes: z.string().default(''),
})

const importarSchema = z.object({
  archivoNombre: z.string(),
  filas: z.array(filaSchema).max(5000),
})

const TIPOS_DOC = ['CC', 'CE', 'TI', 'PASAPORTE', 'PPT', 'NIT']
const VINCULOS = ['TERMINO_INDEFINIDO', 'TERMINO_FIJO', 'OBRA_LABOR', 'APRENDIZ_SENA', 'OPS', 'PRACTICANTE']
const MODALIDADES = ['PRESENCIAL', 'REMOTO', 'HIBRIDO', 'TELETRABAJO']
const CUENTAS = ['AHORROS', 'CORRIENTE', 'BILLETERA_DIGITAL']

const norm = (s: string) => s.trim().toLowerCase()

export const importarColaboradores = accion(
  { modulo: 'colaboradores', accion: 'CREAR', schema: importarSchema },
  async ({ archivoNombre, filas }, usuario) => {
    // Catálogos en memoria (resolución por nombre)
    const [sedes, areas, cargos, entidades, bancos, existentes] = await Promise.all([
      prisma.sede.findMany({ select: { id: true, nombre: true } }),
      prisma.area.findMany({ select: { id: true, nombre: true } }),
      prisma.cargo.findMany({ select: { id: true, nombre: true } }),
      prisma.entidadSeguridadSocial.findMany({ select: { id: true, nombre: true, tipo: true } }),
      prisma.banco.findMany({ select: { id: true, nombre: true } }),
      prisma.colaborador.findMany({ select: { tipoDocumento: true, numeroDocumento: true } }),
    ])
    const sedeMap = new Map(sedes.map((s) => [norm(s.nombre), s.id]))
    const areaMap = new Map(areas.map((a) => [norm(a.nombre), a.id]))
    const cargoMap = new Map(cargos.map((c) => [norm(c.nombre), c.id]))
    const bancoMap = new Map(bancos.map((b) => [norm(b.nombre), b.id]))
    const entMap = (tipo: string) =>
      new Map(entidades.filter((e) => e.tipo === tipo).map((e) => [norm(e.nombre), e.id]))
    const epsMap = entMap('EPS'), afpMap = entMap('AFP'), fcMap = entMap('FONDO_CESANTIAS'),
      cajaMap = entMap('CAJA_COMPENSACION'), arlMap = entMap('ARL')
    const docsExistentes = new Set(existentes.map((e) => `${e.tipoDocumento}|${e.numeroDocumento}`))

    const errores: { fila: number; mensaje: string }[] = []
    const aCrear: { data: Record<string, unknown>; vacaciones: number }[] = []

    filas.forEach((f, idx) => {
      const fila = idx + 2 // +2: encabezado en fila 1
      const e = (msg: string) => errores.push({ fila, mensaje: msg })

      if (!f.numeroDocumento.trim() && !f.nombres.trim()) return // fila vacía → ignorar
      const tipoDoc = f.tipoDocumento.trim().toUpperCase()
      if (!TIPOS_DOC.includes(tipoDoc)) return e(`Tipo de documento inválido: "${f.tipoDocumento}"`)
      if (!f.numeroDocumento.trim()) return e('Falta el número de documento')
      if (docsExistentes.has(`${tipoDoc}|${f.numeroDocumento.trim()}`)) return e(`Ya existe colaborador con documento ${f.numeroDocumento}`)
      if (f.nombres.trim().length < 2) return e('Nombres inválidos')
      if (f.apellidos.trim().length < 2) return e('Apellidos inválidos')
      if (f.celular.trim().length < 7) return e('Celular inválido')
      const vinculo = f.tipoVinculo.trim().toUpperCase()
      if (!VINCULOS.includes(vinculo)) return e(`Tipo de vínculo inválido: "${f.tipoVinculo}"`)
      const modalidad = (f.modalidadTrabajo.trim().toUpperCase() || 'PRESENCIAL')
      if (!MODALIDADES.includes(modalidad)) return e(`Modalidad inválida: "${f.modalidadTrabajo}"`)
      const sedeId = sedeMap.get(norm(f.sede))
      if (!sedeId) return e(`Sede no encontrada: "${f.sede}"`)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(f.fechaIngreso.trim())) return e('Fecha de ingreso inválida (AAAA-MM-DD)')

      const areaId = f.area.trim() ? areaMap.get(norm(f.area)) : null
      if (f.area.trim() && !areaId) return e(`Área no encontrada: "${f.area}"`)
      const cargoId = f.cargo.trim() ? cargoMap.get(norm(f.cargo)) : null
      if (f.cargo.trim() && !cargoId) return e(`Cargo no encontrado: "${f.cargo}"`)
      const tipoCuenta = f.tipoCuenta.trim().toUpperCase()
      if (tipoCuenta && !CUENTAS.includes(tipoCuenta)) return e(`Tipo de cuenta inválido: "${f.tipoCuenta}"`)

      const vac = Number(f.vacacionesPendientes.trim().replace(',', '.'))

      aCrear.push({
        vacaciones: Number.isFinite(vac) && vac > 0 ? vac : 0,
        data: {
          tipoDocumento: tipoDoc,
          numeroDocumento: f.numeroDocumento.trim(),
          busquedaNormalizada: normalizarTexto(`${f.nombres} ${f.apellidos} ${f.numeroDocumento}`),
          nombres: f.nombres.trim(),
          apellidos: f.apellidos.trim(),
          celular: f.celular.trim(),
          emailPersonal: f.emailPersonal.trim() || null,
          fechaNacimiento: parseFechaISO(f.fechaNacimiento.trim()),
          direccion: f.direccion.trim() || null,
          tipoVinculo: vinculo,
          modalidadTrabajo: modalidad,
          sedeId,
          areaId: areaId ?? null,
          cargoId: cargoId ?? null,
          fechaIngreso: parseFechaISO(f.fechaIngreso.trim())!,
          estado: 'ACTIVO',
          epsId: epsMap.get(norm(f.eps)) ?? null,
          afpId: afpMap.get(norm(f.afp)) ?? null,
          fondoCesantiasId: fcMap.get(norm(f.fondoCesantias)) ?? null,
          cajaCompensacionId: cajaMap.get(norm(f.cajaCompensacion)) ?? null,
          arlId: arlMap.get(norm(f.arl)) ?? null,
          bancoId: bancoMap.get(norm(f.banco)) ?? null,
          tipoCuenta: tipoCuenta || null,
          numeroCuenta: f.numeroCuenta.trim() || null,
        },
      })
    })

    // Inserción en lotes de 100
    let insertadas = 0
    for (let i = 0; i < aCrear.length; i += 100) {
      const lote = aCrear.slice(i, i + 100)
      await prisma.$transaction(async (tx) => {
        for (const item of lote) {
          const col = await tx.colaborador.create({ data: item.data as never })
          insertadas++
          if (item.vacaciones > 0) {
            await tx.ajusteVacaciones.create({
              data: {
                colaboradorId: col.id,
                dias: item.vacaciones,
                motivo: 'Saldo inicial (importación)',
                esSaldoInicial: true,
                registradoPorId: usuario.id,
              },
            })
          }
        }
      })
    }

    await dbAuditado.importacionDatos.create({
      data: {
        tipo: 'colaboradores',
        archivoNombre,
        totalFilas: filas.length,
        insertadas,
        errores: errores.length,
        detalleErrores: errores.length ? errores : undefined,
        estado: 'COMPLETADA',
        importadoPorId: usuario.id,
      },
    })
    await auditar('CREAR', 'Colaborador', {
      descripcion: `Importación de colaboradores: ${insertadas} creados, ${errores.length} con error`,
    })

    revalidatePath('/colaboradores')
    return { insertadas, errores }
  },
)
