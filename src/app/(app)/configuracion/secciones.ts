import {
  Building2, Users, ShieldCheck, MapPin, Bell, BellRing, FileStack, Layers,
  Receipt, Briefcase, Coins, Landmark, Network, FileImage, FileSignature, type LucideIcon,
} from 'lucide-react'

/**
 * Catálogo de secciones de Configuración, agrupadas como se navegan.
 *
 * Vive aparte (y no en el layout) porque lleva íconos —componentes— y un
 * componente server no puede pasárselos a uno cliente: el riel importa esta
 * config directamente y el servidor solo le manda datos serializables.
 */

export type SeccionConfig = {
  titulo: string
  desc: string
  href: string
  icono: LucideIcon
  /** Permiso que hace falta para verla. */
  modulo: 'configuracion' | 'usuarios'
  /** Clave del contador que se muestra a la derecha, si aplica. */
  contador?: ContadorClave
}

export type ContadorClave =
  | 'sedes' | 'areas' | 'cargos' | 'usuarios' | 'roles'
  | 'tiposDocumento' | 'reglasAlerta' | 'parametrosNomina' | 'conceptosNomina' | 'plantillasCuentaCobro'
  | 'plantillasContrato'

export type Contadores = Record<ContadorClave, number>

export const GRUPOS: { titulo: string; secciones: SeccionConfig[] }[] = [
  {
    titulo: 'Mi empresa',
    secciones: [
      { titulo: 'Empresa', desc: 'Razón social, NIT, representante legal y parámetros generales.', href: '/configuracion/empresa', icono: Building2, modulo: 'configuracion' },
      { titulo: 'Sedes y ciudades', desc: 'Dónde opera la empresa. Cada colaborador, activo y documento pertenece a una sede.', href: '/configuracion/sedes', icono: MapPin, modulo: 'configuracion', contador: 'sedes' },
      { titulo: 'Áreas', desc: 'Estructura organizativa. Los cargos se crean dentro de un área, así que estas van primero.', href: '/configuracion/areas', icono: Network, modulo: 'configuracion', contador: 'areas' },
      { titulo: 'Cargos', desc: 'Funciones para el contrato, clase de riesgo ARL y rol con que se crea el usuario.', href: '/configuracion/cargos', icono: Briefcase, modulo: 'configuracion', contador: 'cargos' },
    ],
  },
  {
    titulo: 'Personas y acceso',
    secciones: [
      { titulo: 'Usuarios', desc: 'Quién entra a la plataforma, con qué rol y a qué sedes.', href: '/configuracion/usuarios', icono: Users, modulo: 'usuarios', contador: 'usuarios' },
      { titulo: 'Roles y permisos', desc: 'Qué puede ver y hacer cada rol en cada módulo, y hasta dónde alcanza.', href: '/configuracion/roles', icono: ShieldCheck, modulo: 'usuarios', contador: 'roles' },
    ],
  },
  {
    titulo: 'Nómina',
    secciones: [
      { titulo: 'Parámetros', desc: 'Salario mínimo y auxilio de transporte vigentes.', href: '/configuracion/parametros-nomina', icono: Coins, modulo: 'configuracion', contador: 'parametrosNomina' },
      { titulo: 'Conceptos', desc: 'Devengados y deducciones propios, según si constituyen salario.', href: '/configuracion/conceptos-nomina', icono: Coins, modulo: 'configuracion', contador: 'conceptosNomina' },
      { titulo: 'Entidades y bancos', desc: 'EPS, ARL, pensiones, cesantías, cajas y bancos de la ficha del colaborador.', href: '/configuracion/entidades', icono: Landmark, modulo: 'configuracion' },
    ],
  },
  {
    titulo: 'Documentos y avisos',
    secciones: [
      { titulo: 'Tipos de documento', desc: 'El catálogo del expediente y cuáles son obligatorios por vínculo.', href: '/configuracion/tipos-documento', icono: FileStack, modulo: 'configuracion', contador: 'tiposDocumento' },
      { titulo: 'Reglas de alerta', desc: 'Con cuánta anticipación avisa cada tipo de vencimiento.', href: '/configuracion/alertas', icono: Bell, modulo: 'configuracion', contador: 'reglasAlerta' },
      { titulo: 'Notificaciones', desc: 'Qué eventos muestran un aviso emergente además de la campana y el correo.', href: '/configuracion/notificaciones', icono: BellRing, modulo: 'configuracion' },
    ],
  },
  {
    titulo: 'Avanzado',
    secciones: [
      // Una sola entrada: adentro, las pestañas separan papel membretado,
      // contratos y cuentas de cobro. Antes eran tres secciones repartidas en
      // tres grupos, dos de ellas llamadas "Plantillas", y nadie sabía dónde
      // buscar. El contador avisa si no hay ninguna plantilla de contrato
      // activa, que es lo que impide generar contratos.
      { titulo: 'Plantillas de documentos', desc: 'Papel membretado, texto de los contratos y de las cuentas de cobro.', href: '/configuracion/plantillas', icono: FileSignature, modulo: 'configuracion', contador: 'plantillasContrato' },
      { titulo: 'Módulos propios', desc: 'Pestañas a la medida, con campos propios, para lo que no cubre la plataforma.', href: '/configuracion/modulos', icono: Layers, modulo: 'configuracion' },
    ],
  },
]

/**
 * Catálogos que la plataforma NO puede operar vacíos: mientras estén en cero se
 * marcan en el menú, porque su falta rompe algo aguas abajo (la nómina no
 * liquida, los contratistas no radican, nada avisa a tiempo).
 */
// `plantillasContrato` entra aquí: sin una plantilla activa no se puede generar
// ningún contrato desde el sistema, que es justo el caso de producción hoy.
const IMPRESCINDIBLES: ContadorClave[] = ['parametrosNomina', 'reglasAlerta', 'tiposDocumento', 'plantillasCuentaCobro', 'plantillasContrato']

export function estaVacio(clave: ContadorClave | undefined, contadores: Contadores): boolean {
  if (!clave) return false
  return IMPRESCINDIBLES.includes(clave) && contadores[clave] === 0
}
