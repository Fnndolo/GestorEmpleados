-- CreateEnum
CREATE TYPE "origen_vencimiento" AS ENUM ('DOCUMENTO', 'CONTRATO_FIJO', 'PERIODO_PRUEBA', 'EXAMEN_MEDICO', 'PLANILLA_SS_OPS', 'OBLIGACION_LEGAL', 'POLIZA', 'ARRIENDO', 'CONVENIO_FINANCIERA', 'MARCA', 'DOMINIO_WEB', 'LICENCIA_SOFTWARE', 'COMITE', 'ACCION_CORRECTIVA', 'EPP', 'DOTACION', 'MODULO_PERSONALIZADO', 'MANUAL');

-- CreateEnum
CREATE TYPE "estado_vencimiento" AS ENUM ('PENDIENTE', 'PRIMERA_ALERTA', 'ULTIMA_ALERTA', 'VENCIDO', 'RESUELTO', 'CANCELADO');

-- CreateEnum
CREATE TYPE "paso_alerta" AS ENUM ('PRIMERA', 'ULTIMA', 'VENCIDO');

-- CreateEnum
CREATE TYPE "tipo_excepcion_festivo" AS ENUM ('ADD', 'REMOVE');

-- CreateEnum
CREATE TYPE "canal_mensaje" AS ENUM ('EMAIL', 'WHATSAPP');

-- CreateEnum
CREATE TYPE "estado_mensaje" AS ENUM ('EN_COLA', 'ENVIADO', 'FALLIDO', 'DESCARTADO');

-- CreateTable
CREATE TABLE "regla_alerta" (
    "id" UUID NOT NULL,
    "clave" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "dias_primera_alerta" INTEGER NOT NULL,
    "primera_en_habiles" BOOLEAN NOT NULL DEFAULT true,
    "dias_ultima_alerta" INTEGER NOT NULL,
    "ultima_en_habiles" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "regla_alerta_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vencimiento" (
    "id" UUID NOT NULL,
    "origen" "origen_vencimiento" NOT NULL,
    "entidad_tipo" TEXT NOT NULL,
    "entidad_id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "detalle" TEXT,
    "fecha_vencimiento" DATE NOT NULL,
    "sede_id" UUID,
    "estado" "estado_vencimiento" NOT NULL DEFAULT 'PENDIENTE',
    "resuelto_en" TIMESTAMP(3),
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vencimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "responsable_vencimiento" (
    "id" UUID NOT NULL,
    "vencimiento_id" UUID NOT NULL,
    "user_id" UUID,
    "rol" TEXT,
    "es_principal" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "responsable_vencimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alerta_vencimiento" (
    "id" UUID NOT NULL,
    "vencimiento_id" UUID NOT NULL,
    "paso" "paso_alerta" NOT NULL,
    "fecha_programada" DATE NOT NULL,
    "despachada" BOOLEAN NOT NULL DEFAULT false,
    "despachada_en" TIMESTAMP(3),

    CONSTRAINT "alerta_vencimiento_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "festivo_excepcion" (
    "id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "tipo" "tipo_excepcion_festivo" NOT NULL,
    "nombre" TEXT,

    CONSTRAINT "festivo_excepcion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacion" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "mensaje" TEXT NOT NULL,
    "enlace" TEXT,
    "leida" BOOLEAN NOT NULL DEFAULT false,
    "dedupe_key" TEXT NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mensaje_saliente" (
    "id" UUID NOT NULL,
    "canal" "canal_mensaje" NOT NULL,
    "destino" TEXT NOT NULL,
    "asunto" TEXT,
    "cuerpo" TEXT NOT NULL,
    "estado" "estado_mensaje" NOT NULL DEFAULT 'EN_COLA',
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "proveedor_ref" TEXT,
    "error" TEXT,
    "dedupe_key" TEXT NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enviado_en" TIMESTAMP(3),

    CONSTRAINT "mensaje_saliente_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "regla_alerta_clave_key" ON "regla_alerta"("clave");

-- CreateIndex
CREATE INDEX "vencimiento_estado_fecha_vencimiento_idx" ON "vencimiento"("estado", "fecha_vencimiento");

-- CreateIndex
CREATE INDEX "vencimiento_sede_id_estado_idx" ON "vencimiento"("sede_id", "estado");

-- CreateIndex
CREATE UNIQUE INDEX "vencimiento_entidad_tipo_entidad_id_origen_key" ON "vencimiento"("entidad_tipo", "entidad_id", "origen");

-- CreateIndex
CREATE INDEX "responsable_vencimiento_vencimiento_id_idx" ON "responsable_vencimiento"("vencimiento_id");

-- CreateIndex
CREATE INDEX "alerta_vencimiento_despachada_fecha_programada_idx" ON "alerta_vencimiento"("despachada", "fecha_programada");

-- CreateIndex
CREATE UNIQUE INDEX "alerta_vencimiento_vencimiento_id_paso_key" ON "alerta_vencimiento"("vencimiento_id", "paso");

-- CreateIndex
CREATE UNIQUE INDEX "festivo_excepcion_fecha_key" ON "festivo_excepcion"("fecha");

-- CreateIndex
CREATE UNIQUE INDEX "notificacion_dedupe_key_key" ON "notificacion"("dedupe_key");

-- CreateIndex
CREATE INDEX "notificacion_user_id_leida_creado_en_idx" ON "notificacion"("user_id", "leida", "creado_en");

-- CreateIndex
CREATE UNIQUE INDEX "mensaje_saliente_dedupe_key_key" ON "mensaje_saliente"("dedupe_key");

-- CreateIndex
CREATE INDEX "mensaje_saliente_estado_idx" ON "mensaje_saliente"("estado");

-- AddForeignKey
ALTER TABLE "responsable_vencimiento" ADD CONSTRAINT "responsable_vencimiento_vencimiento_id_fkey" FOREIGN KEY ("vencimiento_id") REFERENCES "vencimiento"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alerta_vencimiento" ADD CONSTRAINT "alerta_vencimiento_vencimiento_id_fkey" FOREIGN KEY ("vencimiento_id") REFERENCES "vencimiento"("id") ON DELETE CASCADE ON UPDATE CASCADE;
