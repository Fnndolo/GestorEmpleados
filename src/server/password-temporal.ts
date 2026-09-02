import 'server-only'
import { randomInt } from 'node:crypto'

/**
 * Palabras para las contraseñas temporales. Elegidas para que se puedan dictar
 * por teléfono o por WhatsApp sin deletrear: sin tildes ni eñes (que estorban
 * en el teclado del celular), sin letras que se confundan al leerlas en voz
 * alta y sin nada que quede mal en un correo de trabajo.
 *
 * El tamaño de la lista es lo que da la fuerza de la clave: al agregar o quitar
 * palabras, mantenerla por encima de las 200.
 */
const PALABRAS = [
  'gato', 'perro', 'lobo', 'zorro', 'tigre', 'oso', 'ciervo', 'conejo', 'ardilla', 'nutria',
  'foca', 'tortuga', 'rana', 'sapo', 'gaviota', 'paloma', 'cuervo', 'mirlo', 'loro', 'pato',
  'ganso', 'cisne', 'gallo', 'cabra', 'oveja', 'cerdo', 'caballo', 'potro', 'burro', 'toro',
  'vaca', 'venado', 'puma', 'jaguar', 'mono', 'koala', 'panda', 'lince', 'topo', 'erizo',
  'castor', 'camello', 'llama', 'alpaca', 'bisonte', 'alce', 'reno', 'morsa', 'pulpo', 'cangrejo',
  'roble', 'pino', 'cedro', 'olmo', 'sauce', 'abeto', 'palma', 'helecho', 'musgo', 'junco',
  'trigo', 'avena', 'arroz', 'cebada', 'lino', 'rosa', 'lirio', 'clavel', 'laurel', 'romero',
  'salvia', 'menta', 'tomillo', 'canela', 'comino', 'perejil', 'cilantro', 'jengibre', 'bosque', 'selva',
  'pradera', 'glaciar', 'cascada', 'arroyo', 'laguna', 'lago', 'monte', 'valle', 'cerro', 'playa',
  'duna', 'isla', 'costa', 'golfo', 'puerto', 'faro', 'muelle', 'nube', 'lluvia', 'niebla',
  'viento', 'brisa', 'trueno', 'rayo', 'granizo', 'nieve', 'escarcha', 'aurora', 'estrella', 'luna',
  'cometa', 'planeta', 'galaxia', 'eclipse', 'rojo', 'verde', 'azul', 'morado', 'violeta', 'turquesa',
  'esmeralda', 'marfil', 'coral', 'escarlata', 'ocre', 'sepia', 'dorado', 'bronce', 'gris', 'piedra',
  'roca', 'arena', 'barro', 'arcilla', 'granito', 'cuarzo', 'jade', 'topacio', 'zafiro', 'diamante',
  'perla', 'hierro', 'acero', 'cobre', 'platino', 'plata', 'libro', 'papel', 'tinta', 'sello',
  'mapa', 'reloj', 'llave', 'puerta', 'ventana', 'escalera', 'puente', 'torre', 'muro', 'tejado',
  'ladrillo', 'martillo', 'clavo', 'tornillo', 'cuerda', 'nudo', 'ancla', 'vela', 'remo', 'barco',
  'canoa', 'balsa', 'linterna', 'farol', 'jarra', 'plato', 'taza', 'cuchara', 'tenedor', 'olla',
  'horno', 'mesa', 'silla', 'banco', 'cesta', 'canasta', 'bolsa', 'maleta', 'cofre', 'caja',
  'marco', 'espejo', 'cuadro', 'lienzo', 'pincel', 'cincel', 'yunque', 'piano', 'guitarra', 'flauta',
  'tambor', 'arpa', 'trompeta', 'marimba', 'maraca', 'queso', 'miel', 'aceite', 'vinagre', 'harina',
  'masa', 'sopa', 'caldo', 'guiso', 'asado', 'tarta', 'torta', 'galleta', 'higo', 'uva',
  'pera', 'mango', 'fresa', 'mora', 'cereza', 'ciruela', 'durazno', 'naranja', 'papaya', 'guayaba',
] as const

/**
 * Contraseña temporal legible: dos palabras distintas y cuatro dígitos, todo en
 * minúsculas y separado por guiones (`roble-marfil-4728`).
 *
 * La plataforma solo exige 8 caracteres, así que no hace falta mezclar
 * mayúsculas ni símbolos. Sin ellos la clave se puede dictar por teléfono sin
 * equivocaciones y se teclea de una en un celular, que es como le llega de
 * verdad a quien trabaja en bodega o en punto de venta.
 *
 * Es de un solo uso: al entrar, el sistema obliga a cambiarla.
 */
export function passwordTemporal(): string {
  const primera = PALABRAS[randomInt(PALABRAS.length)]
  let segunda = PALABRAS[randomInt(PALABRAS.length)]
  // Dos palabras iguales se leen como un error de la plataforma, no como azar.
  while (segunda === primera) segunda = PALABRAS[randomInt(PALABRAS.length)]
  // randomInt(1000, 10000) nunca devuelve menos de cuatro dígitos.
  return `${primera}-${segunda}-${randomInt(1000, 10000)}`
}
