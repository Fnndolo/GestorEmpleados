-- CreateEnum
CREATE TYPE "tipo_reporte" AS ENUM ('ACOSO_LABORAL', 'ACOSO_SEXUAL', 'CONDUCTA_IRREGULAR', 'SUGERENCIA');

-- AlterTable
ALTER TABLE "denuncia_acoso" ADD COLUMN     "tipo" "tipo_reporte" NOT NULL DEFAULT 'ACOSO_LABORAL';
