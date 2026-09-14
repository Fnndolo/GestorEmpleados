-- Cierre de un contrato OPS por vencimiento del plazo, anticipado, de mutuo acuerdo
-- o por retiro de la persona (Terminaciones). Antes ningun OPS pasaba a TERMINADO.

-- CreateEnum
CREATE TYPE "motivo_cierre_ops" AS ENUM ('VENCIMIENTO_PLAZO', 'TERMINACION_ANTICIPADA', 'MUTUO_ACUERDO', 'RETIRO');

-- AlterTable
ALTER TABLE "contrato_ops" ADD COLUMN     "cerrado_en" DATE,
ADD COLUMN     "cerrado_por_id" UUID,
ADD COLUMN     "motivo_cierre" "motivo_cierre_ops",
ADD COLUMN     "observacion_cierre" TEXT;
