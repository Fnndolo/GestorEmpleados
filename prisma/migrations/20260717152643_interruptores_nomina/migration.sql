-- AlterTable
ALTER TABLE "configuracion_empresa" ADD COLUMN     "aplica_retefuente" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "empresa_exonerada" BOOLEAN NOT NULL DEFAULT true;
