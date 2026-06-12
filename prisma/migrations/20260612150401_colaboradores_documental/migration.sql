-- CreateEnum
CREATE TYPE "tipo_entidad_ss" AS ENUM ('EPS', 'ARL', 'AFP', 'FONDO_CESANTIAS', 'CAJA_COMPENSACION');

-- CreateEnum
CREATE TYPE "clase_riesgo_arl" AS ENUM ('I', 'II', 'III', 'IV', 'V');

-- CreateEnum
CREATE TYPE "tipo_documento_identidad" AS ENUM ('CC', 'CE', 'TI', 'PASAPORTE', 'PPT', 'NIT');

-- CreateEnum
CREATE TYPE "genero" AS ENUM ('MASCULINO', 'FEMENINO', 'OTRO', 'PREFIERE_NO_DECIR');

-- CreateEnum
CREATE TYPE "estado_civil" AS ENUM ('SOLTERO', 'CASADO', 'UNION_LIBRE', 'SEPARADO', 'DIVORCIADO', 'VIUDO');

-- CreateEnum
CREATE TYPE "grupo_sanguineo" AS ENUM ('A_POS', 'A_NEG', 'B_POS', 'B_NEG', 'AB_POS', 'AB_NEG', 'O_POS', 'O_NEG');

-- CreateEnum
CREATE TYPE "nivel_educativo" AS ENUM ('PRIMARIA', 'BACHILLER', 'TECNICO', 'TECNOLOGO', 'PREGRADO', 'ESPECIALIZACION', 'MAESTRIA', 'DOCTORADO');

-- CreateEnum
CREATE TYPE "tipo_cuenta_bancaria" AS ENUM ('AHORROS', 'CORRIENTE', 'BILLETERA_DIGITAL');

-- CreateEnum
CREATE TYPE "tipo_vinculo" AS ENUM ('TERMINO_INDEFINIDO', 'TERMINO_FIJO', 'OBRA_LABOR', 'APRENDIZ_SENA', 'OPS', 'PRACTICANTE');

-- CreateEnum
CREATE TYPE "modalidad_trabajo" AS ENUM ('PRESENCIAL', 'REMOTO', 'HIBRIDO', 'TELETRABAJO');

-- CreateEnum
CREATE TYPE "estado_colaborador" AS ENUM ('ACTIVO', 'INACTIVO', 'RETIRADO');

-- CreateEnum
CREATE TYPE "nivel_acceso_documento" AS ENUM ('GENERAL', 'RRHH', 'SST_MEDICO', 'JURIDICA', 'ADMIN');

-- CreateEnum
CREATE TYPE "estado_importacion" AS ENUM ('PROCESANDO', 'COMPLETADA', 'FALLIDA');

-- CreateTable
CREATE TABLE "entidad_seguridad_social" (
    "id" UUID NOT NULL,
    "tipo" "tipo_entidad_ss" NOT NULL,
    "nombre" TEXT NOT NULL,
    "codigo" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "entidad_seguridad_social_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "banco" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "codigo_ach" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "banco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "area" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "padre_id" UUID,
    "responsable_id" UUID,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "area_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cargo" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "area_id" UUID NOT NULL,
    "nivel" TEXT,
    "funciones" TEXT,
    "clase_riesgo_defecto" "clase_riesgo_arl",
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cargo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "colaborador" (
    "id" UUID NOT NULL,
    "tipo_documento" "tipo_documento_identidad" NOT NULL,
    "numero_documento" TEXT NOT NULL,
    "fecha_expedicion_doc" DATE,
    "lugar_expedicion_doc" TEXT,
    "nombres" TEXT NOT NULL,
    "apellidos" TEXT NOT NULL,
    "fecha_nacimiento" DATE,
    "lugar_nacimiento" TEXT,
    "genero" "genero",
    "estado_civil" "estado_civil",
    "grupo_sanguineo" "grupo_sanguineo",
    "foto_path" TEXT,
    "direccion" TEXT,
    "barrio" TEXT,
    "ciudad_residencia_id" UUID,
    "celular" TEXT NOT NULL,
    "telefono" TEXT,
    "email_personal" TEXT,
    "email_corporativo" TEXT,
    "emergencia_nombre" TEXT,
    "emergencia_parentesco" TEXT,
    "emergencia_telefono" TEXT,
    "nivel_educativo_max" "nivel_educativo",
    "eps_id" UUID,
    "afp_id" UUID,
    "fondo_cesantias_id" UUID,
    "caja_compensacion_id" UUID,
    "arl_id" UUID,
    "clase_riesgo_arl" "clase_riesgo_arl",
    "banco_id" UUID,
    "tipo_cuenta" "tipo_cuenta_bancaria",
    "numero_cuenta" TEXT,
    "tipo_vinculo" "tipo_vinculo" NOT NULL,
    "sede_id" UUID NOT NULL,
    "area_id" UUID,
    "cargo_id" UUID,
    "jefe_inmediato_id" UUID,
    "modalidad_trabajo" "modalidad_trabajo" NOT NULL DEFAULT 'PRESENCIAL',
    "fecha_ingreso" DATE NOT NULL,
    "fecha_retiro" DATE,
    "estado" "estado_colaborador" NOT NULL DEFAULT 'ACTIVO',
    "talla_camisa" TEXT,
    "talla_pantalon" TEXT,
    "talla_calzado" TEXT,
    "usuario_id" UUID,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "colaborador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "educacion_colaborador" (
    "id" UUID NOT NULL,
    "colaborador_id" UUID NOT NULL,
    "nivel" "nivel_educativo" NOT NULL,
    "titulo" TEXT NOT NULL,
    "institucion" TEXT NOT NULL,
    "fecha_grado" DATE,
    "en_curso" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "educacion_colaborador_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tipo_documento" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "requiere_vencimiento" BOOLEAN NOT NULL DEFAULT false,
    "nivel_acceso" "nivel_acceso_documento" NOT NULL DEFAULT 'GENERAL',
    "dias_primera_alerta" INTEGER,
    "dias_ultima_alerta" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tipo_documento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documento_requerido" (
    "id" UUID NOT NULL,
    "tipo_vinculo" "tipo_vinculo" NOT NULL,
    "tipo_documento_id" UUID NOT NULL,
    "obligatorio" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "documento_requerido_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documento" (
    "id" UUID NOT NULL,
    "entidad_tipo" TEXT NOT NULL,
    "entidad_id" UUID NOT NULL,
    "tipo_documento_id" UUID,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "bucket" TEXT NOT NULL DEFAULT 'documentos',
    "storage_path" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "tamano_bytes" INTEGER NOT NULL,
    "fecha_vencimiento" DATE,
    "nivel_acceso" "nivel_acceso_documento" NOT NULL DEFAULT 'GENERAL',
    "sede_id" UUID,
    "subido_por_id" UUID NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "importacion_datos" (
    "id" UUID NOT NULL,
    "tipo" TEXT NOT NULL,
    "archivo_nombre" TEXT NOT NULL,
    "storage_path" TEXT,
    "total_filas" INTEGER NOT NULL,
    "insertadas" INTEGER NOT NULL DEFAULT 0,
    "errores" INTEGER NOT NULL DEFAULT 0,
    "detalle_errores" JSONB,
    "estado" "estado_importacion" NOT NULL DEFAULT 'PROCESANDO',
    "importado_por_id" UUID NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "importacion_datos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ajuste_vacaciones" (
    "id" UUID NOT NULL,
    "colaborador_id" UUID NOT NULL,
    "dias" DECIMAL(6,2) NOT NULL,
    "motivo" TEXT NOT NULL,
    "es_saldo_inicial" BOOLEAN NOT NULL DEFAULT false,
    "fecha" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "registrado_por_id" UUID,

    CONSTRAINT "ajuste_vacaciones_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "entidad_seguridad_social_tipo_nombre_key" ON "entidad_seguridad_social"("tipo", "nombre");

-- CreateIndex
CREATE UNIQUE INDEX "banco_nombre_key" ON "banco"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "area_nombre_key" ON "area"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "cargo_nombre_area_id_key" ON "cargo"("nombre", "area_id");

-- CreateIndex
CREATE UNIQUE INDEX "colaborador_usuario_id_key" ON "colaborador"("usuario_id");

-- CreateIndex
CREATE INDEX "colaborador_sede_id_estado_idx" ON "colaborador"("sede_id", "estado");

-- CreateIndex
CREATE INDEX "colaborador_area_id_idx" ON "colaborador"("area_id");

-- CreateIndex
CREATE INDEX "colaborador_cargo_id_idx" ON "colaborador"("cargo_id");

-- CreateIndex
CREATE INDEX "colaborador_jefe_inmediato_id_idx" ON "colaborador"("jefe_inmediato_id");

-- CreateIndex
CREATE INDEX "colaborador_tipo_vinculo_estado_idx" ON "colaborador"("tipo_vinculo", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "colaborador_tipo_documento_numero_documento_key" ON "colaborador"("tipo_documento", "numero_documento");

-- CreateIndex
CREATE INDEX "educacion_colaborador_colaborador_id_idx" ON "educacion_colaborador"("colaborador_id");

-- CreateIndex
CREATE UNIQUE INDEX "tipo_documento_nombre_key" ON "tipo_documento"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "documento_requerido_tipo_vinculo_tipo_documento_id_key" ON "documento_requerido"("tipo_vinculo", "tipo_documento_id");

-- CreateIndex
CREATE INDEX "documento_entidad_tipo_entidad_id_idx" ON "documento"("entidad_tipo", "entidad_id");

-- CreateIndex
CREATE INDEX "documento_fecha_vencimiento_idx" ON "documento"("fecha_vencimiento");

-- CreateIndex
CREATE INDEX "documento_sede_id_idx" ON "documento"("sede_id");

-- CreateIndex
CREATE INDEX "ajuste_vacaciones_colaborador_id_idx" ON "ajuste_vacaciones"("colaborador_id");

-- AddForeignKey
ALTER TABLE "area" ADD CONSTRAINT "area_padre_id_fkey" FOREIGN KEY ("padre_id") REFERENCES "area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "area" ADD CONSTRAINT "area_responsable_id_fkey" FOREIGN KEY ("responsable_id") REFERENCES "colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cargo" ADD CONSTRAINT "cargo_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "area"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colaborador" ADD CONSTRAINT "colaborador_ciudad_residencia_id_fkey" FOREIGN KEY ("ciudad_residencia_id") REFERENCES "ciudad"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colaborador" ADD CONSTRAINT "colaborador_eps_id_fkey" FOREIGN KEY ("eps_id") REFERENCES "entidad_seguridad_social"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colaborador" ADD CONSTRAINT "colaborador_afp_id_fkey" FOREIGN KEY ("afp_id") REFERENCES "entidad_seguridad_social"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colaborador" ADD CONSTRAINT "colaborador_fondo_cesantias_id_fkey" FOREIGN KEY ("fondo_cesantias_id") REFERENCES "entidad_seguridad_social"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colaborador" ADD CONSTRAINT "colaborador_caja_compensacion_id_fkey" FOREIGN KEY ("caja_compensacion_id") REFERENCES "entidad_seguridad_social"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colaborador" ADD CONSTRAINT "colaborador_arl_id_fkey" FOREIGN KEY ("arl_id") REFERENCES "entidad_seguridad_social"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colaborador" ADD CONSTRAINT "colaborador_banco_id_fkey" FOREIGN KEY ("banco_id") REFERENCES "banco"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colaborador" ADD CONSTRAINT "colaborador_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sede"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colaborador" ADD CONSTRAINT "colaborador_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "area"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colaborador" ADD CONSTRAINT "colaborador_cargo_id_fkey" FOREIGN KEY ("cargo_id") REFERENCES "cargo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colaborador" ADD CONSTRAINT "colaborador_jefe_inmediato_id_fkey" FOREIGN KEY ("jefe_inmediato_id") REFERENCES "colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "colaborador" ADD CONSTRAINT "colaborador_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "educacion_colaborador" ADD CONSTRAINT "educacion_colaborador_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documento_requerido" ADD CONSTRAINT "documento_requerido_tipo_documento_id_fkey" FOREIGN KEY ("tipo_documento_id") REFERENCES "tipo_documento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "documento" ADD CONSTRAINT "documento_tipo_documento_id_fkey" FOREIGN KEY ("tipo_documento_id") REFERENCES "tipo_documento"("id") ON DELETE SET NULL ON UPDATE CASCADE;
