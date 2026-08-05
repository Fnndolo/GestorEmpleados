-- AlterTable
ALTER TABLE "novedad_horas" ADD COLUMN     "referencia_externa" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "novedad_horas_referencia_externa_tipo_hora_key" ON "novedad_horas"("referencia_externa", "tipo_hora");
