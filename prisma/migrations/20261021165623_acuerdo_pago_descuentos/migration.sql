-- AlterEnum
ALTER TYPE "proposito_codigo_firma" ADD VALUE 'FIRMA_ACUERDO_DESCUENTO';

-- AlterTable
ALTER TABLE "evidencia_firma_contrato" ADD COLUMN     "prestamo_id" UUID;

-- AlterTable
ALTER TABLE "prestamo" ADD COLUMN     "acuerdo_doc_id" UUID,
ADD COLUMN     "acuerdo_firmado_doc_id" UUID,
ADD COLUMN     "firma_empleado_fecha" TIMESTAMP(3),
ADD COLUMN     "firma_empleado_path" TEXT,
ADD COLUMN     "requiere_firma" BOOLEAN NOT NULL DEFAULT false;

-- AddForeignKey
ALTER TABLE "evidencia_firma_contrato" ADD CONSTRAINT "evidencia_firma_contrato_prestamo_id_fkey" FOREIGN KEY ("prestamo_id") REFERENCES "prestamo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
