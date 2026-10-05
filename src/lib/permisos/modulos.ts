/**
 * Catálogo de módulos del sistema para la matriz de permisos (RBAC).
 * `modulo` se guarda como String en BD (no enum) para soportar módulos
 * personalizados con clave dinámica `custom:{slug}` (veredicto C13).
 */

export const MODULOS = {
  colaboradores: 'Colaboradores',
  colaboradores_salud: 'Datos de salud (sensibles, Ley 1581)',
  contratos: 'Contratación y vinculación',
  nomina: 'Nómina',
  novedades: 'Novedades',
  horarios: 'Horarios y cronograma de domingos y festivos',
  terminaciones: 'Terminaciones y paz y salvo',
  autoservicio: 'Autoservicio del empleado',
  activos: 'Activos y dotación',
  capacitaciones: 'Capacitaciones',
  evaluaciones: 'Evaluación de desempeño',
  bienestar: 'Bienestar (cumpleaños y celebraciones)',
  juridica: 'Jurídica',
  calendario_legal: 'Calendario de obligaciones legales',
  sst: 'Seguridad y Salud en el Trabajo',
  // Lo consume la app de control de asistencia (ArriveControl), que comparte
  // usuarios y sesiones con esta plataforma. Ver docs/integraciones/.
  asistencia: 'Control de asistencia (marcaciones)',
  vencimientos: 'Vencimientos y alertas',
  documentos: 'Gestión documental',
  reportes: 'Reportes y tableros',
  configuracion: 'Configuración',
  usuarios: 'Usuarios y roles',
  auditoria: 'Auditoría',
} as const

export type ModuloSistema = keyof typeof MODULOS

/** Clave de módulo personalizado: `custom:{slug}` */
export type ModuloClave = ModuloSistema | `custom:${string}`

export const ACCIONES = ['VER', 'CREAR', 'EDITAR', 'ELIMINAR', 'APROBAR', 'EXPORTAR'] as const
export type Accion = (typeof ACCIONES)[number]

export type Alcance = 'TODAS_SEDES' | 'SEDES_ASIGNADAS' | 'EQUIPO' | 'PROPIO'

/**
 * Las acciones que el código revisa de verdad en cada módulo. La matriz de
 * permisos solo muestra estas: una casilla que no cambia nada (p. ej. «Exportar»
 * en Capacitaciones) confunde. Si una pantalla empieza a revisar otra acción,
 * se agrega aquí. Vacío = el módulo no lo usa ninguna pantalla todavía.
 */
export const ACCIONES_EN_USO: Record<ModuloSistema, readonly Accion[]> = {
  colaboradores: ['VER', 'CREAR', 'EDITAR'],
  colaboradores_salud: ['VER', 'CREAR', 'EDITAR'],
  contratos: ['VER', 'CREAR', 'EDITAR', 'ELIMINAR', 'APROBAR'],
  nomina: ['VER', 'CREAR', 'EDITAR', 'APROBAR', 'EXPORTAR'],
  novedades: ['VER', 'CREAR', 'EDITAR', 'ELIMINAR'],
  horarios: ['VER', 'EDITAR', 'ELIMINAR'],
  terminaciones: ['VER', 'CREAR', 'EDITAR', 'ELIMINAR', 'APROBAR'],
  autoservicio: ['VER', 'CREAR', 'APROBAR'],
  activos: ['VER', 'CREAR', 'EDITAR'],
  capacitaciones: ['VER', 'CREAR', 'EDITAR'],
  evaluaciones: ['VER', 'CREAR'],
  bienestar: ['VER', 'CREAR', 'EDITAR', 'ELIMINAR'],
  juridica: ['VER', 'CREAR', 'EDITAR', 'ELIMINAR'],
  calendario_legal: ['VER', 'CREAR', 'EDITAR'],
  sst: ['VER', 'CREAR', 'EDITAR', 'ELIMINAR'],
  asistencia: [],
  vencimientos: ['VER'],
  documentos: ['VER', 'CREAR', 'EDITAR', 'ELIMINAR'],
  reportes: ['VER'],
  configuracion: ['VER', 'CREAR', 'EDITAR', 'ELIMINAR'],
  usuarios: ['VER', 'CREAR', 'EDITAR', 'ELIMINAR'],
  auditoria: [],
}

/** Módulos donde el alcance de datos filtra algo (en el resto no cambia nada). */
export const MODULOS_CON_ALCANCE: readonly ModuloSistema[] = ['colaboradores', 'novedades', 'sst', 'vencimientos']

/** Los módulos agrupados como el menú, para recorrer la matriz por áreas. */
export const GRUPOS_MODULOS: { titulo: string; modulos: ModuloSistema[] }[] = [
  { titulo: 'Talento humano', modulos: ['colaboradores', 'colaboradores_salud', 'contratos', 'nomina', 'novedades', 'horarios', 'activos', 'capacitaciones', 'evaluaciones', 'bienestar', 'terminaciones'] },
  { titulo: 'Cumplimiento', modulos: ['juridica', 'calendario_legal', 'sst', 'vencimientos', 'documentos'] },
  { titulo: 'Mi espacio', modulos: ['autoservicio'] },
  { titulo: 'Administración', modulos: ['reportes', 'configuracion', 'usuarios'] },
]

export function esModuloValido(clave: string): boolean {
  return clave in MODULOS || clave.startsWith('custom:')
}

// ─────────────────────────────────────────────────────────────────────────────
// Matriz semilla de los 9 roles del sistema (editable luego por el Administrador)
// ─────────────────────────────────────────────────────────────────────────────

type PermisoSeed = { modulo: ModuloSistema; acciones: Accion[]; alcance: Alcance }

const TODAS: Accion[] = ['VER', 'CREAR', 'EDITAR', 'ELIMINAR', 'APROBAR', 'EXPORTAR']

function todos(modulos: ModuloSistema[], alcance: Alcance = 'TODAS_SEDES'): PermisoSeed[] {
  return modulos.map((modulo) => ({ modulo, acciones: TODAS, alcance }))
}

export const ROLES_SEED: Record<
  string,
  { descripcion: string; permisos: PermisoSeed[] }
> = {
  Administrador: {
    descripcion: 'Acceso total y configuración de la plataforma.',
    permisos: todos(Object.keys(MODULOS) as ModuloSistema[]),
  },
  Subgerencia: {
    descripcion: 'Supervisión general: ve todo y aprueba solicitudes de autoservicio.',
    permisos: [
      ...(['colaboradores', 'contratos', 'nomina', 'terminaciones', 'activos', 'capacitaciones', 'evaluaciones', 'juridica', 'calendario_legal', 'sst', 'vencimientos', 'documentos'] as ModuloSistema[]).map(
        (modulo): PermisoSeed => ({ modulo, acciones: ['VER'], alcance: 'TODAS_SEDES' }),
      ),
      { modulo: 'autoservicio', acciones: ['VER', 'APROBAR'], alcance: 'TODAS_SEDES' },
      { modulo: 'novedades', acciones: ['VER', 'APROBAR'], alcance: 'TODAS_SEDES' },
      { modulo: 'reportes', acciones: ['VER', 'EXPORTAR'], alcance: 'TODAS_SEDES' },
    ],
  },
  'Recursos Humanos': {
    descripcion: 'Gestiona personas, contratos, novedades y documentos.',
    permisos: [
      ...todos([
        'colaboradores', 'contratos', 'novedades', 'terminaciones', 'activos',
        'capacitaciones', 'evaluaciones', 'bienestar', 'documentos', 'vencimientos', 'horarios',
      ]),
      { modulo: 'colaboradores_salud', acciones: ['VER', 'CREAR', 'EDITAR'], alcance: 'TODAS_SEDES' },
      { modulo: 'autoservicio', acciones: ['VER', 'APROBAR'], alcance: 'TODAS_SEDES' },
      { modulo: 'nomina', acciones: ['VER'], alcance: 'TODAS_SEDES' },
      { modulo: 'calendario_legal', acciones: ['VER'], alcance: 'TODAS_SEDES' },
      { modulo: 'reportes', acciones: ['VER', 'EXPORTAR'], alcance: 'TODAS_SEDES' },
    ],
  },
  Nómina: {
    descripcion: 'Liquida y paga nómina, comisiones y bonos.',
    permisos: [
      { modulo: 'nomina', acciones: ['VER', 'CREAR', 'EDITAR', 'APROBAR', 'EXPORTAR'], alcance: 'TODAS_SEDES' },
      { modulo: 'colaboradores', acciones: ['VER'], alcance: 'TODAS_SEDES' },
      { modulo: 'contratos', acciones: ['VER'], alcance: 'TODAS_SEDES' },
      { modulo: 'novedades', acciones: ['VER', 'EDITAR'], alcance: 'TODAS_SEDES' },
      { modulo: 'terminaciones', acciones: ['VER'], alcance: 'TODAS_SEDES' },
      { modulo: 'vencimientos', acciones: ['VER'], alcance: 'TODAS_SEDES' },
      { modulo: 'documentos', acciones: ['VER', 'CREAR'], alcance: 'TODAS_SEDES' },
      { modulo: 'reportes', acciones: ['VER', 'EXPORTAR'], alcance: 'TODAS_SEDES' },
    ],
  },
  Contador: {
    descripcion: 'Consulta nómina, OPS y reportes; calcula liquidaciones definitivas.',
    permisos: [
      { modulo: 'nomina', acciones: ['VER', 'EXPORTAR'], alcance: 'TODAS_SEDES' },
      { modulo: 'contratos', acciones: ['VER'], alcance: 'TODAS_SEDES' },
      { modulo: 'terminaciones', acciones: ['VER', 'EDITAR'], alcance: 'TODAS_SEDES' },
      { modulo: 'colaboradores', acciones: ['VER'], alcance: 'TODAS_SEDES' },
      { modulo: 'reportes', acciones: ['VER', 'EXPORTAR'], alcance: 'TODAS_SEDES' },
    ],
  },
  'Jefe de área': {
    descripcion: 'Aprueba solicitudes y ve la información de su equipo.',
    permisos: [
      { modulo: 'colaboradores', acciones: ['VER'], alcance: 'EQUIPO' },
      { modulo: 'novedades', acciones: ['VER', 'CREAR'], alcance: 'EQUIPO' },
      { modulo: 'autoservicio', acciones: ['VER', 'APROBAR'], alcance: 'EQUIPO' },
      { modulo: 'evaluaciones', acciones: ['VER', 'CREAR', 'EDITAR'], alcance: 'EQUIPO' },
      { modulo: 'capacitaciones', acciones: ['VER'], alcance: 'EQUIPO' },
      { modulo: 'vencimientos', acciones: ['VER'], alcance: 'EQUIPO' },
      { modulo: 'reportes', acciones: ['VER'], alcance: 'EQUIPO' },
    ],
  },
  Empleado: {
    descripcion: 'Autoservicio: su ficha, solicitudes y descargas.',
    permisos: [
      { modulo: 'colaboradores', acciones: ['VER'], alcance: 'PROPIO' },
      { modulo: 'autoservicio', acciones: ['VER', 'CREAR'], alcance: 'PROPIO' },
      { modulo: 'documentos', acciones: ['VER'], alcance: 'PROPIO' },
    ],
  },
  Jurídica: {
    descripcion: 'Gestiona contratos legales, procesos disciplinarios y calendario de obligaciones.',
    permisos: [
      ...todos(['juridica', 'calendario_legal']),
      { modulo: 'contratos', acciones: ['VER'], alcance: 'TODAS_SEDES' },
      { modulo: 'terminaciones', acciones: ['VER', 'EDITAR'], alcance: 'TODAS_SEDES' },
      { modulo: 'colaboradores', acciones: ['VER'], alcance: 'TODAS_SEDES' },
      { modulo: 'documentos', acciones: ['VER', 'CREAR', 'EDITAR'], alcance: 'TODAS_SEDES' },
      { modulo: 'vencimientos', acciones: ['VER'], alcance: 'TODAS_SEDES' },
      { modulo: 'reportes', acciones: ['VER', 'EXPORTAR'], alcance: 'TODAS_SEDES' },
    ],
  },
  'Responsable SST': {
    descripcion: 'Administra el SG-SST: comités, exámenes, accidentes, EPP e indicadores.',
    permisos: [
      ...todos(['sst', 'capacitaciones']),
      { modulo: 'colaboradores', acciones: ['VER'], alcance: 'TODAS_SEDES' },
      { modulo: 'colaboradores_salud', acciones: ['VER', 'CREAR', 'EDITAR'], alcance: 'TODAS_SEDES' },
      { modulo: 'documentos', acciones: ['VER', 'CREAR'], alcance: 'TODAS_SEDES' },
      { modulo: 'vencimientos', acciones: ['VER'], alcance: 'TODAS_SEDES' },
      { modulo: 'reportes', acciones: ['VER', 'EXPORTAR'], alcance: 'TODAS_SEDES' },
    ],
  },
}
