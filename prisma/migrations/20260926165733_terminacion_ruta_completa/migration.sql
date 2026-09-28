-- CreateEnum
CREATE TYPE "tipo_carta_terminacion" AS ENUM ('CARTA_RENUNCIA', 'ACEPTACION_RENUNCIA', 'CARTA_TERMINACION', 'NO_PRORROGA', 'ACTA_MUTUO_ACUERDO');

-- CreateEnum
CREATE TYPE "estado_renuncia" AS ENUM ('PRESENTADA', 'ACEPTADA', 'RETIRADA');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "proposito_codigo_firma" ADD VALUE 'FIRMA_CARTA_TERMINACION';
ALTER TYPE "proposito_codigo_firma" ADD VALUE 'FIRMA_RENUNCIA';

-- AlterTable
ALTER TABLE "evidencia_firma_contrato" ADD COLUMN     "carta_terminacion_id" UUID,
ADD COLUMN     "renuncia_id" UUID;

-- AlterTable
ALTER TABLE "paz_y_salvo_item" ADD COLUMN     "responsable_id" UUID;

-- AlterTable
ALTER TABLE "terminacion" ADD COLUMN     "examen_medico_id" UUID,
ADD COLUMN     "examen_no_asistio" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "examen_registrado_en" TIMESTAMP(3),
ADD COLUMN     "orden_examen_doc_id" UUID,
ADD COLUMN     "seguridad_social_doc_id" UUID;

-- CreateTable
CREATE TABLE "area_paz_y_salvo" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "responsable_id" UUID,
    "chequeo" TEXT,
    "orden" INTEGER NOT NULL DEFAULT 0,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "area_paz_y_salvo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "carta_terminacion" (
    "id" UUID NOT NULL,
    "terminacion_id" UUID NOT NULL,
    "tipo" "tipo_carta_terminacion" NOT NULL,
    "documento_id" UUID,
    "enviado_firma_en" TIMESTAMP(3),
    "firma_empresa_path" TEXT,
    "firma_empresa_en" TIMESTAMP(3),
    "firma_empresa_por_id" UUID,
    "firma_path" TEXT,
    "firmado_en" TIMESTAMP(3),
    "firmado_por_id" UUID,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "carta_terminacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "renuncia" (
    "id" UUID NOT NULL,
    "colaborador_id" UUID NOT NULL,
    "fecha_retiro" DATE NOT NULL,
    "motivo" TEXT,
    "documento_id" UUID,
    "firma_path" TEXT,
    "firmado_en" TIMESTAMP(3) NOT NULL,
    "estado" "estado_renuncia" NOT NULL DEFAULT 'PRESENTADA',
    "terminacion_id" UUID,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "renuncia_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "area_paz_y_salvo_nombre_key" ON "area_paz_y_salvo"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "carta_terminacion_terminacion_id_tipo_key" ON "carta_terminacion"("terminacion_id", "tipo");

-- CreateIndex
CREATE UNIQUE INDEX "renuncia_terminacion_id_key" ON "renuncia"("terminacion_id");

-- CreateIndex
CREATE INDEX "renuncia_colaborador_id_estado_idx" ON "renuncia"("colaborador_id", "estado");

-- CreateIndex
CREATE INDEX "paz_y_salvo_item_responsable_id_idx" ON "paz_y_salvo_item"("responsable_id");

-- AddForeignKey
ALTER TABLE "evidencia_firma_contrato" ADD CONSTRAINT "evidencia_firma_contrato_carta_terminacion_id_fkey" FOREIGN KEY ("carta_terminacion_id") REFERENCES "carta_terminacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidencia_firma_contrato" ADD CONSTRAINT "evidencia_firma_contrato_renuncia_id_fkey" FOREIGN KEY ("renuncia_id") REFERENCES "renuncia"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "area_paz_y_salvo" ADD CONSTRAINT "area_paz_y_salvo_responsable_id_fkey" FOREIGN KEY ("responsable_id") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "carta_terminacion" ADD CONSTRAINT "carta_terminacion_terminacion_id_fkey" FOREIGN KEY ("terminacion_id") REFERENCES "terminacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "renuncia" ADD CONSTRAINT "renuncia_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Áreas del paz y salvo de fábrica: las mismas cinco que antes estaban fijas en el código.
INSERT INTO "area_paz_y_salvo" ("id", "nombre", "concepto", "chequeo", "orden") VALUES
  (gen_random_uuid(), 'Activos', 'Equipos y activos asignados devueltos', 'ACTIVOS', 1),
  (gen_random_uuid(), 'Cartera', 'Préstamos y cartera al día', 'PRESTAMOS', 2),
  (gen_random_uuid(), 'Documentos', 'Documentos y expedientes entregados', NULL, 3),
  (gen_random_uuid(), 'Sistemas', 'Accesos y correos revocados', NULL, 4),
  (gen_random_uuid(), 'Dotación', 'Dotación devuelta (si aplica)', NULL, 5)
ON CONFLICT ("nombre") DO NOTHING;
