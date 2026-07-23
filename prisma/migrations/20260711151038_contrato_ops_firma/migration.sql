-- AlterEnum
ALTER TYPE "estado_contrato_ops" ADD VALUE 'FIRMADO';

-- AlterTable
ALTER TABLE "contrato_ops" ADD COLUMN     "contenido_pdf" JSONB,
ADD COLUMN     "firma_contratante_fecha" TIMESTAMP(3),
ADD COLUMN     "firma_contratante_path" TEXT,
ADD COLUMN     "firma_contratante_por_id" UUID,
ADD COLUMN     "firma_contratista_fecha" TIMESTAMP(3),
ADD COLUMN     "firma_contratista_path" TEXT,
ADD COLUMN     "firma_contratista_por_id" UUID;
