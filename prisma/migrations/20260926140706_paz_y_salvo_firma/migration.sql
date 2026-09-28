-- AlterEnum
ALTER TYPE "proposito_codigo_firma" ADD VALUE 'FIRMA_PAZ_Y_SALVO';

-- AlterTable
ALTER TABLE "evidencia_firma_contrato" ADD COLUMN     "paz_y_salvo_id" UUID;

-- AlterTable
ALTER TABLE "paz_y_salvo" ADD COLUMN     "enviado_firma_en" TIMESTAMP(3),
ADD COLUMN     "firma_path" TEXT,
ADD COLUMN     "firmado_en" TIMESTAMP(3),
ADD COLUMN     "firmado_por_id" UUID;

-- AddForeignKey
ALTER TABLE "evidencia_firma_contrato" ADD CONSTRAINT "evidencia_firma_contrato_paz_y_salvo_id_fkey" FOREIGN KEY ("paz_y_salvo_id") REFERENCES "paz_y_salvo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
