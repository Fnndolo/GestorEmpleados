-- CreateEnum
CREATE TYPE "proposito_codigo_firma" AS ENUM ('FIRMA_CONTRATO_OPS');

-- CreateTable
CREATE TABLE "codigo_firma" (
    "id" UUID NOT NULL,
    "proposito" "proposito_codigo_firma" NOT NULL,
    "referencia_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "codigo_hash" TEXT NOT NULL,
    "expira_en" TIMESTAMP(3) NOT NULL,
    "intentos" INTEGER NOT NULL DEFAULT 0,
    "usado_en" TIMESTAMP(3),
    "ip" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "codigo_firma_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "codigo_firma_user_id_proposito_referencia_id_idx" ON "codigo_firma"("user_id", "proposito", "referencia_id");
