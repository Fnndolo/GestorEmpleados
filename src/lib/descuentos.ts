/** «octubre de 2026»: el mes en que empieza un descuento de nómina (se guarda como el día 1). */
export function mesLargo(fecha: Date): string {
  return fecha.toLocaleDateString('es-CO', { month: 'long', year: 'numeric', timeZone: 'UTC' })
}

