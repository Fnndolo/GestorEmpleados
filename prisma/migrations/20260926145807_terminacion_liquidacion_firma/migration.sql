-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "proposito_codigo_firma" ADD VALUE 'FIRMA_LIQUIDACION';
ALTER TYPE "proposito_codigo_firma" ADD VALUE 'FIRMA_EMPRESA_TERMINACION';

-- AlterTable
ALTER TABLE "evidencia_firma_contrato" ADD COLUMN     "liquidacion_definitiva_id" UUID;

-- AlterTable
ALTER TABLE "liquidacion_definitiva" ADD COLUMN     "comprobante_doc_id" UUID,
ADD COLUMN     "enviado_firma_en" TIMESTAMP(3),
ADD COLUMN     "firma_empresa_en" TIMESTAMP(3),
ADD COLUMN     "firma_empresa_path" TEXT,
ADD COLUMN     "firma_empresa_por_id" UUID,
ADD COLUMN     "firma_path" TEXT,
ADD COLUMN     "firmado_en" TIMESTAMP(3),
ADD COLUMN     "firmado_por_id" UUID,
ADD COLUMN     "pagado_en" DATE;

-- AlterTable
ALTER TABLE "paz_y_salvo" ADD COLUMN     "firma_empresa_en" TIMESTAMP(3),
ADD COLUMN     "firma_empresa_path" TEXT,
ADD COLUMN     "firma_empresa_por_id" UUID;

-- AddForeignKey
ALTER TABLE "evidencia_firma_contrato" ADD CONSTRAINT "evidencia_firma_contrato_liquidacion_definitiva_id_fkey" FOREIGN KEY ("liquidacion_definitiva_id") REFERENCES "liquidacion_definitiva"("id") ON DELETE CASCADE ON UPDATE CASCADE;
