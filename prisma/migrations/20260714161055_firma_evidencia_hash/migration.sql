-- CreateEnum
CREATE TYPE "rol_firma_contrato" AS ENUM ('CONTRATISTA', 'CONTRATANTE');

-- AlterTable
ALTER TABLE "documento" ADD COLUMN     "sha256" TEXT;

-- CreateTable
CREATE TABLE "evidencia_firma_contrato" (
    "id" UUID NOT NULL,
    "contrato_ops_id" UUID NOT NULL,
    "rol" "rol_firma_contrato" NOT NULL,
    "user_id" UUID,
    "user_email" TEXT,
    "ip" TEXT,
    "user_agent" TEXT,
    "metodo_auth" TEXT NOT NULL DEFAULT 'SESION',
    "documentos" JSONB,
    "firmado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidencia_firma_contrato_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "evidencia_firma_contrato_contrato_ops_id_idx" ON "evidencia_firma_contrato"("contrato_ops_id");

-- AddForeignKey
ALTER TABLE "evidencia_firma_contrato" ADD CONSTRAINT "evidencia_firma_contrato_contrato_ops_id_fkey" FOREIGN KEY ("contrato_ops_id") REFERENCES "contrato_ops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
