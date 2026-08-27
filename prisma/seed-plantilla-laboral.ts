import 'dotenv/config'
import { prisma } from '../src/lib/db'

/**
 * Seed de la plantilla de contrato LABORAL A TÉRMINO FIJO, transcrita LITERAL
 * del contrato real de KUPOCELL ("CONTRATO TF - ASESOR COMERCIAL"). Por decisión
 * del usuario el texto se mantiene tal cual (su revisión es del abogado); solo
 * los datos variables se reemplazan por {{variables}}. Editable después en BD.
 */

const INTRO =
  'En la ciudad de {{ciudad}}, el {{fecha_suscripcion_larga}}, Entre los suscritos a saber: por una parte, la empresa ' +
  '{{empresa_razon_social}} identificada con NIT. No. {{empresa_nit}} y su marca comercial {{empresa_marca}}, representadas ' +
  'legalmente por el señor {{representante_legal}}, mayor de edad, identificado con cédula de ciudadanía No. ' +
  '{{representante_legal_cc}}, domiciliado en la ciudad de {{ciudad}}, y quien en adelante se denominará EL EMPLEADOR; ' +
  'y por la otra, {{empleado_tratamiento}} {{empleado_nombre}}, mayor de edad, {{empleado_identificada}} con cédula de ' +
  'ciudadanía No. {{empleado_cc}} expedida en {{empleado_cc_lugar}}, con domicilio en la misma ciudad, quien en adelante ' +
  'se denominará EL EMPLEADO;\n' +
  'Han convenido celebrar el presente Contrato de Trabajo a Término Fijo, de conformidad con lo previsto en el artículo 46 ' +
  'del Código Sustantivo del Trabajo (modificado por Ley 2466 de 2025), Ley 50 de 1990, Ley 789 de 2002, Decreto 1072 de 2024 ' +
  'y demás normas concordantes, el cual se regirá por las siguientes:\n' +
  'CLÁUSULAS'

const CIERRE =
  'Leído, entendido y aprobado en todas sus partes, se firma en dos ejemplares de igual tenor y valor, en la ciudad de ' +
  '{{ciudad}}, el {{fecha_suscripcion_larga}}.'

const CLAUSULAS: { titulo: string; cuerpo: string; esFunciones?: boolean }[] = [
  {
    titulo: 'PRIMERA: - OBJETO:',
    cuerpo:
      'EL EMPLEADO, en calidad de {{cargo_objeto}} para {{empresa_razon_social}}, asume durante el plazo fijo pactado la ' +
      'ejecución de actividades comerciales consistentes en asesoría, acompañamiento y apoyo en la venta de productos ' +
      'tecnológicos y de telecomunicaciones de la empresa {{empresa_razon_social}} y su marca comercial {{empresa_marca}}, ' +
      'así como en la atención a clientes y usuarios interesados, y en las demás gestiones complementarias descritas en este ' +
      'contrato. EL EMPLEADOR establecerá metas mensuales verificables, las cuales EL EMPLEADO cumplirá y se aceptará ' +
      'mediante acta de conformidad escrita.',
  },
  {
    titulo: 'SEGUNDA. - NATURALEZA DEL CONTRATO:',
    cuerpo:
      'Las partes declaran expresamente que este contrato se celebra a término fijo, de conformidad con lo establecido en el ' +
      'artículo 46 del Código Sustantivo del Trabajo (modificado por Ley 2466 de 2025), para la ejecución de actividades ' +
      'comerciales consistentes en asesoría, acompañamiento y apoyo en la venta de productos tecnológicos y de ' +
      'telecomunicaciones de la empresa {{empresa_razon_social}} y su marca comercial {{empresa_marca}}, durante el período ' +
      'temporal definido en la primera cláusula.\n' +
      'En consecuencia, las partes reconocen que este vínculo es de naturaleza laboral, con las obligaciones, derechos y ' +
      'prestaciones sociales que establece la legislación laboral, incluyendo afiliación al sistema de seguridad social ' +
      'integral (salud, pensión y riesgos laborales), pago de prestaciones sociales, aportes parafiscales y demás conceptos ' +
      'derivados de la relación laboral.\n' +
      'El presente contrato permanecerá vigente hasta la fecha de finalización pactada, {{fecha_fin_larga}}, y se extinguirá ' +
      'automáticamente al vencimiento del término fijo, sin necesidad de previo aviso, salvo prórroga expresa con las ' +
      'limitaciones legales.',
  },
  {
    titulo: 'TERCERA. – FUNCIONES DEL EMPLEADO:',
    cuerpo:
      'En desarrollo del objeto contractual, EL EMPLEADO ejecutará, durante el plazo fijo pactado, las siguientes funciones ' +
      'de actividades comerciales para {{empresa_razon_social}}, orientadas al cumplimiento de metas mensuales verificables:',
    esFunciones: true,
  },
  {
    titulo: 'PARÁGRAFO:',
    cuerpo:
      'EL EMPLEADOR podrá designar a uno o varios supervisores comerciales, quienes tendrán la facultad de realizar el ' +
      'seguimiento, la verificación, el control y la validación de las actividades ejecutadas por EL EMPLEADO, así como de ' +
      'emitir recomendaciones, observaciones y requerimientos encaminados al cumplimiento de los objetivos del presente contrato.\n' +
      'Las actividades anteriores se ejecutarán bajo las directrices e instrucciones que imparta EL EMPLEADOR, quien conservará ' +
      'en todo momento la facultad de supervisión, control y orientación contratada.',
  },
  {
    titulo: 'CUARTA. – OBLIGACONES GENERALES Y COMPLEMENTARIAS DEL EMPLEADO:',
    cuerpo:
      '- Ejecutar profesionalmente las actividades de promoción y venta de los productos de {{empresa_marca}}, contribuyendo al posicionamiento y fortalecimiento de la marca.\n' +
      '- Impulsar el crecimiento cualitativo y cuantitativo del negocio en la zona asignada, manteniéndose activo, motivado e informado para conquistar, fomentar y conservar el mercado.\n' +
      '- Mantener indemne a {{empresa_marca}} frente a cualquier daño o perjuicio que derive de actos dolosos o culposos cometidos por EL EMPLEADO en desarrollo de sus actividades contractuales, incluyendo reclamaciones formuladas por terceros, siempre que tales actos sean atribuibles directamente a EL EMPLEADO.\n' +
      '- Elaborar de manera oportuna y correcta las guías de despacho, asegurando la concordancia exacta entre la cantidad de productos despachados, los datos de clientes registrados en plataformas digitales y las facturas emitidas, así como verificar la correspondencia con los reportes de las transportadoras.\n' +
      '- Hacer uso adecuado y responsable de las plataformas digitales asignadas por la empresa para la gestión de ventas y productos, tales como VTEX, Shopify, Éxito, Falabella, entre otras, asegurando el registro preciso y oportuno de información, precios, inventario y publicaciones.\n' +
      '- Realizar registro fotográfico obligatorio de toda entrada y salida de mercancía, especialmente en casos de traslados a otras sedes o entregas a terceros, desde el momento en que los productos salen del local, con el fin de dejar constancia clara del estado y cantidad de los productos movilizados.\n' +
      '- Velar por el uso adecuado, mantenimiento y conservación tanto de los equipos y herramientas tecnológicas suministrados para el desempeño de sus funciones, como de los productos entregados a los clientes, asegurando su correcto manejo y cuidado durante todo el proceso.\n' +
      '- Mantener en condiciones adecuadas de orden, limpieza y presentación el espacio físico donde desempeñe sus funciones, contribuyendo a un ambiente profesional y seguro conforme a las buenas prácticas comerciales.\n' +
      '- Manejar con estricta confidencialidad y en cumplimiento de la Ley 1581 de 2012, así como de las políticas internas aplicables de {{empresa_marca}}, toda la información y datos de clientes, prospectos y de la empresa que estén a su cargo, absteniéndose de divulgar, usar o divulgar dicha información sin autorización expresa.\n' +
      '- EL EMPLEADO atenderá de buena fe y de manera oportuna las observaciones o recomendaciones que {{empresa_marca}} formule, orientadas al mejoramiento y facilitación de la prestación del servicio, sin que ello implique subordinación, control directo ni dependencia funcional.\n' +
      '- Guardar absoluta reserva sobre toda información privada o confidencial conocida en desarrollo de sus funciones, salvo autorización expresa.\n' +
      '- EL EMPLEADO se compromete a preservar la imagen, reputación y buen nombre de {{empresa_marca}} en todas sus gestiones comerciales, desarrollando sus funciones con profesionalismo y respeto hacia la marca, sin que ello implique obligación laboral o subordinación.\n' +
      '- EL EMPLEADO procurará mantener relaciones cordiales y profesionales con clientes, {{empresa_marca}} y demás colaboradores, promoviendo un ambiente de respeto y colaboración que favorezca el desarrollo comercial.\n' +
      '- EL EMPLEADO ejercerá sus funciones con lealtad, compromiso y disciplina profesional, atendiendo a los intereses comerciales y estratégicos de {{empresa_marca}} sin que ello implique dependencia laboral.\n' +
      '- EL EMPLEADO deberá informar oportunamente cualquier cambio en su dirección de residencia o datos de contacto, a fin de mantener actualizados sus registros y facilitar la comunicación.\n' +
      '- EL EMPLEADO cumplirá con las políticas y normativas aplicables en materia de prevención y control de lavado de activos, financiación del terrorismo y demás actividades ilícitas, dentro del marco de sus funciones y responsabilidad contractual.\n' +
      '- EL EMPLEADO cumplirá con todas las demás obligaciones necesarias para la adecuada ejecución del objeto contractual, conforme a las instrucciones legales y comerciales impartidas en el marco del presente contrato.',
  },
  {
    titulo: 'QUINTA. - OBLIGACIONES DEL EMPLEADOR:',
    cuerpo:
      'De conformidad con lo dispuesto en el artículo 57 del Código Sustantivo del Trabajo, EL EMPLEADOR se obliga a:\n' +
      'Afiliar a EL EMPLEADO al Sistema de Seguridad Social Integral y efectuar los aportes correspondientes; pagar ' +
      'puntualmente el salario y las prestaciones sociales legales; suministrar los elementos necesarios para la ejecución ' +
      'del trabajo; garantizar condiciones adecuadas de higiene y seguridad industrial; y otorgar el trato digno, respetuoso ' +
      'y conforme a la ley.',
  },
  {
    titulo: 'SEXTA. – SALARIO Y FORMA DE PAGO:',
    cuerpo:
      'EL EMPLEADOR pagará a EL EMPLEADO, como contraprestación por la labor contratada, un salario mensual de ' +
      '{{salario_mcte_letras}}, más un auxilio de transporte legal de {{aux_transporte_mcte_letras}} y Seguridad Social, ' +
      'conforme al Decreto 2613 de 2023.\n' +
      'El pago se efectuará los primeros (05) días de cada mes, mediante transferencia electrónica a la cuenta informada por ' +
      'EL EMPLEADO, la cual anexará al presente contrato.\n' +
      'PARÁGRAFO PRIMERO: De acuerdo con el artículo 128 del Código Sustantivo del Trabajo, no constituyen salario aquellas ' +
      'sumas pagadas ocasionalmente con fines no remunerativos, tales como bonificaciones no salariales, viáticos ocasionales, ' +
      'apoyos logísticos o elementos de trabajo.\n' +
      'PARÁGRAFO SEGUNDO: EL EMPLEADOR no suministra salario en especie. Si llegaren a entregarse herramientas, vestuario o ' +
      'alimentación para el cumplimiento de las funciones, ello no constituye remuneración, conforme al criterio funcional ' +
      'definido en el art. 128 CST y jurisprudencia laboral.\n' +
      'PARÁGRAFO TERCERO: El salario pactado incluye los descansos dominicales y festivos ordinarios. El trabajo suplementario, ' +
      'nocturno o en días de descanso requerirá autorización previa y será remunerado según lo establecido en los artículos ' +
      '160, 168 y 179 del CST, incluyendo los recargos progresivos aprobados en la reforma laboral (80% en 2025, 90% en 2026, ' +
      '100% desde 2027 para trabajo en dominicales y festivos).\n' +
      'PARÁGRAFO CUARTO: El salario aquí estipulado será la base para la liquidación de prestaciones sociales, aportes al ' +
      'sistema de seguridad social y contribuciones parafiscales, conforme a lo establecido en el artículo 130 y siguientes del CST.\n' +
      'PARÁGRAFO QUINTO: De conformidad con el artículo 149 del CST, EL EMPLEADO autoriza expresamente al EMPLEADOR para ' +
      'efectuar descuentos legales o contractuales sobre su salario, siempre que cuenten con justificación clara y consten por escrito.',
  },
  {
    titulo: 'SÉPTIMA. – PRESTACIONES SOCIALES Y BENEFICIOS:',
    cuerpo:
      'EL EMPLEADOR reconoce a EL EMPLEADO todos los derechos prestacionales derivados del vínculo laboral, en los términos ' +
      'establecidos por el Código Sustantivo del, la Ley 100 de 1993, la Ley 789 de 2002 y demás disposiciones complementarias ' +
      'Trabajo vigentes.\n' +
      'PARÁGRAFO PRIMERO: Durante la vigencia del contrato, EL EMPLEADOR realizará las afiliaciones obligatorias al Sistema ' +
      'Integral de Seguridad Social en Salud, Pensión y Riesgos Laborales, así como a las Cajas de Compensación Familiar, de ' +
      'conformidad con lo dispuesto en el artículo 22 de la Ley 100 de 1993 y el Decreto 1072 de 2015.\n' +
      'PARÁGRAFO SEGUNDO: EL EMPLEADO tendrá derecho al reconocimiento y pago de las prestaciones sociales legales, conforme ' +
      'a los artículos 249 a 256 del Código Sustantivo del Trabajo, incluyendo:\n' +
      '- Prima de servicios (arts. 306 y 307 CST).\n' +
      '- Cesantías (arts. 249 y ss. CST), con consignación anual al fondo elegido por EL EMPLEADO.\n' +
      '- Intereses a las cesantías (12% anual, art. 99 Ley 50 de 1990).\n' +
      '- Vacaciones (15 días hábiles por cada año laborado, art. 186 CST).\n' +
      'PARÁGRAFO TERCERO: EL EMPLEADOR garantizará el pago oportuno de aportes al sistema de seguridad social y parafiscales, ' +
      'conforme a los ingresos reportados mensualmente, evitando cualquier perjuicio para EL EMPLEADO, bajo las consecuencias ' +
      'legales por omisión o mora previstas en la Ley 100 de 1993 y el Código Sustantivo del Trabajo.\n' +
      'PARÁGRAFO CUARTO: Cualquier beneficio adicional que EL EMPLEADOR decida otorgar de manera ocasional o extraordinaria ' +
      'durante la vigencia del contrato (bonificación, auxilio o incentivo), deberá constar por escrito y se entenderá no ' +
      'constitutivo de salario, ni prestacional, conforme al artículo 128 CST, salvo estipulación expresa en contrario.',
  },
  {
    titulo: 'OCTAVA. – DURACIÓN DEL CONTRATO:',
    cuerpo:
      'El presente contrato se celebra a término fijo por {{plazo_letras}}, desde el {{fecha_inicio_larga}} hasta el ' +
      '{{fecha_fin_larga}}, correspondiente a actividades comerciales específicas de temporalidad definida.\n' +
      'Su terminación se producirá automáticamente al vencimiento del término pactado, conforme a lo previsto en el artículo 46 ' +
      'del Código Sustantivo del Trabajo (modificado por la Ley 2466 de 2025).\n' +
      'PARÁGRAFO ÚNICO. Las partes entienden que la duración de este contrato depende exclusivamente del término fijo pactado, ' +
      'y no requiere previo aviso de terminación salvo para prórrogas, de conformidad con el régimen legal de esta modalidad contractual.',
  },
  {
    titulo: 'NOVENA. – LUGAR DE EJECUCIÓN DEL TRABAJO:',
    cuerpo:
      'EL EMPLEADO desempeñará sus funciones principalmente en las instalaciones físicas del establecimiento de comercio ' +
      '{{empresa_razon_social}}, ubicado en la ciudad de {{ciudad}}, en modalidad presencial.\n' +
      'PARÁGRAFO PRIMERO: Excepcionalmente, y cuando las condiciones lo permitan o la naturaleza de las funciones lo requiera, ' +
      'EL EMPLEADOR podrá autorizar el desarrollo parcial o temporal de actividades en modalidad remota o virtual, sin que ello ' +
      'implique desnaturalización del vínculo laboral, ni modificación de las condiciones esenciales del contrato.\n' +
      'PARÁGRAFO SEGUNDO: EL EMPLEADO acepta la posibilidad de ser trasladada ocasional o temporalmente a otras sedes, puntos ' +
      'de venta, bodegas o espacios determinados por EL EMPLEADOR dentro del territorio nacional, siempre que tales traslados ' +
      'no impliquen desmejora de sus condiciones laborales, ni afecten su dignidad o estabilidad mínima. En tales casos, ' +
      'EL EMPLEADOR cubrirá los gastos razonables de transporte y/o estadía cuando aplique.',
  },
  {
    titulo: 'DECIMA. – JORNADA Y HORARIO DE TRABAJO:',
    cuerpo:
      'En cumplimiento de lo establecido en el artículo 161 del Código Sustantivo del, modificado por la Ley 2101 de 2021 y ' +
      'Ley 2466 de 2025, la jornada laboral ordinaria de EL EMPLEADO será de hasta cuarenta y cuatro (44) horas semanales hasta ' +
      'el 14 de julio de 2026, distribuidas en un máximo de seis (6) días por semana, reduciéndose a cuarenta y dos (42) horas ' +
      'semanales a partir del 15 de julio de 2026, sin que ello implique reducción salarial ni afectación a sus derechos laborales.\n' +
      'La jornada se desarrollará bajo modalidad presencial en una franja horaria general de 8:00 am a 7:00 pm todos los días, ' +
      'dentro de la cual EL EMPLEADOR fijará el horario específico de EL EMPLEADO respetando sus 44/42 horas semanales según ' +
      'corresponda, conforme a las necesidades del servicio; las horas excedentes se reconocerán y pagarán como extras conforme a la ley.\n' +
      'PARÁGRAFO PRIMERO: EL EMPLEADOR podrá ajustar la franja horaria y distribuir la jornada mediante turnos rotativos, ' +
      'horarios flexibles o variables, siempre respetando la jornada máxima legal vigente, los períodos mínimos de descanso y ' +
      'pagando horas extras cuando corresponda.\n' +
      'PARÁGRAFO SEGUNDO: EL EMPLEADO tendrá derecho a un (1) día de descanso remunerado semanal, generalmente domingo, ' +
      'pudiendo asignarse otro día compensatorio por necesidades del servicio conforme a la legislación.\n' +
      'PARÁGRAFO TERCERO: El trabajo suplementario, nocturno o dominical requerirá autorización escrita y se remunerará ' +
      'conforme a las tarifas legales vigentes.',
  },
  {
    titulo: 'DECIMA PRIMERA – MODALIDADES Y CONDICIONES DE EJECUCIÓN DEL TRABAJO:',
    cuerpo:
      'EL EMPLEADO se compromete a ejecutar las funciones contratadas con estricta sujeción a los principios de disciplina, ' +
      'diligencia, lealtad, subordinación y responsabilidad, acatando las instrucciones legítimas que le imparta EL EMPLEADOR ' +
      'o sus delegados, dentro del marco de la normatividad vigente y las políticas internas de la empresa.\n' +
      'Deberá cumplir a cabalidad con los protocolos institucionales, procedimientos operativos, reglamentos internos, manuales ' +
      'de funciones, políticas de seguridad, bioseguridad, atención al cliente y demás disposiciones que rijan durante la ' +
      'ejecución del contrato, así como emplear adecuadamente las herramientas, plataformas, equipos y recursos que le sean ' +
      'asignados para el cumplimiento de sus tareas.\n' +
      'Así mismo, se espera de EL EMPLEADO una actitud proactiva, colaborativa y comprometida con la calidad del servicio, la ' +
      'mejora continua, el uso eficiente de los recursos, la buena imagen de la empresa y la adecuada gestión de la información, ' +
      'especialmente en lo relacionado con el manejo de datos sensibles o confidenciales.\n' +
      'Parágrafo único. El incumplimiento de las instrucciones legítimas impartidas por EL EMPLEADOR, así como la inobservancia ' +
      'de los reglamentos, manuales, protocolos o políticas internas, será considerado como falta disciplinaria grave y podrá ' +
      'dar lugar a sanciones conforme a la ley, incluyendo la terminación del contrato, sin perjuicio de las acciones legales a ' +
      'que haya lugar.',
  },
  {
    titulo: 'DECIMA SEGUNDA: - RESPONSABILIDAD FISCAL Y LABORAL:',
    cuerpo:
      'Cada parte responderá por sus obligaciones fiscales, tributarias y laborales derivadas del presente contrato, sin ' +
      'generar solidaridad o presunción de vínculo laboral entre EL EMPLEADOR y los trabajadores o proveedores de EL EMPLEADO.',
  },
  {
    titulo: 'DÉCIMA TERCERA. - CONFIDENCIALIDAD:',
    cuerpo:
      'Para efectos del presente contrato, se entenderá por Información Confidencial toda aquella que {{empresa_razon_social}} ' +
      'revele o a la que EL EMPLEADO acceda en virtud del presente contrato, que reúna alguna de las siguientes características:\n' +
      'a) Que no sea de conocimiento público, ni pueda ser obtenida mediante fuentes legítimas.\n' +
      'b) Que haya sido expresamente señalada por {{empresa_razon_social}} como confidencial o reservada, incluyendo, pero sin ' +
      'limitarse a, información relativa a modelos de negocio, estrategias comerciales, identidad de proveedores, estados ' +
      'financieros y contratos con entidades bancarias, bursátiles o fiduciarias.\n' +
      'EL EMPLEADO se obliga a guardar estricta reserva y confidencialidad respecto de dicha información confidencial, ' +
      'comprometiéndose a:\n' +
      '- Abstenerse de divulgar, reproducir, transferir o usar la información para fines distintos a la ejecución del presente contrato.\n' +
      '- Adoptar las medidas técnicas, administrativas y legales necesarias para proteger la Información Confidencial, evitando su pérdida, alteración, destrucción o uso no autorizado.\n' +
      '- No entregar, ni permitir acceso a terceros, sin autorización previa y escrita de {{empresa_razon_social}}.\n' +
      '- Reconocer que la marca {{empresa_marca}} y toda la Información Confidencial son propiedad exclusiva de {{empresa_razon_social}}, y que cualquier uso o divulgación requiere autorización expresa.\n' +
      '- Responder por los perjuicios derivados del incumplimiento de esta cláusula, sin perjuicio de las acciones legales que correspondan.\n' +
      '- Las obligaciones de confidencialidad aquí descritas subsistirán por un término de dos (2) años contados a partir de la terminación del presente contrato.',
  },
  {
    titulo: 'DÉCIMA CUARTA. – PROPIEDAD INTELECTUAL Y DERECHOS SOBRE CONTENIDO GENERADO:',
    cuerpo:
      'EL EMPLADO reconoce que, en el marco de sus funciones laborales y con ocasión de la ejecución del presente contrato, ' +
      'generará, modificará o participará en la creación de contenidos digitales, materiales promocionales, contenido orgánico, ' +
      'campañas publicitarias, diseños gráficos, bases de datos, códigos fuente, guiones, estrategias comerciales y demás ' +
      'desarrollos asociados por {{empresa_razon_social}} y {{empresa_marca}}. Estas creaciones constituirán activos intangibles ' +
      'de propiedad exclusiva de EL EMPLEADOR.\n' +
      'En consecuencia, EL EMPLEADO cede de forma irrevocable, gratuita y total a favor de EL EMPLEADOR, todos los derechos ' +
      'patrimoniales de autor sobre tales obras, conforme a lo dispuesto en los artículos 11, 12, 20 y 98 de la ley 23 de 1982, ' +
      'la Decisión Andina 351 de 1993, y demás normas nacionales e internacionales sobre propiedad intelectual.\n' +
      'EL EMPLEADO declara que la contraprestación por esta cesión está incluida en el salario pactado, y que no reclamará ' +
      'compensación adicional por tales derechos. Se compromete, además, a no divulgar, explotar o reproducir total o ' +
      'parcialmente las obras creadas sin autorización expresa y escrita de EL EMPLEADOR.',
  },
  {
    titulo: 'DÉCIMA QUINTA. - CLÁUSULA PENAL:',
    cuerpo:
      'Las partes acuerdan y aceptan expresamente que, en caso de incumplimientos técnicos o contractuales, reclamaciones de ' +
      'terceros por vulneraciones a propiedad intelectual y por las obligaciones estipuladas en la cláusula de Confidencialidad ' +
      'o de cualquiera de las demás obligaciones contractuales por parte de EL EMPLEADO, este último deberá pagar a ' +
      '{{empresa_razon_social}}, a título de cláusula penal, la suma equivalente a tres (03) salarios mínimos legales mensuales ' +
      'vigentes (SMLMV) colombianos al momento de la ocurrencia del incumplimiento, además de posibles indemnizaciones por ' +
      'daños y perjuicios probados.\n' +
      'Dicha suma podrá hacerse efectiva mediante la ejecución de la garantía única de cumplimiento, o mediante acción ejecutiva ' +
      'directa contra EL EMPLEADO, sin perjuicio de que {{empresa_razon_social}} pueda reclamar, en acción ordinaria separada, ' +
      'la reparación integral de perjuicios materiales e inmateriales que dicho incumplimiento le haya ocasionado.\n' +
      'La presente penalidad se establece como una sanción civil, independiente y sin que su pago exima EL EMPLEADO de la ' +
      'obligación de cumplir con las demás obligaciones pactadas ni de responder por daños adicionales.\n' +
      'Para garantizar la vigencia y efectividad de esta cláusula, el valor de la penalidad se ajustará automáticamente conforme ' +
      'a la actualización del salario mínimo legal mensual vigente, sin necesidad de un nuevo acuerdo entre las partes.',
  },
  {
    titulo: 'DÉCIMA SEXTA. - RÉGIMEN DE EXCLUSIVIDAD:',
    cuerpo:
      '1. Obligación de Exclusividad: EL EMPLEADO se obliga a no promover, vender, asesorar, ni gestionar, directa o ' +
      'indirectamente, productos o servicios que compitan con los de {{empresa_razon_social}} dentro del territorio nacional, ' +
      'durante la vigencia del presente contrato, en el mismo ramo o sector comercial en el que {{empresa_razon_social}} ' +
      'desarrolla sus actividades. Para efectos del presente contrato, se entiende por "competidor directo" toda persona ' +
      'natural o jurídica que ofrezca productos o servicios equivalentes o similares a los comercializados por {{empresa_razon_social}}.\n' +
      '2. No Exclusividad Territorial, ni Sectorial: EL EMPLEADO reconoce expresamente que la asignación de una zona geográfica, ' +
      'línea de productos o segmento de mercado no le confiere exclusividad alguna sobre los mismos, por lo que ' +
      '{{empresa_razon_social}} podrá libremente designar y contratar otros asesores comerciales, así como realizar ventas ' +
      'directas, en dicha zona, línea o segmento, sin que ello genere derecho a reclamo, compensación o indemnización por parte ' +
      'de EL EMPLEADO.\n' +
      '3. Incumplimiento: El incumplimiento por parte de EL EMPLEADO de las obligaciones de exclusividad previstas en esta ' +
      'cláusula será causal de terminación unilateral del contrato, conforme a lo dispuesto en la cláusula penal pactada en el ' +
      'presente documento, sin perjuicio de que {{empresa_razon_social}} pueda reclamar adicionalmente la indemnización por los ' +
      'perjuicios que dicho incumplimiento le ocasione.',
  },
  {
    titulo: 'DÉCIMA SÉPTIMA. - PROHIBICIÓN DE CESIÓN:',
    cuerpo:
      'EL EMPLEADO no podrá ceder, transferir, delegar, ni subcontratar, en forma total o parcial, las obligaciones asumidas en ' +
      'virtud del presente contrato, sin la autorización previa, expresa y escrita de {{empresa_razon_social}}.\n' +
      'Cualquier cesión no autorizada será considerada como incumplimiento grave de las condiciones contractuales, facultando a ' +
      '{{empresa_razon_social}} para declarar la terminación anticipada del contrato y exigir las reparaciones a que haya lugar ' +
      'conforme a la ley.',
  },
  {
    titulo: 'DÉCIMA OCTAVA. - MODIFICACIONES CONTRACTUALES:',
    cuerpo:
      'Cualquier modificación, adición o ajuste al presente contrato deberá formalizarse por escrito mediante otrosí contractual, ' +
      'suscrito por {{empresa_razon_social}} y EL EMPLEADO, y anexarse como parte integral del contrato.\n' +
      'No tendrán validez jurídica las modificaciones verbales, los entendimientos tácitos ni cualquier manifestación de voluntad ' +
      'que no conste por escrito y debidamente firmada por ambas partes.\n' +
      'Las modificaciones contractuales surtirán efectos únicamente a partir de la fecha de firma del respectivo otrosí, salvo ' +
      'que expresamente se pacte una retroactividad válida y autorizada por las partes.',
  },
  {
    titulo: 'DÉCIMA NOVENA. - RESOLUCIÓN DE CONTROVERSIAS:',
    cuerpo:
      'Las partes acuerdan resolver de forma amistosa cualquier desacuerdo y, de persistir, someterse a la jurisdicción ordinaria ' +
      'de la ciudad de {{ciudad}}.',
  },
  {
    titulo: 'VIGÉSIMA- TERMINACIÓN ANTICIPADA DEL CONTRATO:',
    cuerpo:
      'El presente contrato podrá darse por terminado en cualquier momento antes del vencimiento del plazo inicialmente pactado, ' +
      'en los siguientes casos:\n' +
      '1. Por mutuo acuerdo entre las partes, formalizado mediante documento escrito suscrito por {{empresa_razon_social}} y EL EMPLEADO.\n' +
      '2. Por incumplimiento grave de las obligaciones aquí pactadas por cualquiera de las partes, evento en el cual la parte ' +
      'afectada podrá dar por terminado el contrato de forma inmediata.\n' +
      '3. Por la ocurrencia de fuerza mayor o caso fortuito debidamente acreditado, que imposibilite de manera definitiva el ' +
      'cumplimiento del objeto contractual.\n' +
      '4. Por decisión unilateral de {{empresa_razon_social}}, cuando existan motivos comerciales, estratégicos u operativos que, ' +
      'a juicio DEL EMPLEADOR, hagan inviable la continuidad del contrato. En tal caso, se notificará a EL EMPLEADO, la ' +
      'terminación de forma inmediata.\n' +
      'Liquidación: En todos los casos de terminación anticipada, las partes realizarán la liquidación contractual en un plazo ' +
      'máximo de quince (15) días calendario contados desde la fecha de terminación efectiva del contrato.',
  },
  {
    titulo: 'VIGÉSIMA PRIMERA. - GARANTÍAS Y SOPORTE DOCUMENTAL:',
    cuerpo:
      'EL EMPLEADO declara y garantiza que cuenta con todas las facultades legales, técnicas y administrativas necesarias para ' +
      'la debida ejecución del objeto contractual. Asimismo, se obliga a presentar a {{empresa_razon_social}}, dentro de los ' +
      'plazos establecidos, toda la documentación soporte que sea requerida para validar el cumplimiento de sus obligaciones ' +
      'contractuales, incluyendo, pero sin limitarse a, certificaciones, reportes de actividades.\n' +
      'El incumplimiento de estas obligaciones podrá ser causal para que {{empresa_razon_social}} exija la corrección inmediata, ' +
      'suspenda pagos o, en caso de incumplimiento reiterado, proceda a la terminación anticipada del contrato, sin perjuicio de ' +
      'las demás acciones legales que correspondan.',
  },
  {
    titulo: 'VIGÉSIMA SEGUNDA – RESPONSABILIDAD PATRIMONIAL POR PÉRDIDA O ENTREGA ERRADA DE PRODUCTOS:',
    cuerpo:
      'EL EMPLEADOR será civilmente responsable por los perjuicios que se deriven de errores u omisiones directamente ' +
      'atribuibles a negligencia, descuido o inobservancia de los deberes contractuales a su cargo, particularmente en lo ' +
      'relacionado con el diligenciamiento de guías, el registro de datos logísticos, la verificación de información de entrega ' +
      'y el despacho de productos comercializados por {{empresa_razon_social}}.\n' +
      'En caso de que, como consecuencia de dicha conducta culposa, se cause la perdida, entrega incorrecta, deterioro o extravío ' +
      'de un equipo, producto o activo bajo su responsabilidad, EL EMPLEADO se obliga a resarcir el valor de reposición del bien ' +
      'afectado, determinado con base en la factura de compra, avalúo técnico o referencia de mercado.\n' +
      'Verificada objetivamente la existencia del daño y su origen atribuible AL EMPLEADOR, este autoriza desde ahora y de manera ' +
      'expresa a {{empresa_razon_social}} para efectuar la compensación del valor correspondiente mediante descuentos parciales y ' +
      'proporcionales sobre los honorarios pactados, sin que dicha compensación pueda exceder el cincuenta por ciento (50%) del ' +
      'valor neto mensual a pagar en cada periodo, salvo pacto posterior distinto entre las partes.\n' +
      'Esta autorización no implica la renuncia al derecho de defensa, y su aplicación deberá ser previamente notificada AL ' +
      'EMPLEADO, incluyendo los soportes técnicos, documentales y contables que justifiquen el valor a descontar.\n' +
      'Esta clausula es independiente de las disposiciones sancionatorias contenidas en el presente contrato y se regirá por los ' +
      'principios de equidad, buena fe y proporcionalidad.',
  },
  {
    titulo: 'VIGÉSIMA TERCERA – NOTIFICACIONES:',
    cuerpo:
      'Las notificaciones válidas del contrato se harán a las direcciones físicas o electrónicas indicadas por ambas partes.',
  },
  {
    titulo: 'VIGÉSIMA CUARTA. – DECLARACIONES DEL EMPLEADO:',
    cuerpo:
      'EL EMPLEADO hace las siguientes declaraciones:\n' +
      '- He revisado y conozco en su totalidad los documentos que integran el proceso contractual, incluidos términos, condiciones y alcances del presente contrato.\n' +
      '- Ha tenido la oportunidad de formular las preguntas, solicitudes de aclaración o propuestas de modificación respecto a dichos documentos, y he recibido respuestas claras, completas y oportunas por parte de {{empresa_razon_social}}.\n' +
      '- Cuento con plena capacidad legal y técnica para celebrar y ejecutar este contrato en calidad de EMPLEADO.\n' +
      '- No me encuentro incurso en causal alguna de inhabilidad, incompatibilidad, ni impedimento legal para celebrar este contrato.\n' +
      '- Estoy a paz y salvo en el cumplimiento de mis obligaciones laborales y de seguridad social, encontrándome afiliado y realizando cotizaciones regulares ante las entidades competentes conforme a la normatividad aplicable.\n' +
      '- Asumo la responsabilidad exclusiva por el cumplimiento de las obligaciones fiscales, tributarias y de seguridad social derivadas de la ejecución del presente contrato, exonerando a {{empresa_razon_social}} de cualquier responsabilidad en este sentido.',
  },
]

export async function seedPlantillaLaboral() {
  const existente = await prisma.plantillaContrato.findFirst({ where: { tipo: 'TERMINO_FIJO' } })
  if (existente) {
    console.log('Plantilla TERMINO_FIJO ya existe; no se recrean cláusulas.')
    return
  }
  await prisma.plantillaContrato.create({
    data: {
      nombre: 'Contrato de trabajo a término fijo',
      tipo: 'TERMINO_FIJO',
      titulo: 'CONTRATO TERMINO FIJO',
      intro: INTRO,
      cierre: CIERRE,
      clausulas: {
        create: CLAUSULAS.map((c, i) => ({ orden: i + 1, titulo: c.titulo, cuerpo: c.cuerpo, esFunciones: c.esFunciones ?? false })),
      },
    },
  })
  console.log('Plantilla laboral TERMINO_FIJO creada con', CLAUSULAS.length, 'cláusulas.')
}

if (require.main === module) {
  seedPlantillaLaboral().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1) })
}
