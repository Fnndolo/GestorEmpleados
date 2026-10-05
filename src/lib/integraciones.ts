/**
 * Qué datos se comparten con AsistencIA, uno por tipo y en las dos
 * direcciones. Vive en lib (sin servidor) porque la pantalla de Integraciones
 * muestra estos mismos textos.
 */
export type DatoCompartido = 'colaboradores' | 'fotos' | 'horas' | 'horarios'

export const DATOS_COMPARTIDOS: { clave: DatoCompartido; titulo: string; que: string; siSeApaga: string }[] = [
  {
    clave: 'colaboradores', titulo: 'Colaboradores',
    que: 'AsistencIA consulta nombre, cédula, sede y si sigue activo, para registrar a cada persona y no dejar marcar a un retirado.',
    siSeApaga: 'Allá no se pueden registrar personas nuevas desde aquí ni saber quién se retiró.',
  },
  {
    clave: 'fotos', titulo: 'Fotos de perfil',
    que: 'La foto que se pone aquí se copia allá, y la captura de allá puede volverse la foto de quien no tiene.',
    siSeApaga: 'Las fotos quedan solo en cada plataforma.',
  },
  {
    clave: 'horas', titulo: 'Horas trabajadas',
    que: 'Nómina trae de allá las horas extra y recargos de cada persona, y le avisa qué quedó pagado al cerrar.',
    siSeApaga: 'Las horas extra hay que registrarlas a mano en Novedades.',
  },
  {
    clave: 'horarios', titulo: 'Horarios',
    que: 'El horario que se asigna aquí se envía allá (con él calcula las horas extra), y se pueden recuperar los de allá.',
    siSeApaga: 'Un cambio de horario aquí no llega allá: hay que hacerlo en las dos.',
  },
]

/** Campo de ConfiguracionEmpresa de cada dato. */
export const CAMPO_COMPARTIDO = {
  colaboradores: 'asistenciaColaboradores',
  fotos: 'asistenciaFotos',
  horas: 'asistenciaHoras',
  horarios: 'asistenciaHorarios',
} as const satisfies Record<DatoCompartido, string>
