-- CreateEnum
CREATE TYPE "estado_acuerdo_evaluacion" AS ENUM ('EN_EVALUACION', 'APROBADO', 'NO_APROBADO');

-- CreateTable
CREATE TABLE "acuerdo_evaluacion" (
    "id" UUID NOT NULL,
    "numero" TEXT NOT NULL,
    "nombres" TEXT NOT NULL,
    "apellidos" TEXT NOT NULL,
    "tipo_documento" "tipo_documento_identidad" NOT NULL DEFAULT 'CC',
    "numero_documento" TEXT NOT NULL,
    "lugar_expedicion_doc" TEXT,
    "direccion" TEXT,
    "email" TEXT NOT NULL,
    "celular" TEXT,
    "cargo_evaluado" TEXT NOT NULL,
    "cargo_id" UUID,
    "sede_id" UUID,
    "fecha_inicio" DATE NOT NULL,
    "fecha_fin" DATE NOT NULL,
    "ciudad_firma" TEXT,
    "anios_confidencialidad" INTEGER NOT NULL DEFAULT 2,
    "estado" "estado_acuerdo_evaluacion" NOT NULL DEFAULT 'EN_EVALUACION',
    "observaciones" TEXT,
    "enviado_en" TIMESTAMP(3),
    "decidido_en" TIMESTAMP(3),
    "colaborador_id" UUID,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "acuerdo_evaluacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "acuerdo_evaluacion_numero_key" ON "acuerdo_evaluacion"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "acuerdo_evaluacion_colaborador_id_key" ON "acuerdo_evaluacion"("colaborador_id");

-- CreateIndex
CREATE INDEX "acuerdo_evaluacion_estado_idx" ON "acuerdo_evaluacion"("estado");

-- AddForeignKey
ALTER TABLE "acuerdo_evaluacion" ADD CONSTRAINT "acuerdo_evaluacion_cargo_id_fkey" FOREIGN KEY ("cargo_id") REFERENCES "cargo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acuerdo_evaluacion" ADD CONSTRAINT "acuerdo_evaluacion_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sede"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "acuerdo_evaluacion" ADD CONSTRAINT "acuerdo_evaluacion_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;
