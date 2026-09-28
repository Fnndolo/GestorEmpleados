-- AlterEnum
ALTER TYPE "estado_renuncia" ADD VALUE 'DEVUELTA';

-- AlterTable
ALTER TABLE "renuncia" ADD COLUMN     "devuelta_en" TIMESTAMP(3),
ADD COLUMN     "motivo_devolucion" TEXT;
