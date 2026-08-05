-- CreateEnum
CREATE TYPE "OrigenPdfContrato" AS ENUM ('GENERADO', 'SUBIDO');

-- AlterTable
ALTER TABLE "contrato" ADD COLUMN     "origen_pdf" "OrigenPdfContrato" NOT NULL DEFAULT 'GENERADO';

-- AlterTable
ALTER TABLE "contrato_ops" ADD COLUMN     "origen_pdf" "OrigenPdfContrato" NOT NULL DEFAULT 'GENERADO';
