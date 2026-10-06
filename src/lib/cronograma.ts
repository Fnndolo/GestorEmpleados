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
/** Fisher-Yates: una copia en orden al azar. */
function barajar<T>(lista: readonly T[], azar: () => number): T[] {
  const r = [...lista]
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1));
    [r[i], r[j]] = [r[j], r[i]]
  }
  return r
}

export function sugerirReparto(opts: {
  especiales: readonly DiaEspecial[]
  personas: readonly string[]
  porDia: number
  /** Quienes trabajan el último domingo/festivo del mes anterior. */
  antes?: ReadonlySet<string>
  /** Quienes ya trabajan el primero del mes siguiente. */
  despues?: ReadonlySet<string>
  /** Número al azar en [0, 1). Se puede fijar en las pruebas para repetir el reparto. */
  azar?: () => number
}): { turnos: TurnosPorPersona; faltan: { fecha: string; faltan: number }[] } {
  const turnos: TurnosPorPersona = Object.fromEntries(opts.personas.map((p) => [p, []]))
  const domingos: Record<string, number> = Object.fromEntries(opts.personas.map((p) => [p, 0]))
  const faltan: { fecha: string; faltan: number }[] = []
  let anteriores = new Set(opts.antes ?? [])
  const azar = opts.azar ?? Math.random
  // Cuántas veces ha trabajado cada pareja el mismo día en este reparto.
  const juntos = new Map<string, number>()
  const par = (p: string, q: string) => (p < q ? `${p}|${q}` : `${q}|${p}`)
  opts.especiales.forEach((dia, i) => {
    const esUltimo = i === opts.especiales.length - 1
    // Se elige de a uno. Manda quien lleva menos turnos (reparto parejo); entre
    // esos, quien menos ha coincidido con los ya elegidos ese día (que no
    // trabajen siempre las mismas juntas); luego menos domingos, y el empate lo
    // decide el azar (barajado antes), así cada sugerencia sale distinta.
    const libres = barajar(opts.personas.filter((p) => !anteriores.has(p) && !(esUltimo && opts.despues?.has(p))), azar)
    const elegidos: string[] = []
    const coincidencias = (p: string) => elegidos.reduce((n, q) => n + (juntos.get(par(p, q)) ?? 0), 0)
    while (elegidos.length < Math.max(0, opts.porDia) && libres.length) {
      libres.sort((x, y) => turnos[x].length - turnos[y].length || coincidencias(x) - coincidencias(y) || domingos[x] - domingos[y])
      elegidos.push(libres.shift()!)
    }
    for (let a = 0; a < elegidos.length; a++) for (let b = a + 1; b < elegidos.length; b++) {
      juntos.set(par(elegidos[a], elegidos[b]), (juntos.get(par(elegidos[a], elegidos[b])) ?? 0) + 1)
    }
    for (const p of elegidos) {
      turnos[p].push(dia.fecha)
      if (dia.domingo) domingos[p]++
    }
    if (elegidos.length < opts.porDia) faltan.push({ fecha: dia.fecha, faltan: opts.porDia - elegidos.length })
    anteriores = new Set(elegidos)
  })
  return { turnos, faltan }
}
