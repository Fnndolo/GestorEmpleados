/**
 * Cronograma de domingos y festivos: reglas puras (sin base ni React).
 *
 * La regla de la empresa: nadie trabaja dos domingos/festivos SEGUIDOS. Se
 * mira la lista ordenada de esos días —no el calendario—, así que trabajar el
 * domingo 2 impide el domingo 9 y también el lunes festivo 3. La lista cruza
 * los meses: el último domingo de octubre y el primero de noviembre también
 * van seguidos.
 *
 * Además, quien trabaja 3 o más domingos en el mes trabaja el domingo de forma
 * habitual (CST art. 179, parágrafo 1) y le corresponde descanso compensatorio:
 * se avisa, no se bloquea.
 */

export type DiaEspecial = {
  /** AAAA-MM-DD */
  fecha: string
  domingo: boolean
  festivo: boolean
}

/** Turnos por persona: colaboradorId → fechas (AAAA-MM-DD). */
export type TurnosPorPersona = Record<string, string[]>

/** Domingos y festivos de un mes ("2026-11"), en orden. */
export function diasEspecialesDelMes(mes: string, festivos: ReadonlySet<string>): DiaEspecial[] {
  const [a, m] = mes.split('-').map(Number)
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate()
  const dias: DiaEspecial[] = []
  for (let d = 1; d <= ultimo; d++) {
    const fecha = `${mes}-${String(d).padStart(2, '0')}`
    const domingo = new Date(Date.UTC(a, m - 1, d)).getUTCDay() === 0
    const festivo = festivos.has(fecha)
    if (domingo || festivo) dias.push({ fecha, domingo, festivo })
  }
  return dias
}

/** El mes anterior y el siguiente de "2026-11". */
export function mesesVecinos(mes: string): { anterior: string; siguiente: string } {
  const [a, m] = mes.split('-').map(Number)
  const ant = new Date(Date.UTC(a, m - 2, 1))
  const sig = new Date(Date.UTC(a, m, 1))
  const f = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`
  return { anterior: f(ant), siguiente: f(sig) }
}

export type Cruce = { colaboradorId: string; fechas: [string, string] }

/**
 * Personas que quedan en dos días especiales seguidos de `secuencia` (la lista
 * ordenada de domingos y festivos, incluido el último del mes anterior y el
 * primero del siguiente para mirar los bordes).
 */
export function crucesDeTurnos(turnos: TurnosPorPersona, secuencia: readonly string[]): Cruce[] {
  const cruces: Cruce[] = []
  for (const [colaboradorId, fechas] of Object.entries(turnos)) {
    const suyas = new Set(fechas)
    for (let i = 0; i + 1 < secuencia.length; i++) {
      if (suyas.has(secuencia[i]) && suyas.has(secuencia[i + 1])) cruces.push({ colaboradorId, fechas: [secuencia[i], secuencia[i + 1]] })
    }
  }
  return cruces
}

/** Cuántos DOMINGOS trabaja cada persona en el mes (los festivos no cuentan). */
export function domingosPorPersona(turnos: TurnosPorPersona, especiales: readonly DiaEspecial[]): Record<string, number> {
  const domingos = new Set(especiales.filter((d) => d.domingo).map((d) => d.fecha))
  return Object.fromEntries(Object.entries(turnos).map(([id, fechas]) => [id, fechas.filter((f) => domingos.has(f)).length]))
}

/** A partir de cuántos domingos en el mes el trabajo dominical es habitual (CST art. 179). */
export const DOMINGOS_HABITUAL = 3

/**
 * Propone un reparto: `porDia` personas en cada domingo/festivo del mes,
 * respetando la regla (nadie en dos seguidos, contando el último día del mes
 * anterior y el primero del siguiente) y repartiendo parejo: entra primero
 * quien lleva menos turnos, y entre iguales, quien menos domingos tiene.
 * Si un día no alcanza la gente, queda con menos y se dice cuántos faltan.
 */
export function sugerirReparto(opts: {
  especiales: readonly DiaEspecial[]
  personas: readonly string[]
  porDia: number
  /** Quienes trabajan el último domingo/festivo del mes anterior. */
  antes?: ReadonlySet<string>
  /** Quienes ya trabajan el primero del mes siguiente. */
  despues?: ReadonlySet<string>
}): { turnos: TurnosPorPersona; faltan: { fecha: string; faltan: number }[] } {
  const turnos: TurnosPorPersona = Object.fromEntries(opts.personas.map((p) => [p, []]))
  const domingos: Record<string, number> = Object.fromEntries(opts.personas.map((p) => [p, 0]))
  const faltan: { fecha: string; faltan: number }[] = []
  let anteriores = new Set(opts.antes ?? [])
  opts.especiales.forEach((dia, i) => {
    const esUltimo = i === opts.especiales.length - 1
    const candidatos = opts.personas
      .filter((p) => !anteriores.has(p) && !(esUltimo && opts.despues?.has(p)))
      .sort((x, y) => turnos[x].length - turnos[y].length || domingos[x] - domingos[y])
    const elegidos = candidatos.slice(0, Math.max(0, opts.porDia))
    for (const p of elegidos) {
      turnos[p].push(dia.fecha)
      if (dia.domingo) domingos[p]++
    }
    if (elegidos.length < opts.porDia) faltan.push({ fecha: dia.fecha, faltan: opts.porDia - elegidos.length })
    anteriores = new Set(elegidos)
  })
  return { turnos, faltan }
}
