-- AlterEnum
ALTER TYPE "tipo_solicitud" ADD VALUE 'INCAPACIDAD';

-- AlterTable
ALTER TABLE "permiso" ADD COLUMN     "hora_fin" TEXT,
ADD COLUMN     "hora_inicio" TEXT;
