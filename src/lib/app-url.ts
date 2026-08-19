/**
 * Dirección pública de la aplicación, en un solo lugar.
 *
 * Antes estaba copiada a mano en seis archivos, cada uno con su propio dominio
 * de respaldo: cambiar de dominio obligaba a acertar en los seis, y si faltaba
 * la variable en producción la app seguía enviando correos —callada— con un
 * dominio quemado en el código.
 *
 * Los enlaces de los correos son la única forma en que la gente entra a la
 * plataforma, así que aquí se prefiere fallar de frente antes que enviar una
 * dirección equivocada que nadie va a poder abrir.
 */

const RESPALDO_DEV = 'http://localhost:3000'

/** Base sin barra final, para poder concatenar rutas sin dobles barras. */
function base(): string {
  const bruto = process.env.NEXT_PUBLIC_APP_URL?.trim()
  const enProduccion = process.env.NODE_ENV === 'production'

  if (!bruto) {
    if (enProduccion) {
      throw new Error(
        'Falta NEXT_PUBLIC_APP_URL. Configúrala con el dominio público de la plataforma ' +
        '(p. ej. https://tudominio.com): sin ella los correos saldrían con enlaces inservibles.',
      )
    }
    return RESPALDO_DEV
  }

  // En producción, un localhost heredado del .env local manda a cada persona a
  // su propio computador. Es un error de despliegue, no un caso a tolerar.
  if (enProduccion && /^https?:\/\/(localhost|127\.0\.0\.1)/i.test(bruto)) {
    throw new Error(
      `NEXT_PUBLIC_APP_URL apunta a ${bruto} en producción. Debe ser el dominio público de la plataforma.`,
    )
  }

  return bruto.replace(/\/+$/, '')
}

/**
 * URL absoluta de una ruta de la app. `urlApp('/login')` y `urlApp('login')`
 * dan lo mismo; sin ruta, devuelve la base.
 */
export function urlApp(ruta = ''): string {
  if (!ruta) return base()
  return `${base()}/${ruta.replace(/^\/+/, '')}`
}
