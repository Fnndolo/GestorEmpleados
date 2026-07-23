import 'dotenv/config'
import { prisma } from '../src/lib/db'
import type { FuncionesCargo } from '../src/lib/contrato-variables'

/**
 * Funciones genéricas por cargo (para probar el sistema de contratos).
 * Se asignan a los cargos existentes que coincidan por nombre y que aún no
 * tengan funciones. Editar/ajustar luego en Configuración → Cargos.
 */
const FUNCIONES: Record<string, FuncionesCargo> = {
  'Asesor Comercial': [
    {
      grupo: 'I. Funciones principales',
      items: [
        'Atender y asesorar a los clientes sobre el portafolio de productos, resolviendo dudas técnicas y comerciales.',
        'Cumplir las metas de venta individuales asignadas para el periodo.',
        'Gestionar el proceso de venta de principio a fin: cotización, cierre, facturación y entrega.',
      ],
    },
    {
      grupo: 'II. Gestión comercial',
      items: [
        'Prospectar nuevos clientes y hacer seguimiento a oportunidades de negocio.',
        'Registrar todas las interacciones y ventas en los sistemas designados por la empresa.',
        'Manejar objeciones y ofrecer alternativas de financiación cuando aplique.',
      ],
    },
    {
      grupo: 'III. Funciones administrativas y de cumplimiento',
      items: [
        'Custodiar el dinero, los productos y los equipos entregados para el desarrollo de su labor.',
        'Manejar con confidencialidad los datos personales de los clientes conforme a la Ley 1581 de 2012.',
        'Reportar oportunamente sus indicadores de gestión al líder comercial.',
      ],
    },
  ],
  'Líder Comercial': [
    {
      grupo: 'I. Funciones principales',
      items: [
        'Planear, dirigir y controlar el cumplimiento de las metas comerciales del equipo a cargo.',
        'Acompañar, capacitar y evaluar el desempeño de los asesores comerciales.',
        'Definir estrategias de venta y de fidelización de clientes por zona o línea de producto.',
      ],
    },
    {
      grupo: 'II. Gestión del equipo',
      items: [
        'Distribuir metas y territorios, y hacer seguimiento diario a los indicadores de conversión.',
        'Resolver escalamientos de clientes y autorizar condiciones especiales dentro de su alcance.',
        'Consolidar y presentar los reportes de ventas del equipo a la gerencia.',
      ],
    },
    {
      grupo: 'III. Funciones administrativas y de cumplimiento',
      items: [
        'Velar por el buen uso de los recursos, equipos e inventarios asignados al equipo.',
        'Asegurar el cumplimiento de las políticas de tratamiento de datos y prevención de fraude.',
      ],
    },
  ],
  'Auxiliar Contable': [
    {
      grupo: 'I. Funciones principales',
      items: [
        'Registrar y clasificar los documentos contables (facturas, comprobantes, recibos) en el sistema.',
        'Realizar conciliaciones bancarias y de cuentas por cobrar y por pagar.',
        'Apoyar la elaboración de informes financieros y tributarios.',
      ],
    },
    {
      grupo: 'II. Funciones de apoyo',
      items: [
        'Archivar y custodiar los soportes contables físicos y digitales.',
        'Apoyar la liquidación y presentación de impuestos y de la nómina.',
        'Verificar la correcta causación de gastos e ingresos.',
      ],
    },
    {
      grupo: 'III. Cumplimiento',
      items: [
        'Guardar estricta reserva sobre la información financiera de la empresa.',
        'Cumplir las políticas de prevención de lavado de activos y financiación del terrorismo.',
      ],
    },
  ],
  Contador: [
    {
      grupo: 'I. Funciones principales',
      items: [
        'Preparar, firmar y presentar los estados financieros conforme a las normas vigentes (NIIF).',
        'Liquidar y presentar las obligaciones tributarias nacionales y municipales.',
        'Garantizar la razonabilidad de la información contable y financiera.',
      ],
    },
    {
      grupo: 'II. Control y análisis',
      items: [
        'Supervisar el proceso contable y el trabajo del área contable.',
        'Analizar la información financiera y presentar recomendaciones a la gerencia.',
        'Atender requerimientos de entes de control y revisoría fiscal.',
      ],
    },
    {
      grupo: 'III. Cumplimiento',
      items: [
        'Cumplir el Código de Ética del contador público y guardar reserva profesional.',
        'Velar por el cumplimiento de las políticas de prevención de lavado de activos.',
      ],
    },
  ],
  'Auxiliar de Bodega': [
    {
      grupo: 'I. Funciones principales',
      items: [
        'Recibir, verificar y almacenar la mercancía según los procedimientos de la empresa.',
        'Alistar, empacar y despachar los pedidos garantizando exactitud y buen estado.',
        'Mantener actualizado el inventario físico y en el sistema.',
      ],
    },
    {
      grupo: 'II. Orden y control',
      items: [
        'Realizar conteos periódicos y reportar diferencias de inventario.',
        'Mantener la bodega ordenada, limpia y señalizada.',
        'Reportar averías, faltantes o novedades de la mercancía.',
      ],
    },
    {
      grupo: 'III. Seguridad y cumplimiento',
      items: [
        'Usar los elementos de protección personal y cumplir las normas de seguridad y salud en el trabajo.',
        'Custodiar los bienes y equipos entregados para su labor.',
      ],
    },
  ],
  'Auxiliar de Talento Humano': [
    {
      grupo: 'I. Funciones principales',
      items: [
        'Apoyar los procesos de selección, contratación y afiliación a seguridad social.',
        'Mantener actualizadas las hojas de vida y los expedientes del personal.',
        'Apoyar la liquidación de nómina, novedades, incapacidades y permisos.',
      ],
    },
    {
      grupo: 'II. Funciones de apoyo',
      items: [
        'Gestionar la documentación de ingresos y retiros del personal.',
        'Apoyar la programación de capacitaciones y actividades de bienestar.',
        'Atender las solicitudes y certificaciones de los colaboradores.',
      ],
    },
    {
      grupo: 'III. Cumplimiento',
      items: [
        'Manejar con confidencialidad los datos personales y de salud del personal (Ley 1581 de 2012).',
        'Apoyar el cumplimiento de las obligaciones del SG-SST.',
      ],
    },
  ],
  'Coordinador de Talento Humano': [
    {
      grupo: 'I. Funciones principales',
      items: [
        'Planear y coordinar los procesos de selección, contratación, formación y desarrollo del personal.',
        'Supervisar la liquidación de nómina y el cumplimiento de las obligaciones laborales.',
        'Liderar la implementación de las políticas de talento humano y clima organizacional.',
      ],
    },
    {
      grupo: 'II. Gestión del área',
      items: [
        'Coordinar el equipo de talento humano y hacer seguimiento a sus indicadores.',
        'Gestionar los procesos disciplinarios conforme al reglamento interno de trabajo.',
        'Asegurar la ejecución del plan de capacitación y bienestar.',
      ],
    },
    {
      grupo: 'III. Cumplimiento',
      items: [
        'Velar por el cumplimiento de la normativa laboral, de seguridad social y del SG-SST.',
        'Garantizar el tratamiento confidencial de los datos del personal.',
      ],
    },
  ],
  'Técnico de Reparación': [
    {
      grupo: 'I. Funciones principales',
      items: [
        'Diagnosticar, reparar y probar los equipos y dispositivos electrónicos recibidos.',
        'Registrar el estado de ingreso, el diagnóstico y las reparaciones realizadas.',
        'Cumplir los tiempos de respuesta y los estándares de calidad de la reparación.',
      ],
    },
    {
      grupo: 'II. Funciones de apoyo',
      items: [
        'Solicitar y controlar el uso de repuestos e insumos.',
        'Informar al cliente sobre el estado y las recomendaciones de su equipo.',
        'Mantener limpio, ordenado y seguro el puesto de trabajo.',
      ],
    },
    {
      grupo: 'III. Seguridad y cumplimiento',
      items: [
        'Usar los elementos de protección personal y cumplir las normas de seguridad y salud en el trabajo.',
        'Custodiar los equipos de los clientes y las herramientas asignadas.',
      ],
    },
  ],
  'Gerente General': [
    {
      grupo: 'I. Funciones principales',
      items: [
        'Definir y dirigir la estrategia, los objetivos y el presupuesto de la empresa.',
        'Representar legal y comercialmente a la organización ante terceros.',
        'Tomar las decisiones de alto nivel y velar por la sostenibilidad del negocio.',
      ],
    },
    {
      grupo: 'II. Dirección y control',
      items: [
        'Supervisar el desempeño de las áreas y de los líderes a cargo.',
        'Aprobar políticas, inversiones y contrataciones relevantes.',
        'Asegurar el cumplimiento legal, tributario y regulatorio de la empresa.',
      ],
    },
  ],
  Subgerente: [
    {
      grupo: 'I. Funciones principales',
      items: [
        'Apoyar a la gerencia en la planeación, ejecución y control de la operación.',
        'Coordinar y supervisar las áreas asignadas para el cumplimiento de las metas.',
        'Reemplazar a la gerencia en su ausencia dentro de las facultades delegadas.',
      ],
    },
    {
      grupo: 'II. Dirección y control',
      items: [
        'Hacer seguimiento a los indicadores operativos y comerciales.',
        'Proponer mejoras en los procesos y en el uso de los recursos.',
        'Velar por el cumplimiento de las políticas y procedimientos internos.',
      ],
    },
  ],
}

async function main() {
  const cargos = await prisma.cargo.findMany()
  let asignados = 0
  for (const c of cargos) {
    const fn = FUNCIONES[c.nombre]
    if (!fn) continue
    if (c.funcionesContrato) {
      console.log(`· "${c.nombre}" ya tenía funciones; no se sobrescribe.`)
      continue
    }
    await prisma.cargo.update({ where: { id: c.id }, data: { funcionesContrato: fn } })
    asignados++
    console.log(`✓ "${c.nombre}" → ${fn.length} grupos.`)
  }
  console.log(`\nListo. Funciones asignadas a ${asignados} cargo(s).`)
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
