import 'dotenv/config'

/**
 * Salvaguarda de las pruebas de integración: escriben y borran datos, así que
 * se niegan a correr contra cualquier base que no sea la local. Un despiste con
 * la variable de entorno no puede costar la base de producción.
 */
const url = process.env.DATABASE_URL ?? ''
if (!/localhost|127\.0\.0\.1/.test(url)) {
  throw new Error(
    `Las pruebas de integración solo corren contra la base local. DATABASE_URL apunta a: ${url.replace(/:[^:@]*@/, ':****@')}`,
  )
}
