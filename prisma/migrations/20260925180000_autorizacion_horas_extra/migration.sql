-- Modulo "Autorizacion de horas extra": nuevo tipo de solicitud y la tabla
-- de autorizaciones aprobadas.
-- AlterEnum
ALTER TYPE "tipo_solicitud" ADD VALUE 'HORAS_EXTRA';

-- CreateTable
CREATE TABLE "autorizacion_horas_extra" (
    "id" UUID NOT NULL,
    "colaborador_id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "hora_inicio" TEXT NOT NULL,
    "hora_fin" TEXT NOT NULL,
    "horas" DECIMAL(4,2) NOT NULL,
    "motivo" TEXT NOT NULL,
    "posterior" BOOLEAN NOT NULL DEFAULT false,
    "solicitud_id" UUID,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "autorizacion_horas_extra_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "autorizacion_horas_extra_solicitud_id_key" ON "autorizacion_horas_extra"("solicitud_id");

-- CreateIndex
CREATE INDEX "autorizacion_horas_extra_colaborador_id_fecha_idx" ON "autorizacion_horas_extra"("colaborador_id", "fecha");

-- AddForeignKey
ALTER TABLE "autorizacion_horas_extra" ADD CONSTRAINT "autorizacion_horas_extra_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

