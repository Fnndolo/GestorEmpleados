import 'dotenv/config'
import { prisma } from '../src/lib/db'

/**
 * Seed de la plantilla de contrato OPS (prestación de servicios), basada en el
 * contrato real de KUPOCELL. El texto legal es editable después desde la app.
 * Variables: {{...}} se reemplazan con datos de empresa / contratista / contrato.
 * La cláusula con esFunciones=true inserta las funciones del cargo seleccionado.
 */

const INTRO =
  'En la ciudad de {{ciudad}}, el día {{fecha_suscripcion_larga}}, entre los suscritos, por una parte: ' +
  '{{empresa_razon_social}} y su marca comercial {{empresa_marca}}, en calidad de CONTRATANTE, representada ' +
  'legalmente por {{representante_legal}}, mayor de edad, identificado con cédula de ciudadanía No. {{representante_legal_cc}}, ' +
  'y por la otra, {{contratista_nombre}}, mayor de edad, identificado con cédula de ciudadanía No. {{contratista_cc}} ' +
  'de {{contratista_cc_lugar}}, obrando en nombre propio, quien en adelante se denominará EL CONTRATISTA. ' +
  'Ambas partes manifiestan tener la capacidad legal para contratar y acuerdan celebrar el presente Contrato de ' +
  'Prestación de Servicios Personales, regido por las cláusulas que a continuación se enuncian y por las disposiciones ' +
  'legales civiles aplicables.'

const CIERRE =
  'Para constancia de lo anterior, y en señal de haber LEÍDO, ENTENDIDO y APROBADO en su totalidad el contenido y ' +
  'el alcance de las obligaciones aquí pactadas, las partes suscriben el presente contrato de manera libre y ' +
  'voluntaria, en la ciudad de {{ciudad}}, el día {{fecha_suscripcion_larga}}.'

const CLAUSULAS: { titulo: string; cuerpo: string; esFunciones?: boolean }[] = [
  {
    titulo: 'PRIMERA. – OBJETO:',
    cuerpo:
      'EL CONTRATISTA, por cuenta propia y bajo su exclusiva responsabilidad, asume el encargo de {{cargo_objeto}}, ' +
      'ejecutando actividades comerciales autónomas de prestación de servicios personales para {{empresa_razon_social}} y ' +
      'su marca comercial {{empresa_marca}}.\n' +
      'Dichas actividades se desarrollarán con plena autonomía técnica, financiera, administrativa y organizativa, sin ' +
      'subordinación jurídica, sin vínculo laboral ni dependencia económica exclusiva frente a {{empresa_razon_social}}.',
  },
  {
    titulo: 'SEGUNDA. – VIGENCIA Y EXTENSIÓN DEL ENCARGO CONTRACTUAL:',
    cuerpo:
      'El presente contrato tendrá una vigencia determinada de {{plazo_letras}}, contados a partir del {{fecha_inicio_larga}}, ' +
      'y finalizará el día {{fecha_fin_larga}}, sin que se requiera comunicación adicional.\n' +
      'Este contrato no se prorrogará automáticamente. Cualquier extensión requerirá acuerdo expreso, previo y escrito, ' +
      'mediante otrosí celebrado antes de la expiración del término pactado.',
  },
  {
    titulo: 'TERCERA. - HONORARIOS:',
    cuerpo:
      'El valor total del presente contrato asciende a {{valor_total_mcte_letras}}, que {{empresa_razon_social}} reconocerá a ' +
      'EL CONTRATISTA en calidad de honorarios profesionales. Dicho valor será causado mensualmente en montos equivalentes a ' +
      '{{honorario_mensual_letras}}, durante la vigencia del contrato.\n' +
      'Las partes declaran que estos honorarios no constituyen salario ni dan lugar a prestaciones sociales, afiliaciones a ' +
      'riesgos laborales, subsidios, horas extras ni concepto alguno derivado de una relación laboral o de subordinación.',
  },
  {
    titulo: 'CUARTA. – FORMA DE PAGO:',
    cuerpo:
      'Cada desembolso estará condicionado a la evaluación objetiva de los resultados entregados por EL CONTRATISTA, sin que ' +
      'ello implique subordinación ni dependencia técnica directa. Los desembolsos se realizarán mediante transferencia ' +
      'electrónica a la cuenta que EL CONTRATISTA indique y certifique mediante anexo a este contrato. Para el pago, ' +
      '{{empresa_razon_social}} verificará el cumplimiento de las actividades y el certificado de pago de seguridad social.',
  },
  {
    titulo: 'QUINTA. – ENTORNO OPERATIVO DE EJECUCIÓN CONTRACTUAL:',
    cuerpo:
      'Las actividades objeto del presente contrato serán desarrolladas por EL CONTRATISTA principalmente en las ' +
      'instalaciones del establecimiento de comercio de {{empresa_marca}}, ubicado en la ciudad de {{ciudad}}, o en cualquier ' +
      'otro lugar que las partes acuerden, sin que ello implique relación de subordinación ni vínculo laboral.',
  },
  {
    titulo: 'SEXTA. - FRANJA HORARIA FUNCIONAL PARA LA PRESTACIÓN DEL SERVICIO:',
    cuerpo:
      'Las actividades serán ejecutadas por EL CONTRATISTA con plena autonomía técnica y organizativa, sin sujeción a jornada ' +
      'laboral ni régimen de subordinación. No obstante, para efectos operativos, las gestiones se desarrollarán ' +
      'preferentemente dentro de la franja horaria de las 8:00 a.m. a 6:00 p.m., de lunes a domingo, sin que ello implique ' +
      'control horario, subordinación ni derecho a prestaciones del régimen laboral.',
  },
  {
    titulo: 'SÉPTIMA. - FUNCIONES:',
    cuerpo:
      'EL CONTRATISTA, en su calidad de {{cargo_objeto}}, se obliga a ejecutar las siguientes funciones específicas con ' +
      'independencia técnica, administrativa y organizativa:',
    esFunciones: true,
  },
  {
    titulo: 'OCTAVA. - OBLIGACIONES:',
    cuerpo:
      'EL CONTRATISTA se compromete a: ejecutar profesional y autónomamente las actividades de promoción y venta de los ' +
      'productos de {{empresa_marca}}; mantener indemne a {{empresa_marca}} frente a daños derivados de sus actos; velar por el ' +
      'uso adecuado de los equipos y herramientas suministrados; manejar con estricta confidencialidad la información de ' +
      'clientes conforme a la Ley 1581 de 2012; y cumplir las políticas de prevención de lavado de activos y financiación del ' +
      'terrorismo.',
  },
  {
    titulo: 'NOVENA - AFILIACIÓN Y PAGO A SEGURIDAD SOCIAL:',
    cuerpo:
      'EL CONTRATISTA se obliga a afiliarse y mantener actualizadas sus cotizaciones al sistema de seguridad social en salud y ' +
      'pensiones (art. 15, num. 2, Ley 100 de 1993), y a presentar a {{empresa_razon_social}} el certificado correspondiente ' +
      'dentro de los ocho (8) días siguientes al inicio. El incumplimiento faculta a {{empresa_razon_social}} para dar por ' +
      'terminado el contrato de manera inmediata, sin indemnización.',
  },
  {
    titulo: 'DÉCIMA - OBLIGACIONES DEL CONTRATANTE:',
    cuerpo:
      '{{empresa_razon_social}} se compromete a: facilitar oportunamente la información, herramientas y recursos necesarios; ' +
      'exigir la ejecución conforme a los estándares de calidad, respetando la autonomía del CONTRATISTA; y realizar ' +
      'seguimiento del cumplimiento sin que ello implique subordinación o control laboral.',
  },
  {
    titulo: 'DÉCIMA PRIMERA - CONFIDENCIALIDAD:',
    cuerpo:
      'EL CONTRATISTA guardará estricta reserva sobre la Información Confidencial de {{empresa_razon_social}}, absteniéndose de ' +
      'divulgarla o usarla para fines distintos a este contrato, adoptando las medidas necesarias para protegerla. Estas ' +
      'obligaciones subsistirán por dos (2) años contados a partir de la terminación del contrato.',
  },
  {
    titulo: 'DÉCIMA SEGUNDA - CLÁUSULA PENAL:',
    cuerpo:
      'En caso de incumplimiento de las obligaciones de confidencialidad o de cualquiera de las demás obligaciones, LA ' +
      'CONTRATISTA pagará a {{empresa_razon_social}}, a título de cláusula penal, una suma equivalente a dos (2) salarios ' +
      'mínimos legales mensuales vigentes, sin perjuicio de la reparación integral de perjuicios.',
  },
  {
    titulo: 'DÉCIMA TERCERA - RÉGIMEN DE EXCLUSIVIDAD:',
    cuerpo:
      'EL CONTRATISTA se obliga a no promover, vender ni asesorar productos o servicios que compitan con los de ' +
      '{{empresa_razon_social}} dentro del territorio nacional durante la vigencia del contrato. La asignación de zona o línea ' +
      'no confiere exclusividad a EL CONTRATISTA. El incumplimiento será causal de terminación unilateral.',
  },
  {
    titulo: 'DÉCIMA CUARTA - SEGUIMIENTO Y COORDINACIÓN:',
    cuerpo:
      '{{empresa_razon_social}}, a través de su representante designado, ejercerá funciones periódicas y razonables de ' +
      'seguimiento sobre la ejecución de las actividades, respetando la autonomía técnica y financiera del CONTRATISTA.',
  },
  {
    titulo: 'DÉCIMA QUINTA - INDEPENDENCIA Y AUSENCIA DE VÍNCULO LABORAL:',
    cuerpo:
      'EL CONTRATISTA desarrollará sus actividades con total autonomía técnica, administrativa y financiera, sin que exista ' +
      'relación laboral, subordinación o dependencia con {{empresa_razon_social}}. El vínculo entre las partes es civil y ' +
      'contractual.',
  },
  {
    titulo: 'DÉCIMA SEXTA - PROHIBICIÓN DE CESIÓN:',
    cuerpo:
      'EL CONTRATISTA no podrá ceder, transferir ni subcontratar, total o parcialmente, las obligaciones de este contrato sin ' +
      'autorización previa, expresa y escrita de {{empresa_razon_social}}.',
  },
  {
    titulo: 'DÉCIMA SÉPTIMA - MODIFICACIONES CONTRACTUALES:',
    cuerpo:
      'Cualquier modificación deberá formalizarse por escrito mediante otrosí suscrito por {{empresa_razon_social}} y LA ' +
      'CONTRATISTA. No tendrán validez las modificaciones verbales.',
  },
  {
    titulo: 'DÉCIMA OCTAVA - TERMINACIÓN ANTICIPADA:',
    cuerpo:
      'El contrato podrá darse por terminado por mutuo acuerdo; por incumplimiento grave (previa notificación con cinco (5) ' +
      'días hábiles de antelación); por fuerza mayor o caso fortuito; o por decisión unilateral de {{empresa_razon_social}} por ' +
      'motivos comerciales u operativos, notificando con cinco (5) días hábiles de antelación. La liquidación comprenderá los ' +
      'honorarios causados y no pagados.',
  },
  {
    titulo: 'DÉCIMA NOVENA - GARANTÍAS Y SOPORTE DOCUMENTAL:',
    cuerpo:
      'EL CONTRATISTA declara contar con las facultades legales, técnicas y administrativas para ejecutar el objeto ' +
      'contractual, y se obliga a presentar la documentación soporte requerida (certificaciones, reportes, facturas, pago de ' +
      'seguridad social) dentro de los plazos establecidos.',
  },
  {
    titulo: 'VIGÉSIMA - RESPONSABILIDAD PATRIMONIAL:',
    cuerpo:
      'EL CONTRATISTA será civilmente responsable por los perjuicios derivados de errores u omisiones atribuibles a su ' +
      'negligencia. En caso de pérdida o entrega errada de productos, autoriza a {{empresa_razon_social}} a compensar el valor ' +
      'mediante descuentos proporcionales sobre los honorarios, sin exceder el 50% del valor neto mensual.',
  },
  {
    titulo: 'VIGÉSIMA PRIMERA – DECLARACIONES DEL CONTRATISTA:',
    cuerpo:
      'EL CONTRATISTA declara: haber revisado los documentos del proceso contractual; contar con capacidad legal y técnica; no ' +
      'estar incurso en inhabilidades; estar a paz y salvo en seguridad social; y asumir la responsabilidad por sus ' +
      'obligaciones fiscales y tributarias, exonerando a {{empresa_razon_social}}.',
  },
  {
    titulo: 'VIGÉSIMA SEGUNDA - DENOMINACIÓN:',
    cuerpo:
      'La razón social oficial es {{empresa_razon_social}}, manteniéndose el uso comercial de la marca {{empresa_marca}} en ' +
      'todas las actividades comerciales, publicitarias y de mercado.',
  },
  {
    titulo: 'VIGÉSIMA TERCERA - INTEGRIDAD DEL CONTRATO:',
    cuerpo:
      'El presente contrato reemplaza cualquier otro acuerdo verbal o escrito anterior entre las partes. Las modificaciones ' +
      'deberán constar por escrito y anexarse para surtir efectos legales.',
  },
  {
    titulo: 'VIGÉSIMA CUARTA – NOTIFICACIONES Y DOMICILIOS:',
    cuerpo:
      'Para todos los efectos, las partes podrán usar medios físicos y electrónicos (Ley 527 de 1999, Decreto 806 de 2020, Ley ' +
      '2213 de 2022).\n' +
      'CONTRATANTE: {{empresa_razon_social}} · Rep. legal {{representante_legal}} · {{ciudad}}.\n' +
      'CONTRATISTA: {{contratista_nombre}} · CC {{contratista_cc}} · Dirección {{contratista_direccion}} · Correo ' +
      '{{contratista_email}} · Tel/WhatsApp {{contratista_telefono}}.',
  },
  {
    titulo: 'CLÁUSULA FINAL - LEY APLICABLE E INTERPRETACIÓN:',
    cuerpo:
      'El presente contrato se interpretará de buena fe y en concordancia con el artículo 34 numeral 1º del Código Sustantivo ' +
      'del Trabajo y el artículo 1495 del Código Civil, al tratarse de una relación de naturaleza civil y no laboral. LA ' +
      'CONTRATISTA recibirá su ejemplar al correo {{contratista_email}} y devolverá la versión firmada al correo institucional ' +
      '{{correo_devolucion}} dentro de los tres (3) días hábiles siguientes.',
  },
]

// Funciones de ejemplo para el cargo Call Center (editable luego en Configuración → Cargos).
const FUNCIONES_CALL_CENTER = [
  {
    grupo: 'I. Funciones principales',
    items: [
      'Realizar llamadas outbound proactivas de prospección comercial, upselling y cross-selling de productos tecnológicos.',
      'Responder el 100% de los mensajes entrantes (WhatsApp Business, líneas telefónicas y chat en vivo), dejando las colas en ceros al final de cada jornada.',
      'Evaluar de forma autónoma el perfil crediticio de los clientes y formular ofertas de crédito personalizadas para el cierre de ventas.',
    ],
  },
  {
    grupo: 'II. Gestión comercial integral',
    items: [
      'Gestionar objeciones crediticias con una meta de conversión mínima del 20% de consultas en ventas financiadas.',
      'Monitorear la cartera de pagos pendientes (días 15-60 de mora) con recordatorios amistosos.',
      'Identificar oportunidades de recompra (trade-in) de dispositivos usados y coordinar su recolección.',
      'Ejecutar fidelización proactiva de buenos pagadores con condiciones preferenciales.',
      'Registrar integralmente todas las interacciones en los sistemas designados.',
    ],
  },
  {
    grupo: 'III. Funciones administrativas y de cumplimiento',
    items: [
      'Emitir facturas electrónicas correctas e inmediatas al cierre de cada venta.',
      'Garantizar la confidencialidad de datos sensibles conforme a la Ley 1581 de 2012.',
      'Reportar diariamente las métricas de desempeño (interacciones, conversión, cartera, recompra, fidelización).',
    ],
  },
]

export async function seedPlantillasContrato() {
  const existente = await prisma.plantillaContrato.findFirst({ where: { tipo: 'OPS' } })
  if (!existente) {
    await prisma.plantillaContrato.create({
      data: {
        nombre: 'Prestación de servicios (OPS)',
        tipo: 'OPS',
        titulo: 'CONTRATO DE PRESTACIÓN DE SERVICIOS',
        intro: INTRO,
        cierre: CIERRE,
        clausulas: {
          create: CLAUSULAS.map((c, i) => ({ orden: i + 1, titulo: c.titulo, cuerpo: c.cuerpo, esFunciones: c.esFunciones ?? false })),
        },
      },
    })
    console.log('Plantilla OPS creada con', CLAUSULAS.length, 'cláusulas.')
  } else {
    if (!existente.cierre) {
      await prisma.plantillaContrato.update({ where: { id: existente.id }, data: { cierre: CIERRE } })
      console.log('Plantilla OPS: se agregó el párrafo de cierre.')
    }
    console.log('Plantilla OPS ya existe; no se recrean cláusulas.')
  }

  // Funciones de ejemplo para un cargo tipo Call Center (si existe alguno sin funciones)
  const cargoCall = await prisma.cargo.findFirst({
    where: { OR: [{ nombre: { contains: 'Call', mode: 'insensitive' } }, { nombre: { contains: 'Customer', mode: 'insensitive' } }, { nombre: { contains: 'Servicio', mode: 'insensitive' } }] },
  })
  if (cargoCall && !cargoCall.funcionesContrato) {
    await prisma.cargo.update({ where: { id: cargoCall.id }, data: { funcionesContrato: FUNCIONES_CALL_CENTER } })
    console.log(`Funciones de contrato asignadas al cargo "${cargoCall.nombre}".`)
  } else {
    console.log('No se asignaron funciones de ejemplo (crea un cargo Call Center y edítalo en Configuración → Cargos).')
  }
}

if (require.main === module) {
  seedPlantillasContrato().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
}
