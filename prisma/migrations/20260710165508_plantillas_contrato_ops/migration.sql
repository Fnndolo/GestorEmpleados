-- AlterTable
ALTER TABLE "cargo" ADD COLUMN     "funciones_contrato" JSONB;

-- AlterTable
ALTER TABLE "contrato_ops" ADD COLUMN     "cargo_id" UUID;

-- CreateTable
CREATE TABLE "plantilla_contrato" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "titulo" TEXT NOT NULL,
    "intro" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plantilla_contrato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clausula_plantilla" (
    "id" UUID NOT NULL,
    "plantilla_id" UUID NOT NULL,
    "orden" INTEGER NOT NULL,
    "titulo" TEXT NOT NULL,
    "cuerpo" TEXT NOT NULL,
    "es_funciones" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "clausula_plantilla_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "clausula_plantilla_plantilla_id_idx" ON "clausula_plantilla"("plantilla_id");

-- AddForeignKey
ALTER TABLE "clausula_plantilla" ADD CONSTRAINT "clausula_plantilla_plantilla_id_fkey" FOREIGN KEY ("plantilla_id") REFERENCES "plantilla_contrato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrato_ops" ADD CONSTRAINT "contrato_ops_cargo_id_fkey" FOREIGN KEY ("cargo_id") REFERENCES "cargo"("id") ON DELETE SET NULL ON UPDATE CASCADE;
