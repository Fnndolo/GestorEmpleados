# Modelo de datos â€” Plataforma TH / JurÃ­dica / SST Â· KUPOCELL S.A.S.

**ConvenciÃ³n de nombres: ESPAÃ‘OL** (modelos `PascalCase`, campos `camelCase`, sin tildes/eÃ±es, mapeados a `snake_case` en PostgreSQL). JustificaciÃ³n: el dominio es jurÃ­dicoâ€‘laboral colombiano (cesantÃ­as, otrosÃ­, paz y salvo, UGPP, PILA) y traducirlo al inglÃ©s introduce ambigÃ¼edad y errores de interpretaciÃ³n para el equipo y los usuarios.

## 0. Convenciones globales del esquema

```prisma
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["postgresqlExtensions"]
}
datasource db {
  provider   = "postgresql"
  url        = env("DATABASE_URL")     // pooler (PgBouncer) de Supabase
  directUrl  = env("DIRECT_URL")       // conexiÃ³n directa para migraciones
  extensions = [pg_trgm]
}
```

- **PK**: `id String @id @default(uuid(7)) @db.Uuid` en todos los modelos (UUIDv7: ordenado en el tiempo, amigable con Ã­ndices Bâ€‘tree; evita exponer secuencias).
- **Timestamps**: todos los modelos llevan `creadoEn DateTime @default(now())` y `actualizadoEn DateTime @updatedAt`. No se repiten abajo por brevedad.
- **Mapeo**: todo modelo lleva `@@map("snake_case")` y todo campo compuesto `@map(...)`. Se omite abajo por brevedad; aplicar sistemÃ¡ticamente.
- **Relaciones inversas**: Prisma exige el campo inverso (`prisma format` los agrega). Abajo se muestran solo los lados con FK; donde hay varias FK al mismo modelo se indica el nombre de relaciÃ³n obligatorio.
- **Dinero**: `Decimal @db.Decimal(14,2)`. **Porcentajes**: `Decimal @db.Decimal(6,3)` (la tarifa ARL V es 6.960). **Horas/dÃ­as fraccionados**: `Decimal @db.Decimal(5,2)`. **Fechas sin hora**: `@db.Date`.
- **Borrado**: no hay softâ€‘delete global; las entidades de negocio usan campos `estado`/`activo` y el borrado fÃ­sico queda registrado en `AuditLog`. FKs con `onDelete: Restrict` por defecto; `Cascade` solo de padreâ†’detalle (ej. `LiquidacionNomina â†’ DetalleNomina`).
- **AutorizaciÃ³n**: no se usa RLS de Supabase; el acceso a datos pasa siempre por Prisma (service role) y la autorizaciÃ³n se aplica en Server Actions usando `Rol`/`Permiso`/`UsuarioSede` (ver Â§10).

### Valores legales verificados (junio 2026) â€” para el seed de `ParametroLegalAnual` y `RecargoVigencia`

- SMMLV 2026: **$1.750.905** (Decreto 1469 del 29â€‘dicâ€‘2025; ojo: **suspendido cautelarmente por el Consejo de Estado en febâ€‘2026** â€” razÃ³n de mÃ¡s para que el valor sea editable en BD y no hardcodeado). Auxilio de transporte 2026: **$249.095** (Decreto 1470, vigente). 2025: $1.423.500 / $200.000.
- Ley 2466 de 2025 (vigente desde 25â€‘junâ€‘2025): jornada nocturna **7:00 p.m.â€“6:00 a.m.** con recargo 35% **desde el 25â€‘dicâ€‘2025**; recargo dominical/festivo escalonado: **80% desde 1â€‘julâ€‘2025, 90% desde 1â€‘julâ€‘2026, 100% desde 1â€‘julâ€‘2027**; recargos acumulables sobre la misma hora. Jornada mÃ¡xima (Ley 2101): 44 h desde julâ€‘2025, **42 h desde 15â€‘julâ€‘2026**.

Sources: [Holland & Knight â€” Decretos 1469/1470 de 2025](https://www.hklaw.com/en/insights/publications/2025/12/colombia-decreta-aumento-del-salario-minimo-y-auxilio-de-transporte), [Infobae â€” suspensiÃ³n del decreto de salario mÃ­nimo 2026](https://www.infobae.com/colombia/2026/02/14/el-auxilio-de-transporte-sigue-intacto-la-suspension-del-salario-minimo-2026/), [FunciÃ³n PÃºblica â€” Ley 2466 de 2025](https://www.funcionpublica.gov.co/eva/gestornormativo/norma.php?i=260676), [El Tiempo â€” recargo nocturno desde 7 p.m. (25â€‘dicâ€‘2025)](https://www.eltiempo.com/economia/finanzas-personales/inicio-el-pago-de-las-horas-nocturnas-desde-las-7-de-la-noche-el-abc-del-cambio-que-comenzo-a-regir-a-partir-del-25-de-diciembre-3519795), [Buk â€” recargo dominical y festivo gradual](https://www.buk.co/blog/recargo-dominical-y-festivo-reforma-laboral)

---

## 1. NÃºcleo: usuarios, roles, sedes, estructura organizacional

```prisma
enum EstadoUsuario { ACTIVO INACTIVO BLOQUEADO }
enum AlcanceDatos  { TODAS_SEDES SEDES_ASIGNADAS EQUIPO PROPIO }   // ver Â§10
enum AccionPermiso { VER CREAR EDITAR ELIMINAR APROBAR EXPORTAR }
enum ModuloSistema {
  COLABORADORES CONTRATOS NOMINA NOVEDADES TERMINACIONES AUTOSERVICIO
  ACTIVOS DOTACION CAPACITACIONES EVALUACIONES
  JURIDICA OBLIGACIONES_LEGALES SST REPORTES CONFIGURACION MODULOS_PERSONALIZADOS
}

model Usuario {
  id            String        @id @default(uuid(7)) @db.Uuid
  authId        String        @unique @db.Uuid      // FK lÃ³gica a auth.users de Supabase
  email         String        @unique
  rolId         String        @db.Uuid
  rol           Rol           @relation(fields: [rolId], references: [id])
  estado        EstadoUsuario @default(ACTIVO)
  ultimoAcceso  DateTime?
  colaborador   Colaborador?                         // 1:1 opcional (no todo usuario es colaborador)
  sedes         UsuarioSede[]                        // sedes visibles si alcance = SEDES_ASIGNADAS
}

model Rol {
  id          String       @id @default(uuid(7)) @db.Uuid
  nombre      String       @unique     // seed: Administrador, Recursos Humanos, Nomina, Contador,
                                       // Jefe de Area, Empleado, Subgerencia, Juridica, Responsable SST
  descripcion String?
  alcance     AlcanceDatos @default(PROPIO)
  esSistema   Boolean      @default(false)   // roles seed no eliminables
  permisos    RolPermiso[]
}

model Permiso {
  id     String        @id @default(uuid(7)) @db.Uuid
  modulo ModuloSistema
  accion AccionPermiso
  @@unique([modulo, accion])
}

model RolPermiso {
  rolId     String @db.Uuid
  permisoId String @db.Uuid
  @@id([rolId, permisoId])
}

model UsuarioSede {
  usuarioId String @db.Uuid
  sedeId    String @db.Uuid
  @@id([usuarioId, sedeId])
}

model Ciudad {
  id           String  @id @default(uuid(7)) @db.Uuid
  nombre       String
  departamento String
  codigoDane   String?           // Ãºtil para ICA por municipio
  @@unique([nombre, departamento])
}

model Sede {
  id          String  @id @default(uuid(7)) @db.Uuid
  nombre      String  @unique
  ciudadId    String  @db.Uuid
  ciudad      Ciudad  @relation(fields: [ciudadId], references: [id])
  direccion   String
  telefono    String?
  esPrincipal Boolean @default(false)
  activa      Boolean @default(true)
}

model Area {
  id            String  @id @default(uuid(7)) @db.Uuid
  nombre        String  @unique
  padreId       String? @db.Uuid          // jerarquÃ­a de Ã¡reas para organigrama
  padre         Area?   @relation("AreaJerarquia", fields: [padreId], references: [id])
  responsableId String? @db.Uuid          // Colaborador jefe del Ã¡rea
  activa        Boolean @default(true)
}

model Cargo {
  id                String  @id @default(uuid(7)) @db.Uuid
  nombre            String
  areaId            String  @db.Uuid
  nivel             String?               // directivo / coordinacion / operativo...
  funciones         String?               // texto del manual de funciones (alimenta certificaciÃ³n CON_FUNCIONES)
  activo            Boolean @default(true)
  profesiograma     ProfesiogramaCargo?   // Â§8 SST
  @@unique([nombre, areaId])
}

// CatÃ¡logo Ãºnico para EPS, ARL, AFP, fondo de cesantÃ­as y caja de compensaciÃ³n
enum TipoEntidadSS { EPS ARL AFP FONDO_CESANTIAS CAJA_COMPENSACION }
model EntidadSeguridadSocial {
  id     String        @id @default(uuid(7)) @db.Uuid
  tipo   TipoEntidadSS
  nombre String
  codigo String?       // cÃ³digo PILA del operador
  activa Boolean       @default(true)
  @@unique([tipo, nombre])
}

model Banco {
  id        String  @id @default(uuid(7)) @db.Uuid
  nombre    String  @unique
  codigoAch String?
}

// Singleton de configuraciÃ³n de la empresa (una sola fila)
model ConfiguracionEmpresa {
  id                 String  @id @default(uuid(7)) @db.Uuid
  razonSocial        String  // KUPOCELL S.A.S.
  nombreComercial    String  // Smart Gadgets
  nit                String
  representanteLegal String
  logoPath           String?
  emailNotificaciones String
  diasAlertaPrimeraDefecto Int @default(10)  // hÃ¡biles â€” global del motor de alertas
  diasAlertaUltimaDefecto  Int @default(3)
}
```

El **organigrama** se deriva de `Area.padreId` + `Colaborador.jefeInmediatoId` (no requiere tabla adicional).

---

## 2. Colaboradores (ficha completa)

```prisma
enum TipoDocumento     { CC CE TI PASAPORTE PPT NIT }
enum Genero            { MASCULINO FEMENINO OTRO PREFIERE_NO_DECIR }
enum EstadoCivil       { SOLTERO CASADO UNION_LIBRE SEPARADO DIVORCIADO VIUDO }
enum GrupoSanguineo    { A_POS A_NEG B_POS B_NEG AB_POS AB_NEG O_POS O_NEG }
enum NivelEducativo    { PRIMARIA BACHILLER TECNICO TECNOLOGO PREGRADO ESPECIALIZACION MAESTRIA DOCTORADO }
enum TipoCuentaBancaria{ AHORROS CORRIENTE BILLETERA_DIGITAL }
enum TipoVinculo       { TERMINO_INDEFINIDO TERMINO_FIJO OBRA_LABOR APRENDIZ_SENA OPS PRACTICANTE }
enum ModalidadTrabajo  { PRESENCIAL REMOTO HIBRIDO TELETRABAJO }   // ver Â§11
enum EstadoColaborador { ACTIVO INACTIVO RETIRADO }
enum ClaseRiesgoArl    { I II III IV V }

model Colaborador {
  id                    String   @id @default(uuid(7)) @db.Uuid
  // â€” IdentificaciÃ³n â€”
  tipoDocumento         TipoDocumento
  numeroDocumento       String
  fechaExpedicionDoc    DateTime? @db.Date
  lugarExpedicionDoc    String?
  nombres               String
  apellidos             String
  fechaNacimiento       DateTime  @db.Date
  lugarNacimiento       String?
  genero                Genero?
  estadoCivil           EstadoCivil?
  grupoSanguineo        GrupoSanguineo?
  fotoPath              String?            // Supabase Storage
  // â€” Contacto â€”
  direccion             String?
  barrio                String?
  ciudadResidenciaId    String?  @db.Uuid  // FK Ciudad
  celular               String
  telefono              String?
  emailPersonal         String?
  emailCorporativo      String?
  // â€” Contacto de emergencia â€”
  emergenciaNombre      String?
  emergenciaParentesco  String?
  emergenciaTelefono    String?
  // â€” EducaciÃ³n (mÃ¡ximo nivel + detalle en tabla hija) â€”
  nivelEducativoMax     NivelEducativo?
  educacion             EducacionColaborador[]
  // â€” Salud / seguridad social (catÃ¡logo EntidadSeguridadSocial; 5 relaciones nombradas) â€”
  epsId                 String?  @db.Uuid
  afpId                 String?  @db.Uuid   // fondo de pensiÃ³n (null si pensionado/exento)
  fondoCesantiasId      String?  @db.Uuid
  cajaCompensacionId    String?  @db.Uuid
  arlId                 String?  @db.Uuid
  claseRiesgoArl        ClaseRiesgoArl?
  // â€” Datos bancarios â€”
  bancoId               String?  @db.Uuid
  tipoCuenta            TipoCuentaBancaria?
  numeroCuenta          String?
  // â€” Organizacional â€”
  tipoVinculo           TipoVinculo
  sedeId                String   @db.Uuid   // sede ACTUAL (snapshot histÃ³rico vive en Contrato)
  areaId                String?  @db.Uuid
  cargoId               String?  @db.Uuid
  jefeInmediatoId       String?  @db.Uuid   // self-FK @relation("JefeInmediato")
  modalidadTrabajo      ModalidadTrabajo @default(PRESENCIAL)
  fechaIngreso          DateTime @db.Date
  fechaRetiro           DateTime? @db.Date
  estado                EstadoColaborador @default(ACTIVO)
  // â€” DotaciÃ³n â€”
  tallaCamisa           String?
  tallaPantalon         String?
  tallaCalzado          String?
  // â€” Acceso â€”
  usuarioId             String?  @unique @db.Uuid

  @@unique([tipoDocumento, numeroDocumento])
  @@index([sedeId, estado])
  @@index([areaId])
  @@index([cargoId])
  @@index([jefeInmediatoId])
  @@index([tipoVinculo, estado])
}

model EducacionColaborador {
  id            String         @id @default(uuid(7)) @db.Uuid
  colaboradorId String         @db.Uuid
  nivel         NivelEducativo
  titulo        String
  institucion   String
  fechaGrado    DateTime?      @db.Date
  enCurso       Boolean        @default(false)
}
```

Los documentos escaneados de la hoja de vida (cÃ©dula, diplomas, RUT, certificados EPS/AFP, antecedentes, etc.) se cargan vÃ­a la tabla polimÃ³rfica `Documento` (Â§9.1) con `entidadTipo = "Colaborador"`. El **semÃ¡foro documental** se calcula cruzando `DocumentoRequerido` (catÃ¡logo por tipo de vÃ­nculo, Â§9.1) contra los `Documento` existentes y sus vencimientos.

---

## 3. Contratos

### 3.1 Laborales (pestaÃ±as TÃ©rmino Fijo / Indefinido / Obra / Aprendizaje)

```prisma
enum TipoContratoLaboral { TERMINO_FIJO TERMINO_INDEFINIDO OBRA_LABOR APRENDIZAJE_SENA PRACTICA }
enum TipoSalario         { ORDINARIO INTEGRAL }
enum Jornada             { TIEMPO_COMPLETO MEDIO_TIEMPO POR_DIAS }
enum EstadoContrato      { BORRADOR ACTIVO SUSPENDIDO TERMINADO }
enum EtapaAprendizaje    { LECTIVA PRODUCTIVA }

model Contrato {
  id                 String   @id @default(uuid(7)) @db.Uuid
  numero             String   @unique               // consecutivo legible: CT-2026-0001
  colaboradorId      String   @db.Uuid
  tipo               TipoContratoLaboral
  cargoId            String   @db.Uuid              // snapshot del cargo pactado
  sedeId             String   @db.Uuid              // snapshot de la sede pactada
  jornada            Jornada  @default(TIEMPO_COMPLETO)
  horasSemanales     Int?                           // 42 desde 15-jul-2026 (Ley 2101)
  modalidadTrabajo   ModalidadTrabajo
  salarioBase        Decimal  @db.Decimal(14,2)
  tipoSalario        TipoSalario @default(ORDINARIO)
  fechaInicio        DateTime @db.Date
  fechaFin           DateTime? @db.Date             // obligatorio si FIJO (validaciÃ³n app)
  objetoObraLabor    String?                        // obligatorio si OBRA_LABOR
  etapaAprendizaje   EtapaAprendizaje?              // si APRENDIZAJE_SENA
  apoyoSostenimiento Decimal? @db.Decimal(14,2)     // cuota SENA (75%/100% SMMLV segÃºn etapa)
  periodoPruebaDias  Int?
  periodoPruebaFin   DateTime? @db.Date             // â†’ genera Vencimiento (alerta fin de prueba)
  plantillaId        String?  @db.Uuid              // PlantillaDocumento usada
  estado             EstadoContrato @default(BORRADOR)
  prorrogas          ProrrogaContrato[]
  otrosis            OtrosiContrato[]

  @@index([colaboradorId, estado])
  @@index([tipo, estado, fechaFin])                 // reporte â€œfijos por vencerâ€
  @@index([sedeId])
}

model ProrrogaContrato {
  id            String   @id @default(uuid(7)) @db.Uuid
  contratoId    String   @db.Uuid
  numero        Int                                  // 1, 2, 3â€¦
  fechaInicio   DateTime @db.Date
  fechaFin      DateTime @db.Date                    // actualiza Contrato.fechaFin y su Vencimiento
  fechaFirma    DateTime? @db.Date
  @@unique([contratoId, numero])
}
// Reglas CST validadas en Server Action: tras 3 prÃ³rrogas de contrato fijo < 1 aÃ±o, la renovaciÃ³n
// mÃ­nima es de 1 aÃ±o; duraciÃ³n total tÃ©rmino fijo â‰¤ 4 aÃ±os (requisito jurÃ­dica).

enum TipoCambioOtrosi { SALARIO CARGO SEDE MODALIDAD_TRABAJO JORNADA FUNCIONES DURACION OTRO }
model OtrosiContrato {
  id                String   @id @default(uuid(7)) @db.Uuid
  contratoId        String   @db.Uuid
  numero            Int
  fecha             DateTime @db.Date
  tiposCambio       TipoCambioOtrosi[]               // array nativo PG
  descripcion       String
  valoresAnteriores Json                             // {"salarioBase": 2000000, "sedeId": "..."}
  valoresNuevos     Json
  @@unique([contratoId, numero])
}
```

Al aplicar un otrosÃ­, una Server Action actualiza el snapshot en `Contrato` y los campos vigentes en `Colaborador` (salarioâ†’`VariacionSalarial`, sede, modalidad, cargo); el histÃ³rico queda en `OtrosiContrato.valoresAnteriores/Nuevos`.

### 3.2 OPS (flujo separado de nÃ³mina) y cuentas de cobro

```prisma
enum FormaPagoOps      { MENSUALIDADES POR_ENTREGABLES PAGO_UNICO }
enum EstadoContratoOps { BORRADOR ACTIVO SUSPENDIDO TERMINADO LIQUIDADO }
enum EstadoEntregable  { PENDIENTE ENTREGADO APROBADO RECHAZADO }
enum EstadoCuentaCobro { RADICADA EN_VERIFICACION_SS APROBADA PAGADA RECHAZADA }

model ContratoOps {
  id               String   @id @default(uuid(7)) @db.Uuid
  numero           String   @unique                  // OPS-2026-0001
  contratistaId    String   @db.Uuid                 // Colaborador con tipoVinculo = OPS  @relation("OpsContratista")
  supervisorId     String   @db.Uuid                 // Colaborador interno  @relation("OpsSupervisor")
  sedeId           String   @db.Uuid
  objeto           String
  valorTotal       Decimal  @db.Decimal(14,2)
  formaPago        FormaPagoOps
  honorarioMensual Decimal? @db.Decimal(14,2)
  fechaInicio      DateTime @db.Date
  fechaFin         DateTime? @db.Date
  estado           EstadoContratoOps @default(BORRADOR)
  entregables      EntregableOps[]
  cuentasCobro     CuentaCobroOps[]
  // RUT, hoja de vida, pÃ³lizas â†’ Documento polimÃ³rfico (entidadTipo="ContratoOps")
  @@index([contratistaId])
  @@index([sedeId, estado])
}

model EntregableOps {
  id              String   @id @default(uuid(7)) @db.Uuid
  contratoOpsId   String   @db.Uuid
  descripcion     String
  fechaCompromiso DateTime @db.Date
  fechaEntrega    DateTime? @db.Date
  estado          EstadoEntregable @default(PENDIENTE)
}

model CuentaCobroOps {
  id                  String   @id @default(uuid(7)) @db.Uuid
  contratoOpsId       String   @db.Uuid
  numero              Int
  periodoInicio       DateTime @db.Date
  periodoFin          DateTime @db.Date
  valor               Decimal  @db.Decimal(14,2)
  fechaRadicacion     DateTime @db.Date
  // â€” VerificaciÃ³n OBLIGATORIA de seguridad social (requisito no negociable) â€”
  planillaPilaNumero  String?
  planillaPilaFecha   DateTime? @db.Date
  ibcCotizado         Decimal? @db.Decimal(14,2)    // validaciÃ³n app: IBC â‰¥ 40% del valor mensualizado
  ssVerificada        Boolean  @default(false)
  ssVerificadaPorId   String?  @db.Uuid             // Usuario que verificÃ³
  ssVerificadaEn      DateTime?
  estado              EstadoCuentaCobro @default(RADICADA)
  fechaPago           DateTime? @db.Date
  observaciones       String?
  @@unique([contratoOpsId, numero])
  @@index([estado])                                  // reporte â€œcuentas sin soporte SSâ€
}
```

CHECK en SQL (Â§12): no puede pasar a `APROBADA/PAGADA` sin `ssVerificada = true`. La planilla escaneada se adjunta como `Documento` (`entidadTipo="CuentaCobroOps"`, tipo "Planilla seguridad social"); si falta al cierre de mes, el motor de alertas genera el aviso "cuenta de cobro sin soporte SS".

---

## 4. NÃ³mina

```prisma
// â€”â€”â€” ParÃ¡metros legales por aÃ±o (editables: el SMMLV 2026 fue suspendido judicialmente,
//      la plataforma NO debe hardcodear valores) â€”â€”â€”
model ParametroLegalAnual {
  id                       String  @id @default(uuid(7)) @db.Uuid
  anio                     Int     @unique
  smmlv                    Decimal @db.Decimal(14,2)   // 2025: 1423500 Â· 2026: 1750905
  auxilioTransporte        Decimal @db.Decimal(14,2)   // 2025: 200000  Â· 2026: 249095
  uvt                      Decimal? @db.Decimal(14,2)
  topeAuxTransporteSmmlv   Decimal @default(2) @db.Decimal(4,2)
  pctSaludEmpleado         Decimal @default(4)    @db.Decimal(6,3)
  pctPensionEmpleado       Decimal @default(4)    @db.Decimal(6,3)
  pctSaludEmpleador        Decimal @default(8.5)  @db.Decimal(6,3)
  pctPensionEmpleador      Decimal @default(12)   @db.Decimal(6,3)
  pctCajaCompensacion      Decimal @default(4)    @db.Decimal(6,3)
  pctSena                  Decimal @default(2)    @db.Decimal(6,3)
  pctIcbf                  Decimal @default(3)    @db.Decimal(6,3)
  pctProvCesantias         Decimal @default(8.33) @db.Decimal(6,3)
  pctProvIntCesantias      Decimal @default(1)    @db.Decimal(6,3)  // mensual sobre cesantÃ­as
  pctProvPrima             Decimal @default(8.33) @db.Decimal(6,3)
  pctProvVacaciones        Decimal @default(4.17) @db.Decimal(6,3)
  fspDesdeSmmlv            Decimal @default(4)    @db.Decimal(4,2)  // Fondo de Solidaridad Pensional
  adicionales              Json?                                    // escalas FSP, exoneraciÃ³n Ley 114-1, etc.
}

model TarifaArl {
  claseRiesgo ClaseRiesgoArl @id
  porcentaje  Decimal @db.Decimal(6,3)   // seed: I 0.522, II 1.044, III 2.436, IV 4.350, V 6.960
}

// â€”â€”â€” Recargos con vigencia (Ley 2466: dominical 80â†’90â†’100%) â€”â€”â€”
enum TipoHoraRecargo {
  HORA_EXTRA_DIURNA            // 25%
  HORA_EXTRA_NOCTURNA          // 75%
  RECARGO_NOCTURNO             // 35%
  RECARGO_DOMINICAL_FESTIVO    // 80% / 90% / 100% (escalonado)
  HORA_EXTRA_DIURNA_FESTIVA
  HORA_EXTRA_NOCTURNA_FESTIVA
}
model RecargoVigencia {
  id           String  @id @default(uuid(7)) @db.Uuid
  tipo         TipoHoraRecargo
  porcentaje   Decimal @db.Decimal(6,3)
  vigenteDesde DateTime @db.Date
  vigenteHasta DateTime? @db.Date
  @@index([tipo, vigenteDesde])
}
// seed: RECARGO_DOMINICAL_FESTIVO â†’ (80, 2025-07-01â†’2026-06-30), (90, 2026-07-01â†’2027-06-30), (100, 2027-07-01â†’null)

model JornadaLaboralVigencia {
  id                 String   @id @default(uuid(7)) @db.Uuid
  vigenteDesde       DateTime @db.Date
  horasSemanales     Int                  // 44 (jul-2025) â†’ 42 (15-jul-2026)
  horaInicioNocturna String               // "19:00" desde 25-dic-2025 (Ley 2466)
  horaFinNocturna    String               // "06:00"
}

// â€”â€”â€” Conceptos configurables â€”â€”â€”
enum ClaseConcepto       { DEVENGADO DEDUCCION PROVISION APORTE_PATRONAL }
enum TipoCalculoConcepto { VALOR_FIJO PORCENTAJE_BASICO CANTIDAD_POR_VALOR AUTOMATICO_SISTEMA MANUAL }
model ConceptoNomina {
  id                  String  @id @default(uuid(7)) @db.Uuid
  codigo              String  @unique          // "001" salario, "010" aux transporte, "101" salud...
  nombre              String
  clase               ClaseConcepto
  constitutivoSalario Boolean @default(true)   // requisito explÃ­cito del cliente
  baseSeguridadSocial Boolean @default(true)
  baseParafiscales    Boolean @default(true)
  basePrestaciones    Boolean @default(true)
  tipoCalculo         TipoCalculoConcepto
  porcentaje          Decimal? @db.Decimal(6,3)
  valorPorDefecto     Decimal? @db.Decimal(14,2)
  esSistema           Boolean @default(false)  // salario, aux transporte, salud, pensiÃ³n, FSP, h. extra, etc.
  activo              Boolean @default(true)
}

// â€”â€”â€” Periodos y liquidaciÃ³n â€”â€”â€”
enum TipoPeriodoNomina   { MENSUAL QUINCENAL }
enum EstadoPeriodoNomina { ABIERTO EN_LIQUIDACION CERRADO PAGADO }
model PeriodoNomina {
  id          String   @id @default(uuid(7)) @db.Uuid
  anio        Int
  mes         Int
  secuencia   Int      @default(1)            // 1 mensual; 1|2 quincenal
  tipo        TipoPeriodoNomina @default(MENSUAL)
  fechaInicio DateTime @db.Date
  fechaFin    DateTime @db.Date
  fechaPago   DateTime? @db.Date
  estado      EstadoPeriodoNomina @default(ABIERTO)
  @@unique([anio, mes, secuencia])
}

enum EstadoLiquidacionNomina { BORRADOR APROBADA PAGADA }
model LiquidacionNomina {
  id                 String   @id @default(uuid(7)) @db.Uuid
  periodoId          String   @db.Uuid
  colaboradorId      String   @db.Uuid
  contratoId         String   @db.Uuid
  sedeId             String   @db.Uuid               // snapshot para reportes de masa salarial por sede
  diasLiquidados     Decimal  @db.Decimal(5,2)
  salarioBase        Decimal  @db.Decimal(14,2)      // snapshot
  aplicaAuxTransporte Boolean                        // calculado: salario â‰¤ 2 SMMLV y no remoto-sin-derecho (regla app)
  totalDevengado     Decimal  @db.Decimal(14,2)
  totalDeducciones   Decimal  @db.Decimal(14,2)
  netoPagar          Decimal  @db.Decimal(14,2)
  costoEmpleador     Decimal  @db.Decimal(14,2)      // aportes + provisiones
  estado             EstadoLiquidacionNomina @default(BORRADOR)
  desprendiblePath   String?                         // PDF en Storage (descargable en autoservicio)
  detalles           DetalleNomina[]
  @@unique([periodoId, colaboradorId])
  @@index([sedeId])
}

model DetalleNomina {
  id            String  @id @default(uuid(7)) @db.Uuid
  liquidacionId String  @db.Uuid                     // onDelete: Cascade
  conceptoId    String  @db.Uuid
  cantidad      Decimal? @db.Decimal(8,2)            // horas, dÃ­as, cuota #
  valorUnitario Decimal? @db.Decimal(14,4)
  valor         Decimal  @db.Decimal(14,2)           // positivo siempre; el signo lo da ConceptoNomina.clase
  esAutomatico  Boolean  @default(true)
  origenTipo    String?                              // "RegistroHorasExtra" | "Incapacidad" | "CuotaPrestamo" | "Comision" | "Bonificacion" | "Vacaciones"
  origenId      String?  @db.Uuid                    // referencia polimÃ³rfica a la novedad de origen
  @@index([liquidacionId])
  @@index([origenTipo, origenId])
}

// â€”â€”â€” Novedades de pago de nÃ³mina â€”â€”â€”
model RegistroHorasExtra {
  id            String   @id @default(uuid(7)) @db.Uuid
  colaboradorId String   @db.Uuid
  fecha         DateTime @db.Date
  tipo          TipoHoraRecargo
  horas         Decimal  @db.Decimal(5,2)
  aprobadoPorId String?  @db.Uuid
  liquidacionId String?  @db.Uuid     // null = pendiente de aplicar
  @@index([colaboradorId, fecha])
}

enum TipoComision { VENTA RECAUDO }
model Comision {
  id                  String   @id @default(uuid(7)) @db.Uuid
  colaboradorId       String   @db.Uuid
  tipo                TipoComision
  mesCausacion        DateTime @db.Date
  baseCalculo         Decimal  @db.Decimal(14,2)   // ventas o recaudo del periodo
  porcentaje          Decimal? @db.Decimal(6,3)
  valor               Decimal  @db.Decimal(14,2)
  constitutivoSalario Boolean  @default(true)
  liquidacionId       String?  @db.Uuid
  @@index([colaboradorId, mesCausacion])
}

enum EstadoPrestamo { ACTIVO PAGADO SUSPENDIDO CONDONADO }
enum EstadoCuota    { PENDIENTE DESCONTADA PAGADA_EXTERNA EXONERADA }
model Prestamo {
  id               String   @id @default(uuid(7)) @db.Uuid
  colaboradorId    String   @db.Uuid
  fechaDesembolso  DateTime @db.Date
  valor            Decimal  @db.Decimal(14,2)
  numeroCuotas     Int
  valorCuota       Decimal  @db.Decimal(14,2)
  saldoActual      Decimal  @db.Decimal(14,2)       // recalculado al descontar cada cuota
  estado           EstadoPrestamo @default(ACTIVO)
  cuotas           CuotaPrestamo[]
  // autorizaciÃ³n firmada de descuento â†’ Documento polimÃ³rfico
  @@index([colaboradorId, estado])
}
model CuotaPrestamo {
  id              String  @id @default(uuid(7)) @db.Uuid
  prestamoId      String  @db.Uuid                  // onDelete: Cascade
  numero          Int
  valor           Decimal @db.Decimal(14,2)
  estado          EstadoCuota @default(PENDIENTE)
  detalleNominaId String? @db.Uuid                  // dÃ³nde se descontÃ³
  fechaDescuento  DateTime? @db.Date
  @@unique([prestamoId, numero])
}

model PlanillaPila {
  id             String   @id @default(uuid(7)) @db.Uuid
  anio           Int
  mes            Int
  numeroPlanilla String?
  fechaLimite    DateTime @db.Date                  // â†’ Vencimiento (alerta PILA mensual)
  fechaPago      DateTime? @db.Date
  valorTotal     Decimal? @db.Decimal(14,2)
  estado         String   @default("PENDIENTE")     // PENDIENTE | PAGADA
  // archivo plano + soporte de pago â†’ Documento polimÃ³rfico
  @@unique([anio, mes])
}
```

El **motor de liquidaciÃ³n** (Server Action) recorre por colaborador: salario proporcional â†’ aux. transporte automÃ¡tico (`salarioBase â‰¤ topeAuxTransporteSmmlv Ã— smmlv` del aÃ±o) â†’ horas extra/recargos valorados con `RecargoVigencia` vigente a la **fecha de cada registro** (clave para el cambio del 1â€‘julâ€‘2026 a 90%) â†’ comisiones/bonificaciones constitutivas â†’ incapacidades/licencias (ajuste de dÃ­as) â†’ deducciones legales + cuotas de prÃ©stamo â†’ aportes y provisiones. Cada lÃ­nea queda en `DetalleNomina` con trazabilidad a su origen. El archivo PILA y el desprendible PDF se generan desde estas tablas.

---

## 5. Novedades

```prisma
enum TipoIncapacidad   { ENFERMEDAD_GENERAL ACCIDENTE_TRABAJO ENFERMEDAD_LABORAL }
enum EstadoRecobro     { NO_APLICA POR_RADICAR RADICADA RECONOCIDA PAGADA NEGADA }
model Incapacidad {
  id                String   @id @default(uuid(7)) @db.Uuid
  colaboradorId     String   @db.Uuid
  tipo              TipoIncapacidad
  fechaInicio       DateTime @db.Date
  fechaFin          DateTime @db.Date
  dias              Int
  codigoDiagnostico String?            // CIE-10 â€” DATO SENSIBLE: visible solo a SST/RRHH (permiso especial)
  prorrogaDeId      String?  @db.Uuid  // self-FK: encadena prÃ³rrogas
  accidenteId       String?  @db.Uuid  // FK AccidenteTrabajo si tipo = ACCIDENTE_TRABAJO
  estadoRecobro     EstadoRecobro @default(POR_RADICAR)
  valorReconocido   Decimal? @db.Decimal(14,2)
  // soporte escaneado obligatorio â†’ Documento
  @@index([colaboradorId, fechaInicio])
}

enum TipoLicencia {
  MATERNIDAD PATERNIDAD LUTO MATRIMONIO CALAMIDAD_DOMESTICA
  JURADO_VOTACION DIA_DE_LA_FAMILIA NO_REMUNERADA OTRA_REMUNERADA
}
model Licencia {
  id            String   @id @default(uuid(7)) @db.Uuid
  colaboradorId String   @db.Uuid
  tipo          TipoLicencia
  fechaInicio   DateTime @db.Date
  fechaFin      DateTime @db.Date
  dias          Decimal  @db.Decimal(5,2)
  remunerada    Boolean
  observaciones String?
  @@index([colaboradorId, fechaInicio])
}

enum EstadoAprobacion { SOLICITADO APROBADO RECHAZADO }
model Permiso {
  id            String   @id @default(uuid(7)) @db.Uuid
  colaboradorId String   @db.Uuid
  fecha         DateTime @db.Date
  diaCompleto   Boolean  @default(false)
  horaInicio    String?            // "08:00" si no es dÃ­a completo
  horaFin       String?
  motivo        String
  remunerado    Boolean  @default(true)
  estado        EstadoAprobacion @default(SOLICITADO)
  aprobadoPorId String?  @db.Uuid
  solicitudId   String?  @db.Uuid  // si naciÃ³ en autoservicio
  @@index([colaboradorId, fecha])
}

enum TipoVacaciones   { DISFRUTE COMPENSADAS_DINERO }
enum EstadoVacaciones { SOLICITADAS APROBADAS EN_DISFRUTE DISFRUTADAS CANCELADAS }
model Vacaciones {
  id            String   @id @default(uuid(7)) @db.Uuid
  colaboradorId String   @db.Uuid
  tipo          TipoVacaciones @default(DISFRUTE)
  fechaInicio   DateTime @db.Date
  fechaFin      DateTime @db.Date
  diasHabiles   Decimal  @db.Decimal(5,2)
  valorPagado   Decimal? @db.Decimal(14,2)
  estado        EstadoVacaciones @default(SOLICITADAS)
  solicitudId   String?  @db.Uuid
  aprobadoPorId String?  @db.Uuid
  @@index([colaboradorId, estado])
}
// Ajustes de saldo (migraciÃ³n inicial desde Excel, correcciones):
model AjusteVacaciones {
  id            String   @id @default(uuid(7)) @db.Uuid
  colaboradorId String   @db.Uuid
  fecha         DateTime @db.Date
  dias          Decimal  @db.Decimal(6,2)   // + causa / âˆ’ descuenta
  motivo        String
}
```

**Saldo de vacaciones** = vista SQL `v_saldo_vacaciones` (no tabla, evita desincronizaciÃ³n):
`causados = dÃ­as_calendario(fechaIngreso â†’ hoy) Ã— 15/360 + Î£ AjusteVacaciones.dias` Â· `disfrutados = Î£ Vacaciones.diasHabiles donde estado âˆˆ (EN_DISFRUTE, DISFRUTADAS) + COMPENSADAS pagadas` Â· `pendientes = causados âˆ’ disfrutados`.

```prisma
enum EstadoPagoBono { PENDIENTE PAGADO }
model Bonificacion {
  id                    String   @id @default(uuid(7)) @db.Uuid
  colaboradorId         String   @db.Uuid
  concepto              String
  valor                 Decimal  @db.Decimal(14,2)
  constitutivoSalario   Boolean  @default(false)     // marca requerida por el cliente
  fechaCausacion        DateTime @db.Date
  estadoPago            EstadoPagoBono @default(PENDIENTE)
  fechaPago             DateTime? @db.Date
  pagadaEnLiquidacionId String?  @db.Uuid            // null + fechaPago â‡’ pago externo con soporte (Documento)
  @@index([colaboradorId, estadoPago])
}

enum MotivoVariacionSalarial { INCREMENTO_LEGAL MERITO PROMOCION AJUSTE_MERCADO OTRO }
model VariacionSalarial {
  id              String   @id @default(uuid(7)) @db.Uuid
  colaboradorId   String   @db.Uuid
  contratoId      String   @db.Uuid
  otrosiId        String?  @db.Uuid
  fechaEfectiva   DateTime @db.Date
  salarioAnterior Decimal  @db.Decimal(14,2)
  salarioNuevo    Decimal  @db.Decimal(14,2)
  motivo          MotivoVariacionSalarial
  registradoPorId String   @db.Uuid
  @@index([colaboradorId, fechaEfectiva])             // histÃ³rico salarial ordenado
}
```

"Ingresos y desvinculaciones" son derivados: `Colaborador.fechaIngreso` y el mÃ³dulo de Terminaciones; el reporte de **rotaciÃ³n** se calcula sobre ellos. El **ausentismo** se calcula sobre `Incapacidad + Licencia + Permiso` (vista `v_ausentismo`).

---

## 6. Terminaciones

```prisma
enum TipoTerminacion {
  RENUNCIA_VOLUNTARIA MUTUO_ACUERDO CON_JUSTA_CAUSA SIN_JUSTA_CAUSA
  TERMINACION_ANTICIPADA VENCIMIENTO_PLAZO PERIODO_PRUEBA FIN_OBRA FIN_OPS
  FALLECIMIENTO RECONOCIMIENTO_PENSION
}
enum EstadoTerminacion { EN_PROCESO COMPLETADA }

model Terminacion {
  id                    String   @id @default(uuid(7)) @db.Uuid
  colaboradorId         String   @db.Uuid
  contratoId            String?  @db.Uuid     // laboralâ€¦
  contratoOpsId         String?  @db.Uuid     // â€¦u OPS (CHECK: exactamente uno, Â§12)
  tipo                  TipoTerminacion
  fechaNotificacion     DateTime @db.Date
  fechaEfectiva         DateTime @db.Date
  preavisoRequerido     Boolean  @default(false)
  preavisoDias          Int?
  indemnizacionAplica   Boolean  @default(false)
  indemnizacionValor    Decimal? @db.Decimal(14,2)
  motivoDetalle         String?
  procesoDisciplinarioId String? @db.Uuid     // si nace de justa causa con debido proceso
  examenEgresoId        String?  @db.Uuid     // FK ExamenMedico tipo EGRESO
  estado                EstadoTerminacion @default(EN_PROCESO)
  liquidacion           LiquidacionDefinitiva?
  pazYSalvo             PazYSalvo?
  // soportes (carta de renuncia, actas, carta de terminaciÃ³n) â†’ Documento polimÃ³rfico
  @@index([colaboradorId])
  @@index([fechaEfectiva])
}

enum ConceptoLiquidacionFinal {
  SALARIOS_PENDIENTES CESANTIAS INTERESES_CESANTIAS PRIMA_SERVICIOS
  VACACIONES_COMPENSADAS INDEMNIZACION BONIFICACIONES_PENDIENTES
  DEDUCCION_PRESTAMOS OTRAS_DEDUCCIONES OTRO
}
enum EstadoLiqDefinitiva { BORRADOR APROBADA PAGADA }
model LiquidacionDefinitiva {
  id               String   @id @default(uuid(7)) @db.Uuid
  terminacionId    String   @unique @db.Uuid
  fechaLiquidacion DateTime @db.Date
  salarioBase      Decimal  @db.Decimal(14,2)     // base de liquidaciÃ³n (promedios incluidos, calculada en app)
  totalPagar       Decimal  @db.Decimal(14,2)
  estado           EstadoLiqDefinitiva @default(BORRADOR)
  pdfPath          String?
  detalles         DetalleLiquidacionDefinitiva[]
}
model DetalleLiquidacionDefinitiva {
  id            String  @id @default(uuid(7)) @db.Uuid
  liquidacionId String  @db.Uuid                   // onDelete: Cascade
  concepto      ConceptoLiquidacionFinal
  base          Decimal? @db.Decimal(14,2)
  dias          Decimal? @db.Decimal(7,2)
  valor         Decimal  @db.Decimal(14,2)         // deducciones en negativo
}

// â€”â€”â€” Paz y salvo con checklist por Ã¡rea â€”â€”â€”
enum AreaPazYSalvo     { ACTIVOS_TI ACTIVOS_FISICOS CARTERA DOCUMENTOS_RRHH ACCESOS_Y_CORREOS NOMINA SST OTRA }
enum EstadoItemPyS     { PENDIENTE APROBADO CON_OBSERVACION }
model PazYSalvo {
  id            String  @id @default(uuid(7)) @db.Uuid
  terminacionId String  @unique @db.Uuid
  estado        String  @default("EN_TRAMITE")     // EN_TRAMITE | COMPLETO
  fechaCierre   DateTime? @db.Date
  items         PazYSalvoItem[]
  // documento firmado â†’ Documento polimÃ³rfico
}
model PazYSalvoItem {
  id             String  @id @default(uuid(7)) @db.Uuid
  pazYSalvoId    String  @db.Uuid                  // onDelete: Cascade
  areaResponsable AreaPazYSalvo
  descripcion    String                            // "PortÃ¡til devuelto", "Correo revocado"â€¦
  responsableId  String? @db.Uuid                  // Usuario que firma el Ã­tem
  estado         EstadoItemPyS @default(PENDIENTE)
  fechaRevision  DateTime?
  observaciones  String?
}
model PlantillaPazYSalvoItem {                      // checklist por defecto, configurable por Admin
  id              String  @id @default(uuid(7)) @db.Uuid
  areaResponsable AreaPazYSalvo
  descripcion     String
  orden           Int
  activa          Boolean @default(true)
}
```

Al crear la `Terminacion` se instancia el `PazYSalvo` con los Ã­tems de `PlantillaPazYSalvoItem`, se sugiere agendar el examen de egreso (crea `Vencimiento`) y, si hay `AsignacionActivo` abiertas o `Prestamo` con saldo, se agregan Ã­tems automÃ¡ticos.

---

## 7. Autoservicio, certificaciones, activos, dotaciÃ³n, capacitaciÃ³n, evaluaciÃ³n

```prisma
// â€”â€”â€” Solicitudes con flujo de aprobaciÃ³n configurable â€”â€”â€”
enum TipoSolicitud   { VACACIONES PERMISO LICENCIA CERTIFICACION_LABORAL OTRA }
enum EstadoSolicitud { PENDIENTE EN_APROBACION APROBADA RECHAZADA CANCELADA }
model Solicitud {
  id            String   @id @default(uuid(7)) @db.Uuid
  consecutivo   Int      @default(autoincrement()) @unique
  tipo          TipoSolicitud
  solicitanteId String   @db.Uuid                 // Colaborador
  datos         Json                              // payload tipado por tipo (fechas, motivo, tipo de certificadoâ€¦)
  estado        EstadoSolicitud @default(PENDIENTE)
  resueltaEn    DateTime?
  aprobaciones  PasoAprobacionSolicitud[]
  @@index([solicitanteId, estado])
}
enum EstadoPasoAprobacion { PENDIENTE APROBADO RECHAZADO OMITIDO }
model PasoAprobacionSolicitud {
  id           String  @id @default(uuid(7)) @db.Uuid
  solicitudId  String  @db.Uuid                   // onDelete: Cascade
  orden        Int
  rolId        String? @db.Uuid                   // aprueba cualquier usuario con ese rolâ€¦
  aprobadorId  String? @db.Uuid                   // â€¦o un usuario especÃ­fico (jefe inmediato resuelto al crear)
  estado       EstadoPasoAprobacion @default(PENDIENTE)
  fechaDecision DateTime?
  comentario   String?
  @@unique([solicitudId, orden])
}
model FlujoAprobacion {                            // config: VACACIONES â†’ [Jefe de Ã¡rea, RRHH/Subgerencia]
  id            String @id @default(uuid(7)) @db.Uuid
  tipoSolicitud TipoSolicitud @unique
  pasos         PasoFlujoAprobacion[]
}
model PasoFlujoAprobacion {
  id         String  @id @default(uuid(7)) @db.Uuid
  flujoId    String  @db.Uuid
  orden      Int
  rolId      String  @db.Uuid
  usaJefeInmediato Boolean @default(false)         // si true, se resuelve el jefe del solicitante
  @@unique([flujoId, orden])
}

// â€”â€”â€” Certificaciones laborales â€”â€”â€”
enum TipoCertificacion   { SIMPLE CON_SALARIO CON_FUNCIONES ENTIDAD_FINANCIERA }
enum EstadoCertificacion { SOLICITADA GENERADA ENTREGADA }
model CertificacionLaboral {
  id            String   @id @default(uuid(7)) @db.Uuid
  consecutivo   Int      @default(autoincrement()) @unique
  colaboradorId String   @db.Uuid
  solicitudId   String?  @db.Uuid
  tipo          TipoCertificacion
  dirigidaA     String?                            // "A quien interese" / nombre de la entidad
  estado        EstadoCertificacion @default(SOLICITADA)
  pdfPath       String?                            // PDF guardado en Storage
  generadaPorId String?  @db.Uuid
  generadaEn    DateTime?
  @@index([colaboradorId])
}

// â€”â€”â€” Activos â€”â€”â€”
enum CategoriaActivo { EQUIPO_COMPUTO CELULAR HERRAMIENTA MOBILIARIO VEHICULO OTRO }
enum EstadoActivo    { DISPONIBLE ASIGNADO EN_REPARACION DADO_DE_BAJA }
model Activo {
  id        String @id @default(uuid(7)) @db.Uuid
  codigo    String @unique                         // placa interna
  nombre    String
  categoria CategoriaActivo
  marca     String?
  modelo    String?
  serial    String?
  sedeId    String @db.Uuid
  valor     Decimal? @db.Decimal(14,2)
  estado    EstadoActivo @default(DISPONIBLE)
  @@index([sedeId, estado])
}
enum EstadoDevolucionActivo { BUEN_ESTADO CON_DANO PERDIDO }
model AsignacionActivo {
  id               String   @id @default(uuid(7)) @db.Uuid
  activoId         String   @db.Uuid
  colaboradorId    String   @db.Uuid
  fechaEntrega     DateTime @db.Date
  fechaDevolucion  DateTime? @db.Date
  estadoDevolucion EstadoDevolucionActivo?
  observaciones    String?
  // actas de entrega y devoluciÃ³n firmadas â†’ Documento polimÃ³rfico
  @@index([colaboradorId])
  @@index([activoId])
}

// â€”â€”â€” DotaciÃ³n legal (3 entregas/aÃ±o: 30-abr, 31-ago, 20-dic â†’ Vencimientos precargados) â€”â€”â€”
model EntregaDotacion {
  id            String   @id @default(uuid(7)) @db.Uuid
  colaboradorId String   @db.Uuid
  anio          Int
  numeroEntrega Int                                // 1 | 2 | 3
  fechaEntrega  DateTime @db.Date
  detalles      DetalleDotacion[]
  // soporte firmado â†’ Documento polimÃ³rfico
  @@unique([colaboradorId, anio, numeroEntrega])
}
model DetalleDotacion {
  id        String @id @default(uuid(7)) @db.Uuid
  entregaId String @db.Uuid                        // onDelete: Cascade
  elemento  String                                 // camisa, pantalÃ³n, calzadoâ€¦
  talla     String?
  cantidad  Int    @default(1)
}

// â€”â€”â€” Capacitaciones (RRHH y SST en una sola tabla; SST filtra por categoria) â€”â€”â€”
enum CategoriaCapacitacion { INDUCCION REINDUCCION TECNICA HABILIDADES SST BRIGADA OTRA }
enum ModalidadCapacitacion { PRESENCIAL VIRTUAL MIXTA }
model Capacitacion {
  id            String   @id @default(uuid(7)) @db.Uuid
  tema          String
  categoria     CategoriaCapacitacion
  fecha         DateTime
  duracionHoras Decimal  @db.Decimal(5,2)
  facilitador   String?
  sedeId        String?  @db.Uuid                  // null = todas las sedes
  modalidad     ModalidadCapacitacion @default(PRESENCIAL)
  asistencias   AsistenciaCapacitacion[]
  @@index([categoria, fecha])
}
model AsistenciaCapacitacion {
  id             String  @id @default(uuid(7)) @db.Uuid
  capacitacionId String  @db.Uuid                  // onDelete: Cascade
  colaboradorId  String  @db.Uuid
  asistio        Boolean @default(true)
  calificacion   Decimal? @db.Decimal(5,2)
  @@unique([capacitacionId, colaboradorId])
}

// â€”â€”â€” EvaluaciÃ³n de desempeÃ±o â€”â€”â€”
model PlantillaEvaluacion {
  id        String  @id @default(uuid(7)) @db.Uuid
  nombre    String
  criterios Json    // [{slug, nombre, peso, escala}]
  activa    Boolean @default(true)
}
enum EstadoEvaluacion { EN_CURSO COMPLETADA }
model EvaluacionDesempeno {
  id            String   @id @default(uuid(7)) @db.Uuid
  colaboradorId String   @db.Uuid                  // @relation("Evaluado")
  evaluadorId   String   @db.Uuid                  // @relation("Evaluador")
  plantillaId   String   @db.Uuid
  periodoInicio DateTime @db.Date
  periodoFin    DateTime @db.Date
  respuestas    Json                               // {criterioSlug: puntaje, â€¦}
  puntajeTotal  Decimal? @db.Decimal(6,2)
  fortalezas    String?
  oportunidades String?
  compromisos   String?
  estado        EstadoEvaluacion @default(EN_CURSO)
  @@index([colaboradorId, periodoFin])
}
```

---

## 8. JurÃ­dica y SST

### 8.1 JurÃ­dica

```prisma
// â€”â€”â€” Plantillas de documentos con variables â€”â€”â€”
enum TipoPlantilla {
  CONTRATO_TERMINO_FIJO CONTRATO_INDEFINIDO CONTRATO_OBRA_LABOR CONTRATO_APRENDIZAJE
  CONTRATO_OPS OTROSI PRORROGA CERTIFICACION_LABORAL CARTA_TERMINACION ACTA POLITICA OTRO
}
model PlantillaDocumento {
  id        String  @id @default(uuid(7)) @db.Uuid
  nombre    String
  tipo      TipoPlantilla
  contenido String                       // HTML/Markdown con variables {{colaborador.nombres}}, {{contrato.salarioBase}}â€¦
  variables Json                         // declaraciÃ³n de variables esperadas para validar el render
  version   Int     @default(1)
  activa    Boolean @default(true)
  @@unique([nombre, version])
}

// â€”â€”â€” Repositorio legal con control de versiones (RIT, polÃ­ticas, procedimientos, convenios, SG-SST) â€”â€”â€”
enum CategoriaDocLegal { POLITICA REGLAMENTO_INTERNO PROCEDIMIENTO CONTRATO_MARCO CONVENIO_COMERCIAL SGSST OTRO }
enum EstadoDocLegal    { BORRADOR VIGENTE OBSOLETO }
model DocumentoLegal {
  id            String   @id @default(uuid(7)) @db.Uuid
  titulo        String
  categoria     CategoriaDocLegal
  subtipo       String?              // SGSST: "POLITICA_SST", "PLAN_TRABAJO_ANUAL", "MATRIZ_LEGAL",
                                     // "PLAN_EMERGENCIAS", "PROFESIOGRAMA"â€¦ Â· CONVENIO: "Addi", "PayJoy"â€¦
  responsableId String?  @db.Uuid    // Usuario dueÃ±o del documento
  sedeId        String?  @db.Uuid    // null = corporativo
  vigenciaInicio DateTime? @db.Date
  vigenciaFin   DateTime? @db.Date   // â†’ Vencimiento (convenios financieras, pÃ³lizas, licencias SaaSâ€¦)
  estado        EstadoDocLegal @default(BORRADOR)
  versiones     VersionDocumentoLegal[]
  @@index([categoria, estado])
}
model VersionDocumentoLegal {
  id              String   @id @default(uuid(7)) @db.Uuid
  documentoId     String   @db.Uuid               // onDelete: Cascade
  numeroVersion   Int
  archivoPath     String                          // PDF firmado en Storage
  resumenCambios  String?
  aprobadaPorId   String?  @db.Uuid
  fechaAprobacion DateTime? @db.Date
  esVigente       Boolean  @default(false)        // Ãºnica por documento (Ã­ndice parcial Â§12)
  @@unique([documentoId, numeroVersion])
}

// â€”â€”â€” Proceso disciplinario con etapas (debido proceso del RIT) â€”â€”â€”
enum EstadoProcesoDisciplinario { ABIERTO EN_CITACION EN_DESCARGOS EN_ANALISIS DECIDIDO EN_RECURSO CERRADO ARCHIVADO }
enum ResultadoDisciplinario     { ARCHIVADO LLAMADO_DE_ATENCION SUSPENSION TERMINACION_JUSTA_CAUSA }
enum EtapaDisciplinaria         { CITACION DESCARGOS PRACTICA_PRUEBAS DECISION RECURSO }
model ProcesoDisciplinario {
  id            String   @id @default(uuid(7)) @db.Uuid
  consecutivo   Int      @default(autoincrement()) @unique
  colaboradorId String   @db.Uuid
  fechaApertura DateTime @db.Date
  hechos        String
  estado        EstadoProcesoDisciplinario @default(ABIERTO)
  resultado     ResultadoDisciplinario?
  terminacionId String?  @db.Uuid
  etapas        EtapaProcesoDisciplinario[]
  @@index([colaboradorId])
}
model EtapaProcesoDisciplinario {
  id              String   @id @default(uuid(7)) @db.Uuid
  procesoId       String   @db.Uuid               // onDelete: Cascade
  etapa           EtapaDisciplinaria
  fechaProgramada DateTime? @db.Date              // citaciÃ³n a descargos â†’ Vencimiento/alerta
  fechaRealizada  DateTime? @db.Date
  descripcion     String?
  responsableId   String?  @db.Uuid
  // actas y soportes de cada etapa â†’ Documento polimÃ³rfico (entidadTipo="EtapaProcesoDisciplinario")
  @@unique([procesoId, etapa])
}

// â€”â€”â€” Canal de denuncias anti-acoso (Ley 2466: un solo acto puede configurar acoso) â€”â€”â€”
enum CanalDenuncia  { FORMULARIO_WEB CORREO VERBAL ANONIMO }
enum EstadoDenuncia { RECIBIDA EN_COMITE_CONVIVENCIA EN_INVESTIGACION MEDIDAS_ADOPTADAS CERRADA }
model DenunciaAcoso {
  id            String   @id @default(uuid(7)) @db.Uuid
  codigo        String   @unique                  // cÃ³digo de radicado para seguimiento anÃ³nimo
  canal         CanalDenuncia
  fechaRecepcion DateTime
  denuncianteId String?  @db.Uuid                 // null si anÃ³nima  @relation("Denunciante")
  denunciadoId  String?  @db.Uuid                 // @relation("Denunciado")
  hechos        String                            // ACCESO RESTRINGIDO: solo ComitÃ© Convivencia + JurÃ­dica
  estado        EstadoDenuncia @default(RECIBIDA)
  actuaciones   ActuacionDenuncia[]
}
model ActuacionDenuncia {
  id          String   @id @default(uuid(7)) @db.Uuid
  denunciaId  String   @db.Uuid                   // onDelete: Cascade
  fecha       DateTime
  descripcion String
  actorId     String?  @db.Uuid
}

// â€”â€”â€” Habeas data (Ley 1581) â€”â€”â€”
enum TipoTitularDatos { COLABORADOR CANDIDATO CLIENTE PROVEEDOR OTRO }
enum EstadoAutorizacion { VIGENTE REVOCADA }
model AutorizacionDatos {
  id               String   @id @default(uuid(7)) @db.Uuid
  titularTipo      TipoTitularDatos
  colaboradorId    String?  @db.Uuid               // si el titular es colaborador
  nombreTitular    String
  documentoTitular String
  fechaOtorgada    DateTime @db.Date
  finalidades      String                          // texto de la autorizaciÃ³n
  medio            String                          // FISICO | DIGITAL
  estado           EstadoAutorizacion @default(VIGENTE)
  fechaRevocacion  DateTime? @db.Date
  // soporte firmado â†’ Documento polimÃ³rfico
  @@index([colaboradorId])
}
enum TipoSolicitudDatos   { CONSULTA RECLAMO RECTIFICACION SUPRESION }
enum EstadoSolicitudDatos { RADICADA EN_TRAMITE RESPONDIDA }
model ConsultaReclamoDatos {                       // alimenta el reporte semestral SIC (20-feb / 20-ago)
  id                  String   @id @default(uuid(7)) @db.Uuid
  tipo                TipoSolicitudDatos
  nombreTitular       String
  documentoTitular    String?
  fechaRadicacion     DateTime @db.Date
  fechaLimiteRespuesta DateTime @db.Date           // 10/15 dÃ­as hÃ¡biles â†’ Vencimiento
  estado              EstadoSolicitudDatos @default(RADICADA)
  respuesta           String?
  respondidoPorId     String?  @db.Uuid
  fechaRespuesta      DateTime? @db.Date
}

// â€”â€”â€” Calendario de obligaciones legales â€”â€”â€”
enum CategoriaObligacion {
  CORPORATIVA TRIBUTARIA LABORAL_SEGURIDAD_SOCIAL PROTECCION_DATOS
  CONSUMIDOR_GARANTIAS CONVENIOS_FINANCIERAS SST PROPIEDAD_INTELECTUAL
  LICENCIAS_PERMISOS ARRIENDOS_POLIZAS OTRA
}
enum PeriodicidadObligacion { MENSUAL BIMESTRAL TRIMESTRAL SEMESTRAL ANUAL CADA_DOS_ANIOS UNICA POR_EVENTO }
model ObligacionLegal {
  id               String   @id @default(uuid(7)) @db.Uuid
  nombre           String                           // "RenovaciÃ³n matrÃ­cula mercantil â€” Sede Norte"
  descripcion      String?
  categoria        CategoriaObligacion
  entidad          String?                          // DIAN, CCB, SIC, UGPP, municipioâ€¦
  periodicidad     PeriodicidadObligacion
  reglaVencimiento Json?                            // {dia:31, mes:3} | {diaHabilSegunNit:true} | null si manual
  responsableId    String   @db.Uuid                // Usuario
  sedeId           String?  @db.Uuid                // matrÃ­cula por sede, ICA por municipioâ€¦
  ciudadId         String?  @db.Uuid
  diasAlertaPrimera Int     @default(10)            // el doc pide 5 hÃ¡biles + 1 dÃ­a para obligaciones: configurable
  diasAlertaUltima  Int     @default(3)
  activa           Boolean  @default(true)
  cumplimientos    CumplimientoObligacion[]
  @@index([categoria, activa])
  @@index([sedeId])
}
enum EstadoCumplimiento { PENDIENTE CUMPLIDA VENCIDA }
model CumplimientoObligacion {                      // instancia por periodo, generada por el cron
  id               String   @id @default(uuid(7)) @db.Uuid
  obligacionId     String   @db.Uuid
  etiquetaPeriodo  String                           // "2026-03", "Anual 2026", "Semestre I-2026"
  fechaVencimiento DateTime @db.Date                // â†’ Vencimiento (motor de alertas)
  fechaCumplimiento DateTime? @db.Date
  cumplidaPorId    String?  @db.Uuid
  estado           EstadoCumplimiento @default(PENDIENTE)
  observaciones    String?
  // soporte de cumplimiento (pago, radicado) â†’ Documento polimÃ³rfico
  @@unique([obligacionId, etiquetaPeriodo])
  @@index([estado, fechaVencimiento])
}
```

**Seed de obligaciones** (todas las del documento): matrÃ­cula mercantil por sede (31â€‘mar), asamblea ordinaria (31â€‘mar), renta, IVA, retefuente, ICA por `ciudadId`, exÃ³gena, RUT/RUB, PILA, cesantÃ­as (14â€‘feb), intereses (31â€‘ene), primas (30â€‘jun/20â€‘dic), UGPP, RNBD (2â€‘eneâ†’31â€‘mar), reporte semestral SIC (20â€‘feb/20â€‘ago), autoevaluaciÃ³n SST, COPASST/Convivencia (CADA_DOS_ANIOS), arriendos y pÃ³lizas por sede, marca SIC (10 aÃ±os â†’ `reglaVencimiento` con fecha fija), dominios, licencias SaaS, firma digital, uso de suelo/bomberos/Sayco&Acinpro por sede, convenios Addi/Banco de BogotÃ¡/Sumas Pay/PayJoy/Krediya (categorÃ­a CONVENIOS_FINANCIERAS; su contrato vive en `DocumentoLegal` categorÃ­a CONVENIO_COMERCIAL con `vigenciaFin`).

### 8.2 SST (Decreto 1072/2015, ResoluciÃ³n 0312/2019)

```prisma
// Documentos SG-SST (polÃ­tica firmada, plan anual, matriz legal, plan de emergencias, profesiograma)
// â†’ se gestionan en DocumentoLegal (categoria = SGSST, subtipo) reutilizando el versionado. Adicionales:

enum ValoracionAutoevaluacion { CRITICO MODERADAMENTE_ACEPTABLE ACEPTABLE }   // <60 / 60-85 / >85
model AutoevaluacionSst {
  id            String  @id @default(uuid(7)) @db.Uuid
  anio          Int     @unique
  puntaje       Decimal @db.Decimal(5,2)     // estÃ¡ndares mÃ­nimos Res. 0312
  valoracion    ValoracionAutoevaluacion
  detalleItems  Json                          // [{item, valorMaximo, valorObtenido, cumple}]
  // plan de mejora â†’ Documento polimÃ³rfico
}

// â€”â€”â€” ComitÃ©s (COPASST / Convivencia / VigÃ­a / Brigada) â€”â€”â€”
enum TipoComite   { COPASST COMITE_CONVIVENCIA VIGIA_SST BRIGADA_EMERGENCIA }
enum EstadoComite { ACTIVO VENCIDO DISUELTO }
model Comite {
  id                String   @id @default(uuid(7)) @db.Uuid
  tipo              TipoComite
  sedeId            String?  @db.Uuid              // null = nacional
  fechaConformacion DateTime @db.Date
  fechaVencimiento  DateTime @db.Date              // +2 aÃ±os â†’ Vencimiento (renovaciÃ³n)
  estado            EstadoComite @default(ACTIVO)
  miembros          MiembroComite[]
  reuniones         ReunionComite[]
  // acta de conformaciÃ³n â†’ Documento
}
enum RolMiembroComite { PRESIDENTE SECRETARIO PRINCIPAL_EMPLEADOR PRINCIPAL_TRABAJADORES SUPLENTE }
model MiembroComite {
  id            String   @id @default(uuid(7)) @db.Uuid
  comiteId      String   @db.Uuid                  // onDelete: Cascade
  colaboradorId String   @db.Uuid
  rolMiembro    RolMiembroComite
  fechaInicio   DateTime @db.Date
  fechaFin      DateTime? @db.Date
}
model ReunionComite {
  id          String   @id @default(uuid(7)) @db.Uuid
  comiteId    String   @db.Uuid
  fecha       DateTime
  tipo        String   @default("ORDINARIA")       // ORDINARIA | EXTRAORDINARIA
  asistentes  Json                                  // [{colaboradorId, asistio}]
  compromisos CompromisoReunion[]
  // acta firmada â†’ Documento
  @@index([comiteId, fecha])
}
model CompromisoReunion {
  id            String   @id @default(uuid(7)) @db.Uuid
  reunionId     String   @db.Uuid                  // onDelete: Cascade
  descripcion   String
  responsableId String   @db.Uuid
  fechaLimite   DateTime @db.Date                  // â†’ Vencimiento
  estado        String   @default("PENDIENTE")     // PENDIENTE | CUMPLIDO | VENCIDO
}

// â€”â€”â€” Matriz IPEVR (GTC-45) por sede â€”â€”â€”
enum ClasePeligro        { BIOLOGICO FISICO QUIMICO PSICOSOCIAL BIOMECANICO CONDICIONES_SEGURIDAD FENOMENOS_NATURALES }
enum InterpretacionRiesgo { I_NO_ACEPTABLE II_ACEPTABLE_CON_CONTROL III_MEJORABLE IV_ACEPTABLE }
model PeligroIpevr {
  id                  String  @id @default(uuid(7)) @db.Uuid
  sedeId              String  @db.Uuid              // matriz POR SEDE (requisito)
  proceso             String                        // proceso/actividad/tarea
  clasePeligro        ClasePeligro
  descripcionPeligro  String
  efectosPosibles     String?
  controlFuente       String?
  controlMedio        String?
  controlIndividuo    String?
  nivelDeficiencia    Int
  nivelExposicion     Int
  nivelConsecuencia   Int
  nivelProbabilidad   Int                           // ND Ã— NE (app)
  nivelRiesgo         Int                           // NP Ã— NC (app)
  interpretacion      InterpretacionRiesgo
  medidasIntervencion String?
  responsableId       String? @db.Uuid
  fechaProximaRevision DateTime? @db.Date           // â†’ Vencimiento
  @@index([sedeId, clasePeligro])
}

model ProfesiogramaCargo {                          // exÃ¡menes requeridos por cargo
  id                 String @id @default(uuid(7)) @db.Uuid
  cargoId            String @unique @db.Uuid
  examenesRequeridos Json                           // [{tipo:"OPTOMETRIA", periodicidadMeses:12}, â€¦]
  periodicidadMeses  Int    @default(12)            // periÃ³dico ocupacional general
}

// â€”â€”â€” ExÃ¡menes mÃ©dicos ocupacionales â€”â€”â€”
enum TipoExamenMedico    { INGRESO PERIODICO EGRESO POST_INCAPACIDAD CAMBIO_DE_CARGO }
enum ConceptoAptitud     { APTO APTO_CON_RECOMENDACIONES NO_APTO APLAZADO }
model ExamenMedico {
  id              String   @id @default(uuid(7)) @db.Uuid
  colaboradorId   String   @db.Uuid
  tipo            TipoExamenMedico
  fechaRealizado  DateTime @db.Date
  ipsProveedor    String?
  concepto        ConceptoAptitud
  recomendaciones String?            // DATO SENSIBLE (salud): acceso solo SST/permiso especial
  restricciones   String?            // DATO SENSIBLE
  proximoExamen   DateTime? @db.Date // calculado con ProfesiogramaCargo â†’ Vencimiento (alerta)
  // certificado de aptitud â†’ Documento (nivelAcceso SST_MEDICO)
  @@index([colaboradorId, tipo])
  @@index([proximoExamen])
}
model RecomendacionMedica {                         // seguimiento de recomendaciones/restricciones
  id            String   @id @default(uuid(7)) @db.Uuid
  colaboradorId String   @db.Uuid
  examenId      String?  @db.Uuid
  descripcion   String
  fechaInicio   DateTime @db.Date
  fechaFin      DateTime? @db.Date
  estado        String   @default("VIGENTE")        // VIGENTE | CERRADA
}
enum TipoNovedadArl { INGRESO RETIRO TRASLADO_ARL CAMBIO_CENTRO_TRABAJO CAMBIO_CLASE_RIESGO }
model NovedadArl {
  id            String   @id @default(uuid(7)) @db.Uuid
  colaboradorId String   @db.Uuid
  tipo          TipoNovedadArl
  fecha         DateTime @db.Date
  detalle       String?
  // soporte â†’ Documento
}

// â€”â€”â€” Accidentes e incidentes (FURAT) â€”â€”â€”
enum TipoEventoSst   { ACCIDENTE_TRABAJO INCIDENTE ENFERMEDAD_LABORAL }
enum SeveridadEvento { INCIDENTE_SIN_LESION LEVE GRAVE MORTAL }
model AccidenteTrabajo {
  id               String   @id @default(uuid(7)) @db.Uuid
  consecutivo      Int      @default(autoincrement()) @unique
  colaboradorId    String   @db.Uuid
  sedeId           String   @db.Uuid
  tipo             TipoEventoSst
  severidad        SeveridadEvento
  fechaHoraEvento  DateTime
  lugar            String
  descripcion      String
  parteCuerpo      String?
  agenteLesion     String?
  mecanismo        String?
  furatNumero      String?
  furatFecha       DateTime? @db.Date               // lÃ­mite legal: 2 dÃ­as hÃ¡biles â†’ Vencimiento al crear
  reportadoArl     Boolean  @default(false)
  diasIncapacidad  Int      @default(0)             // sincronizado con Incapacidad.accidenteId
  investigacion    InvestigacionAccidente?
  @@index([sedeId, fechaHoraEvento])                // estadÃ­sticas / indicadores
}
model InvestigacionAccidente {
  id               String   @id @default(uuid(7)) @db.Uuid
  accidenteId      String   @unique @db.Uuid
  fechaInvestigacion DateTime @db.Date              // lÃ­mite: 15 dÃ­as â†’ Vencimiento
  metodologia      String?
  causasInmediatas Json
  causasBasicas    Json
  equipoInvestigador Json                           // [{colaboradorId, rol}]
  lecciones        String?
  acciones         AccionCorrectiva[]
}
model AccionCorrectiva {                            // tambiÃ©n usada por inspecciones (origen polimÃ³rfico)
  id              String   @id @default(uuid(7)) @db.Uuid
  origenTipo      String                            // "InvestigacionAccidente" | "InspeccionSst" | "AutoevaluacionSst"
  origenId        String   @db.Uuid
  descripcion     String
  responsableId   String   @db.Uuid
  fechaLimite     DateTime @db.Date                 // â†’ Vencimiento
  estado          String   @default("PENDIENTE")    // PENDIENTE | EN_CURSO | CERRADA | VERIFICADA
  fechaCierre     DateTime? @db.Date
  @@index([origenTipo, origenId])
}

// â€”â€”â€” Inspecciones â€”â€”â€”
enum TipoInspeccion { LOCATIVA EXTINTORES BOTIQUINES EPP ORDEN_Y_ASEO ELECTRICA OTRA }
model InspeccionSst {
  id            String   @id @default(uuid(7)) @db.Uuid
  sedeId        String   @db.Uuid
  tipo          TipoInspeccion
  fecha         DateTime @db.Date
  responsableId String   @db.Uuid
  hallazgos     Json                                // [{descripcion, prioridad, foto}] â€” acciones en AccionCorrectiva
  // formato diligenciado â†’ Documento
}

// â€”â€”â€” EPP â€”â€”â€”
model ElementoEpp {
  id           String @id @default(uuid(7)) @db.Uuid
  nombre       String @unique
  vidaUtilDias Int?                                 // para calcular reposiciÃ³n
}
model EntregaEpp {
  id            String   @id @default(uuid(7)) @db.Uuid
  colaboradorId String   @db.Uuid
  fecha         DateTime @db.Date
  detalles      DetalleEntregaEpp[]
  // soporte firmado â†’ Documento (requisito)
}
model DetalleEntregaEpp {
  id              String   @id @default(uuid(7)) @db.Uuid
  entregaId       String   @db.Uuid                 // onDelete: Cascade
  elementoId      String   @db.Uuid
  cantidad        Int      @default(1)
  talla           String?
  fechaReposicion DateTime? @db.Date                // fecha + vidaUtilDias â†’ Vencimiento
}

// â€”â€”â€” Indicadores (tablero SST) â€”â€”â€”
model DatoMensualSst {                              // insumos para IF/IS/ausentismo
  id              String @id @default(uuid(7)) @db.Uuid
  anio            Int
  mes             Int
  sedeId          String? @db.Uuid                  // null = consolidado
  numTrabajadores Int
  horasHombre     Decimal @db.Decimal(12,2)
  @@unique([anio, mes, sedeId])
}
enum TipoIndicadorSst { FRECUENCIA SEVERIDAD AUSENTISMO MORTALIDAD CUMPLIMIENTO_PLAN COBERTURA_CAPACITACION }
model IndicadorSst {                                // snapshot mensual calculado por el cron (auditable)
  id          String  @id @default(uuid(7)) @db.Uuid
  anio        Int
  mes         Int
  sedeId      String? @db.Uuid
  tipo        TipoIndicadorSst
  numerador   Decimal @db.Decimal(14,4)
  denominador Decimal @db.Decimal(14,4)
  valor       Decimal @db.Decimal(14,4)
  meta        Decimal? @db.Decimal(14,4)
  @@unique([anio, mes, sedeId, tipo])
}
```

El **semÃ¡foro de cumplimiento documental SST** se deriva de: `DocumentoLegal` categorÃ­a SGSST con versiÃ³n vigente, `Comite` activos no vencidos, `CumplimientoObligacion` SST y `Vencimiento` abiertos.

---

## 9. Patrones transversales

### 9.1 Documentos polimÃ³rficos (cualquier entidad â†’ N archivos en Supabase Storage)

```prisma
enum NivelAccesoDocumento { GENERAL RRHH SST_MEDICO JURIDICA ADMIN }
model TipoDocumentoArchivo {                        // catÃ¡logo administrable
  id                 String  @id @default(uuid(7)) @db.Uuid
  nombre             String  @unique               // "CÃ©dula", "RUT", "Planilla SS", "Acta entrega"â€¦
  requiereVencimiento Boolean @default(false)
  nivelAcceso        NivelAccesoDocumento @default(GENERAL)
}
model DocumentoRequerido {                          // checklist documental por tipo de vÃ­nculo (semÃ¡foro)
  id            String      @id @default(uuid(7)) @db.Uuid
  tipoVinculo   TipoVinculo
  tipoDocumentoId String    @db.Uuid
  obligatorio   Boolean     @default(true)
  @@unique([tipoVinculo, tipoDocumentoId])
}
model Documento {
  id              String   @id @default(uuid(7)) @db.Uuid
  entidadTipo     String                            // nombre del modelo: "Colaborador", "Contrato", "CuentaCobroOps"â€¦
  entidadId       String   @db.Uuid
  tipoDocumentoId String?  @db.Uuid
  nombre          String
  descripcion     String?
  bucket          String   @default("documentos")   // bucket privado de Supabase Storage (URLs firmadas)
  storagePath     String                            // ej: colaborador/{id}/{uuid}.pdf
  mimeType        String
  tamanoBytes     Int
  fechaVencimiento DateTime? @db.Date               // si se setea â†’ trigger app crea/actualiza Vencimiento
  nivelAcceso     NivelAccesoDocumento @default(GENERAL)
  sedeId          String?  @db.Uuid                 // DESNORMALIZADO desde la entidad dueÃ±a (filtro por sede)
  subidoPorId     String   @db.Uuid
  @@index([entidadTipo, entidadId])
  @@index([fechaVencimiento])
  @@index([sedeId])
}
```

Acceso a archivos siempre vÃ­a Server Action que valida `nivelAcceso` + alcance de sede y emite **URL firmada** de corta duraciÃ³n (los buckets son privados; sin RLS pÃºblico).

### 9.2 Motor de vencimientos/alertas + notificaciones (app, email, WhatsApp preparado)

```prisma
enum OrigenVencimiento {
  DOCUMENTO CONTRATO_FIJO PERIODO_PRUEBA EXAMEN_MEDICO OBLIGACION_LEGAL
  CUENTA_COBRO_SS COMITE COMPROMISO_REUNION ACCION_CORRECTIVA EPP DOTACION
  HABEAS_DATA PROCESO_DISCIPLINARIO MODULO_PERSONALIZADO MANUAL
}
enum EstadoVencimiento { PENDIENTE PRIMERA_ALERTA_ENVIADA ULTIMA_ALERTA_ENVIADA VENCIDO RESUELTO CANCELADO }
model Vencimiento {
  id               String   @id @default(uuid(7)) @db.Uuid
  origen           OrigenVencimiento
  entidadTipo      String                           // referencia polimÃ³rfica a la fila fuente
  entidadId        String   @db.Uuid
  titulo           String                           // "Vence contrato fijo CT-2026-0014 â€” Juan PÃ©rez"
  fechaVencimiento DateTime @db.Date
  diasPrimeraAlerta Int     @default(10)            // por defecto global 10/3; obligaciones legales 5/1
  diasUltimaAlerta  Int     @default(3)
  enDiasHabiles    Boolean  @default(true)          // excluye domingos y festivos CO
  responsableId    String?  @db.Uuid                // Usuario que recibe la alerta (ademÃ¡s de RRHH/Admin)
  sedeId           String?  @db.Uuid                // DESNORMALIZADO
  estado           EstadoVencimiento @default(PENDIENTE)
  resueltoEn       DateTime?
  @@unique([entidadTipo, entidadId, origen])        // un vencimiento activo por fuente
  @@index([estado, fechaVencimiento])
  @@index([sedeId, estado])
}

model DiaFestivo {                                  // festivos de Colombia (Ley Emiliani) â€” seed por aÃ±o
  fecha  DateTime @id @db.Date
  nombre String
}
// Seed generado con la librerÃ­a npm `festivos-colombianos` (o cÃ¡lculo propio Emiliani) al crear cada aÃ±o.

enum CanalNotificacion { APP EMAIL WHATSAPP }
enum EstadoEnvio       { PENDIENTE ENVIADA FALLIDA }
model Notificacion {
  id            String   @id @default(uuid(7)) @db.Uuid
  usuarioId     String   @db.Uuid
  titulo        String
  mensaje       String
  vencimientoId String?  @db.Uuid
  entidadTipo   String?                             // deep-link en la PWA
  entidadId     String?  @db.Uuid
  leida         Boolean  @default(false)
  envios        NotificacionEnvio[]
  @@index([usuarioId, leida, creadoEn])
}
model NotificacionEnvio {                           // WhatsApp queda â€œpreparadoâ€: mismo registro, otro canal
  id             String   @id @default(uuid(7)) @db.Uuid
  notificacionId String   @db.Uuid                  // onDelete: Cascade
  canal          CanalNotificacion
  estado         EstadoEnvio @default(PENDIENTE)
  proveedorRef   String?                            // id de Resend / id de mensaje del proveedor WhatsApp
  respuesta      Json?
  enviadaEn      DateTime?
}
```

**Cron diario (Vercel Cron, `/api/cron/alertas`)**: para cada `Vencimiento` no resuelto calcula `diasRestantes` (si `enDiasHabiles`, contando con `DiaFestivo` y excluyendo domingos); si `diasRestantes â‰¤ diasPrimeraAlerta` y estado `PENDIENTE` â†’ crea `Notificacion` + `NotificacionEnvio(APP)` + `NotificacionEnvio(EMAIL)` (Resend) y pasa a `PRIMERA_ALERTA_ENVIADA`; Ã­dem para la Ãºltima alerta; si `fechaVencimiento < hoy` â†’ `VENCIDO` (sigue visible en el semÃ¡foro). El mismo cron genera instancias futuras de `CumplimientoObligacion` y los `Vencimiento` de dotaciÃ³n (30â€‘abr/31â€‘ago/20â€‘dic) y exÃ¡menes periÃ³dicos.

### 9.3 AuditorÃ­a

```prisma
enum AccionAuditoria { CREAR ACTUALIZAR ELIMINAR APROBAR RECHAZAR DESCARGAR INICIAR_SESION CERRAR_SESION IMPORTAR }
model AuditLog {
  id          String   @id @default(uuid(7)) @db.Uuid
  actorId     String?  @db.Uuid                     // null en acciones de sistema (cron)
  actorEmail  String?                               // snapshot (sobrevive a borrado del usuario)
  accion      AccionAuditoria
  entidadTipo String
  entidadId   String?  @db.Uuid
  diff        Json?                                 // {antes:{...}, despues:{...}} â€” campos sensibles enmascarados
  ip          String?
  userAgent   String?
  creadoEn    DateTime @default(now())              // sin actualizadoEn: tabla append-only
  @@index([entidadTipo, entidadId])
  @@index([actorId, creadoEn])
}
```

ImplementaciÃ³n: **Prisma Client Extension** (`$extends` sobre `create/update/delete/upsert/deleteMany/updateMany`) que escribe el `AuditLog` en la misma transacciÃ³n, con el actor inyectado desde la sesiÃ³n (AsyncLocalStorage en Server Actions). Campos enmascarados en `diff`: `numeroCuenta`, `codigoDiagnostico`, `recomendaciones`, `restricciones`, `hechos` de denuncias.

### 9.4 MÃ³dulos personalizados (creados por el Administrador)

```prisma
enum TipoCampoModulo { TEXTO TEXTO_LARGO NUMERO DECIMAL MONEDA FECHA BOOLEANO OPCION MULTI_OPCION COLABORADOR ARCHIVO }
model ModuloPersonalizado {
  id          String  @id @default(uuid(7)) @db.Uuid
  nombre      String
  slug        String  @unique                       // ruta: /m/[slug]
  icono       String?                               // nombre de Ã­cono lucide
  descripcion String?
  llevaSede   Boolean @default(true)                // si true, RegistroModulo.sedeId es obligatorio
  activo      Boolean @default(true)
  creadoPorId String  @db.Uuid
  campos      CampoModulo[]
  registros   RegistroModulo[]
}
model CampoModulo {
  id                String  @id @default(uuid(7)) @db.Uuid
  moduloId          String  @db.Uuid                // onDelete: Cascade
  nombre            String
  slug              String                          // clave dentro del JSONB
  tipo              TipoCampoModulo
  opciones          Json?                           // ["OpciÃ³n A","OpciÃ³n B"] para OPCION/MULTI_OPCION
  requerido         Boolean @default(false)
  orden             Int
  // â€” Enlace al motor de alertas (solo tipo FECHA) â€”
  generaAlerta      Boolean @default(false)
  diasAlertaPrimera Int?                            // si null usa el global (10)
  diasAlertaUltima  Int?
  @@unique([moduloId, slug])
}
model RegistroModulo {
  id          String  @id @default(uuid(7)) @db.Uuid
  moduloId    String  @db.Uuid
  sedeId      String? @db.Uuid                      // obligatorio si ModuloPersonalizado.llevaSede (validaciÃ³n app)
  datos       Json                                  // {slugCampo: valor, â€¦} â€” validado contra CampoModulo en Server Action
  creadoPorId String  @db.Uuid
  @@index([moduloId])
  @@index([sedeId])
  // GIN sobre datos en migraciÃ³n SQL (Â§12)
}
```

Al guardar un `RegistroModulo`, la Server Action: valida `datos` contra los `CampoModulo` (zod dinÃ¡mico); para cada campo `FECHA` con `generaAlerta` hace upsert de `Vencimiento(origen=MODULO_PERSONALIZADO, entidadTipo="RegistroModulo", entidadId=registro.id)` con los offsets del campo; los campos `ARCHIVO` guardan en `Documento` (`entidadTipo="RegistroModulo"`) y en `datos` solo el `documentoId`; los campos `COLABORADOR` guardan el uuid del colaborador.

### 9.5 Importador masivo

```prisma
enum EstadoImportacion { CARGADA VALIDADA PROCESADA CON_ERRORES }
model ImportacionDatos {
  id           String  @id @default(uuid(7)) @db.Uuid
  tipo         String                               // "COLABORADORES" (extensible)
  archivoPath  String                               // Excel/CSV original en Storage
  totalFilas   Int
  filasExitosas Int    @default(0)
  filasFallidas Int    @default(0)
  errores      Json?                                // [{fila, columna, error}]
  estado       EstadoImportacion @default(CARGADA)
  usuarioId    String  @db.Uuid
}
```

---

## 10. SeparaciÃ³n por sede/ciudad (cÃ³mo se modela)

1. **JerarquÃ­a**: `Ciudad 1â€”N Sede`. Toda consulta "por ciudad" es un join `Sede â†’ Ciudad` (no se duplica `ciudadId` en entidades).
2. **Tres patrones de pertenencia a sede**:
   - **Directa** (`sedeId NOT NULL`): `Colaborador`, `Contrato`, `ContratoOps`, `Activo`, `LiquidacionNomina` (snapshot), `PeligroIpevr`, `AccidenteTrabajo`, `InspeccionSst`, `DatoMensualSst`.
   - **Directa opcional** (`sedeId NULL = corporativo/todas`): `ObligacionLegal`, `DocumentoLegal`, `Comite`, `Capacitacion`, `IndicadorSst`, `RegistroModulo`, `Area`/`Cargo` (corporativos por diseÃ±o).
   - **Derivada del colaborador** (sin columna propia, se filtra vÃ­a join): novedades (`Incapacidad`, `Licencia`, `Permiso`, `Vacaciones`, `Bonificacion`), `Prestamo`, `ExamenMedico`, `EntregaDotacion`, `EntregaEpp`, `Solicitud`, `Terminacion`. Regla: **una sola fuente de verdad**; nunca duplicar `sedeId` en estas tablas para evitar desincronizaciÃ³n al trasladar a alguien.
   - **ExcepciÃ³n desnormalizada** (rendimiento de listados/semÃ¡foros masivos): `Documento.sedeId`, `Vencimiento.sedeId` y `LiquidacionNomina.sedeId` copian la sede de su entidad dueÃ±a **al momento del evento** (ademÃ¡s sirven como snapshot histÃ³rico). Se actualizan solo desde la Server Action dueÃ±a.
3. **Scoping de usuarios**: helper Ãºnico `sedesVisibles(usuario): string[] | "TODAS"` segÃºn `Rol.alcance` (`TODAS_SEDES` â†’ sin filtro; `SEDES_ASIGNADAS` â†’ `UsuarioSede`; `EQUIPO` â†’ sedes/colaboradores donde es `jefeInmediatoId`; `PROPIO` â†’ solo sus propios registros). Toda Server Action de lectura compone `where: { sedeId: { in: sedes } }` o el join equivalente. Los reportes agrupan siempre por `sedeId`/`ciudadId`.
4. Traslados de sede se formalizan con `OtrosiContrato (tipoCambio SEDE)` â†’ actualiza `Colaborador.sedeId` y deja histÃ³rico.

## 11. Modalidad de trabajo

`enum ModalidadTrabajo { PRESENCIAL REMOTO HIBRIDO TELETRABAJO }` vive en **tres puntos**: `Colaborador.modalidadTrabajo` (estado actual, lo que filtran los reportes "remotos"), `Contrato.modalidadTrabajo` / `ContratoOps` no aplica (lo **pactado** al firmar, snapshot inmutable) y el histÃ³rico de cambios en `OtrosiContrato` con `tipoCambio = MODALIDAD_TRABAJO`. DistinciÃ³n legal relevante: `TELETRABAJO` (Ley 1221, con auxilio e inclusiÃ³n en SGâ€‘SST/IPEVR del puesto en casa) vs `REMOTO` (Ley 2121); la app usa el enum para condicionar reglas (p. ej. auxilio de conectividad sustituye transporte para teletrabajadores que ganan â‰¤ 2 SMMLV â€” regla en motor de nÃ³mina, no en BD).

## 12. Ãndices y constraints clave (SQL crudo en la migraciÃ³n inicial, ademÃ¡s de los `@@index` ya listados)

```sql
-- Unicidad parcial: un solo contrato laboral ACTIVO por colaborador (Prisma no soporta Ã­ndices parciales)
CREATE UNIQUE INDEX uq_contrato_activo ON contrato (colaborador_id) WHERE estado = 'ACTIVO';
-- Una sola versiÃ³n vigente por documento legal
CREATE UNIQUE INDEX uq_version_vigente ON version_documento_legal (documento_id) WHERE es_vigente;
-- Un solo comitÃ© ACTIVO por tipo y sede
CREATE UNIQUE INDEX uq_comite_activo ON comite (tipo, COALESCE(sede_id,'00000000-0000-0000-0000-000000000000'::uuid)) WHERE estado = 'ACTIVO';

-- Integridad de flujo OPS: imposible aprobar/pagar sin verificaciÃ³n de seguridad social
ALTER TABLE cuenta_cobro_ops ADD CONSTRAINT chk_cc_ss
  CHECK (estado NOT IN ('APROBADA','PAGADA') OR ss_verificada);
-- TerminaciÃ³n apunta exactamente a un contrato (laboral XOR OPS)
ALTER TABLE terminacion ADD CONSTRAINT chk_term_contrato
  CHECK ((contrato_id IS NULL) <> (contrato_ops_id IS NULL));
-- Rangos de fechas coherentes
ALTER TABLE contrato      ADD CONSTRAINT chk_contrato_fechas CHECK (fecha_fin IS NULL OR fecha_fin >= fecha_inicio);
ALTER TABLE incapacidad   ADD CONSTRAINT chk_incap_fechas    CHECK (fecha_fin >= fecha_inicio);
ALTER TABLE licencia      ADD CONSTRAINT chk_lic_fechas      CHECK (fecha_fin >= fecha_inicio);
ALTER TABLE vacaciones    ADD CONSTRAINT chk_vac_fechas      CHECK (fecha_fin >= fecha_inicio);
-- Montos no negativos
ALTER TABLE prestamo          ADD CONSTRAINT chk_prestamo_valores CHECK (valor > 0 AND saldo_actual >= 0);
ALTER TABLE liquidacion_nomina ADD CONSTRAINT chk_nomina_neto     CHECK (neto_pagar >= 0);
-- DotaciÃ³n: mÃ¡ximo 3 entregas/aÃ±o
ALTER TABLE entrega_dotacion ADD CONSTRAINT chk_dotacion_num CHECK (numero_entrega BETWEEN 1 AND 3);

-- Rendimiento
CREATE INDEX idx_registro_modulo_datos ON registro_modulo USING GIN (datos jsonb_path_ops); -- filtros en mÃ³dulos custom
CREATE INDEX idx_audit_creado_brin     ON audit_log USING BRIN (creado_en);                 -- log append-only grande
CREATE INDEX idx_colaborador_nombre_trgm ON colaborador USING GIN ((nombres || ' ' || apellidos) gin_trgm_ops); -- bÃºsqueda
```

Resumen de unicidades ya declaradas en Prisma: `colaborador(tipoDocumento, numeroDocumento)`, `liquidacion_nomina(periodoId, colaboradorId)`, `periodo_nomina(anio, mes, secuencia)`, `parametro_legal_anual(anio)`, `cuota_prestamo(prestamoId, numero)`, `prorroga/otrosi(contratoId, numero)`, `cuenta_cobro(contratoOpsId, numero)`, `entrega_dotacion(colaboradorId, anio, numeroEntrega)`, `vencimiento(entidadTipo, entidadId, origen)`, `cumplimiento(obligacionId, etiquetaPeriodo)`, `indicador_sst(anio, mes, sedeId, tipo)`, `planilla_pila(anio, mes)`, `permiso(modulo, accion)`.

**Vistas SQL recomendadas** (creadas por migraciÃ³n, consumidas con `prisma.$queryRaw` tipado): `v_saldo_vacaciones`, `v_ausentismo` (dÃ­as perdidos por mes/sede/causa), `v_semaforo_documental` (requeridos vs existentes vs vencidos por colaborador), `v_rotacion` (ingresos/retiros por mes/sede), `v_masa_salarial` (por sede/ciudad/cargo, laborales vs OPS).

**Cobertura verificada contra el plan**: ficha completa âœ” Â· todos los vÃ­nculos âœ” Â· contratos con prÃ³rroga/otrosÃ­/prueba âœ” Â· OPS + cuentas de cobro con verificaciÃ³n SS obligatoria âœ” Â· nÃ³mina con conceptos configurables, comisiones venta/recaudo, recargos Ley 2466 con vigencias, aux. transporte automÃ¡tico, prÃ©stamos/cuotas, PILA, desprendible âœ” Â· novedades completas (incl. DÃ­a de la Familia) âœ” Â· terminaciones con todos los tipos, liquidaciÃ³n, paz y salvo por Ã¡rea âœ” Â· autoservicio con flujo configurable y 4 tipos de certificaciÃ³n âœ” Â· activos/dotaciÃ³n 3Ã—aÃ±o/capacitaciones/evaluaciones âœ” Â· jurÃ­dica completa (plantillas, versionado, disciplinario por etapas, antiâ€‘acoso, Ley 1581, calendario con todas las obligaciones listadas) âœ” Â· SST completo (Res. 0312, COPASST/Convivencia 2 aÃ±os, IPEVR por sede, FURAT, EPP, indicadores) âœ” Â· alertas 10/3 hÃ¡biles con festivos CO, email Resend y WhatsApp preparado âœ” Â· auditorÃ­a âœ” Â· mÃ³dulos custom con fechas enlazadas a alertas âœ” Â· multiâ€‘sede y modalidad âœ” Â· importador Excel âœ” Â· todos los reportes derivables âœ”.
