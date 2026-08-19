'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { prisma } from '@/lib/db'
import { dbAuditado, auditar } from '@/lib/auditoria'
import { accion } from '@/server/accion'
import { parseFechaISO } from '@/lib/fechas'
import { normalizarTexto } from '@/lib/texto'
import { crearUsuarioColaborador } from '@/server/usuarios'

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
  // Crear el usuario de acceso de cada importado (igual que el alta individual) y
  // enviarle la invitación. Se puede desactivar para cargar el histórico sin avisar
  // a nadie todavía; los accesos se pueden crear después desde cada ficha.
  crearUsuarios: z.boolean().default(true),
})

const TIPOS_DOC = ['CC', 'CE', 'TI', 'PASAPORTE', 'PPT', 'NIT']
const VINCULOS = ['TERMINO_INDEFINIDO', 'TERMINO_FIJO', 'OBRA_LABOR', 'APRENDIZ_SENA', 'OPS']
const MODALIDADES = ['PRESENCIAL', 'REMOTO', 'HIBRIDO']
const CUENTAS = ['AHORROS', 'CORRIENTE', 'BILLETERA_DIGITAL']

const norm = (s: string) => s.trim().toLowerCase()

export const importarColaboradores = accion(
  { modulo: 'colaboradores', accion: 'CREAR', schema: importarSchema },
  async ({ archivoNombre, filas, crearUsuarios }, usuario) => {
    // Catálogos en memoria (resolución por nombre)
    const [sedes, areas, cargos, entidades, bancos, existentes, rolEmpleado] = await Promise.all([
      prisma.sede.findMany({ select: { id: true, nombre: true } }),
      prisma.area.findMany({ select: { id: true, nombre: true } }),
      prisma.cargo.findMany({ select: { id: true, nombre: true, rolDefectoId: true } }),
      prisma.entidadSeguridadSocial.findMany({ select: { id: true, nombre: true, tipo: true } }),
      prisma.banco.findMany({ select: { id: true, nombre: true } }),
      prisma.colaborador.findMany({ select: { tipoDocumento: true, numeroDocumento: true } }),
      prisma.rol.findUnique({ where: { nombre: 'Empleado' }, select: { id: true } }),
    ])
    // Rol por defecto de cada cargo (mismo criterio que el alta individual).
    const rolDeCargo = new Map(cargos.map((c) => [c.id, c.rolDefectoId]))
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
    type Acceso = { email: string; nombre: string; cargoId: string | null; sedeId: string }
    const aCrear: { data: Record<string, unknown>; vacaciones: number; acceso: Acceso | null }[] = []
    // Un correo = un usuario: si el archivo repite correos, solo el primero puede
    // recibir acceso (Colaborador.usuarioId es único). Se avisa como error de fila.
    const correosEnArchivo = new Set<string>()

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

      // El correo se usa para el acceso: si viene repetido en el archivo, se importa
      // igual pero sin usuario (y se reporta), en vez de fallar silenciosamente.
      const correo = f.emailPersonal.trim().toLowerCase()
      let correoAcceso: string | null = correo || null
      if (correo) {
        if (correosEnArchivo.has(correo)) {
          e(`Correo repetido en el archivo: "${correo}" — se importa sin usuario de acceso`)
          correoAcceso = null
        } else {
          correosEnArchivo.add(correo)
        }
      }

      aCrear.push({
        vacaciones: Number.isFinite(vac) && vac > 0 ? vac : 0,
        acceso: correoAcceso
          ? { email: correoAcceso, nombre: `${f.nombres.trim()} ${f.apellidos.trim()}`, cargoId: cargoId ?? null, sedeId }
          : null,
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
    const pendientesAcceso: (Acceso & { colaboradorId: string })[] = []
    for (let i = 0; i < aCrear.length; i += 100) {
      const lote = aCrear.slice(i, i + 100)
      await prisma.$transaction(async (tx) => {
        for (const item of lote) {
          const col = await tx.colaborador.create({ data: item.data as never })
          insertadas++
          if (item.acceso) pendientesAcceso.push({ ...item.acceso, colaboradorId: col.id })
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

    // Usuarios de acceso: FUERA de la transacción (crean su propia sesión de auth y
    // envían correo). Un fallo aquí no debe deshacer la importación: el colaborador
    // queda creado y su acceso se puede generar luego desde la ficha.
    let usuariosCreados = 0
    if (crearUsuarios) {
      for (const p of pendientesAcceso) {
        const rolId = (p.cargoId ? rolDeCargo.get(p.cargoId) : null) ?? rolEmpleado?.id ?? null
        if (!rolId) continue
        try {
          const r = await crearUsuarioColaborador({
            email: p.email, nombre: p.nombre, rolId, colaboradorId: p.colaboradorId, sedeId: p.sedeId,
          })
          if (r) usuariosCreados++
          else errores.push({ fila: 0, mensaje: `El correo "${p.email}" ya tenía usuario: se vinculó al colaborador, sin crear cuenta nueva.` })
        } catch (err) {
          console.error('No se pudo crear el usuario del colaborador importado:', err)
          errores.push({ fila: 0, mensaje: `No se pudo crear el acceso de "${p.email}". Créalo luego desde su ficha.` })
        }
      }
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
      descripcion: `Importación de colaboradores: ${insertadas} creados, ${usuariosCreados} usuario(s) de acceso, ${errores.length} con error`,
    })

    revalidatePath('/colaboradores')
    revalidatePath('/configuracion/usuarios')
    return { insertadas, usuariosCreados, errores }
  },
)
