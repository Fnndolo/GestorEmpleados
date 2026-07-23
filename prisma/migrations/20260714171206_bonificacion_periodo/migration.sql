-- AlterTable
ALTER TABLE "bonificacion" ADD COLUMN     "periodo_id" UUID;

-- CreateIndex
CREATE INDEX "bonificacion_periodo_id_idx" ON "bonificacion"("periodo_id");

-- AddForeignKey
ALTER TABLE "bonificacion" ADD CONSTRAINT "bonificacion_periodo_id_fkey" FOREIGN KEY ("periodo_id") REFERENCES "periodo_nomina"("id") ON DELETE SET NULL ON UPDATE CASCADE;
