-- CreateEnum
CREATE TYPE "estado_inspeccion" AS ENUM ('ABIERTA', 'CERRADA');

-- AlterTable
ALTER TABLE "peligro_ipevr" ADD COLUMN     "control_fuente" TEXT,
ADD COLUMN     "control_individuo" TEXT,
ADD COLUMN     "control_medio" TEXT,
ADD COLUMN     "fecha_revision" DATE,
ADD COLUMN     "responsable" TEXT,
ADD COLUMN     "rutinaria" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "profesiograma" (
    "id" UUID NOT NULL,
    "cargo_id" UUID NOT NULL,
    "riesgos_expuestos" TEXT NOT NULL,
    "examenes_requeridos" TEXT NOT NULL,
    "aptitudes_requeridas" TEXT NOT NULL,
    "restricciones" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "profesiograma_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_emergencia" (
    "id" UUID NOT NULL,
    "sede_id" UUID,
    "version" TEXT NOT NULL,
    "vigencia_desde" DATE NOT NULL,
    "vigencia_hasta" DATE NOT NULL,
    "documento_id" UUID,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "plan_emergencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "brigadista" (
    "id" UUID NOT NULL,
    "colaborador_id" UUID NOT NULL,
    "sede_id" UUID,
    "rol" TEXT NOT NULL,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "brigadista_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "simulacro" (
    "id" UUID NOT NULL,
    "sede_id" UUID,
    "fecha" DATE NOT NULL,
    "tipo" TEXT NOT NULL,
    "participantes" INTEGER,
    "observaciones" TEXT,
    "documento_id" UUID,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "simulacro_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inspeccion_sst" (
    "id" UUID NOT NULL,
    "sede_id" UUID,
    "fecha" DATE NOT NULL,
    "tipo" TEXT NOT NULL,
    "area" TEXT,
    "hallazgos" TEXT NOT NULL,
    "responsable" TEXT,
    "estado" "estado_inspeccion" NOT NULL DEFAULT 'ABIERTA',
    "fecha_cierre" DATE,
    "documento_id" UUID,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inspeccion_sst_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "profesiograma_cargo_id_key" ON "profesiograma"("cargo_id");

-- CreateIndex
CREATE INDEX "brigadista_colaborador_id_idx" ON "brigadista"("colaborador_id");

-- AddForeignKey
ALTER TABLE "brigadista" ADD CONSTRAINT "brigadista_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
