-- La orden de pago de horas extra se envía a firmar por el colaborador (Ley
-- 527) antes de poder marcarse como pagada: dos estados nuevos y los campos
-- de la firma, más la evidencia probatoria del acto (misma tabla de contratos).

-- AlterEnum
ALTER TYPE "estado_pago_horas_extra" ADD VALUE 'ENVIADA_A_FIRMA';
ALTER TYPE "estado_pago_horas_extra" ADD VALUE 'FIRMADA';

-- AlterEnum
ALTER TYPE "proposito_codigo_firma" ADD VALUE 'FIRMA_PAGO_HORAS_EXTRA';

-- AlterTable
ALTER TABLE "pago_horas_extra" ADD COLUMN "firma_path" TEXT,
ADD COLUMN "firma_fecha" TIMESTAMP(3),
ADD COLUMN "firma_por_id" UUID;

-- AlterTable
ALTER TABLE "evidencia_firma_contrato" ADD COLUMN "pago_horas_extra_id" UUID;

-- AddForeignKey
ALTER TABLE "evidencia_firma_contrato" ADD CONSTRAINT "evidencia_firma_contrato_pago_horas_extra_id_fkey" FOREIGN KEY ("pago_horas_extra_id") REFERENCES "pago_horas_extra"("id") ON DELETE CASCADE ON UPDATE CASCADE;
