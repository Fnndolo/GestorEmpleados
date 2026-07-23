-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "rol_firma_contrato" ADD VALUE 'EMPLEADO';
ALTER TYPE "rol_firma_contrato" ADD VALUE 'EMPLEADOR';

-- AlterTable
ALTER TABLE "evidencia_firma_contrato" ADD COLUMN     "contrato_id" UUID,
ALTER COLUMN "contrato_ops_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "evidencia_firma_contrato" ADD CONSTRAINT "evidencia_firma_contrato_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "contrato"("id") ON DELETE CASCADE ON UPDATE CASCADE;
