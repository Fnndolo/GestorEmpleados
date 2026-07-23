-- CreateEnum
CREATE TYPE "cumplimiento_norma" AS ENUM ('CUMPLE', 'PARCIAL', 'NO_CUMPLE');

-- AlterTable
ALTER TABLE "documento_legal" ADD COLUMN     "es_sgsst" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "firmada_en" DATE;

-- CreateTable
CREATE TABLE "responsable_sgsst" (
    "id" UUID NOT NULL,
    "colaborador_id" UUID NOT NULL,
    "fecha_designacion" DATE NOT NULL,
    "licencia_sst" TEXT,
    "curso_horas" INTEGER,
    "carta_doc_id" UUID,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "responsable_sgsst_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plan_trabajo_sst" (
    "id" UUID NOT NULL,
    "anio" INTEGER NOT NULL,
    "documento_id" UUID,
    "aprobado_por" TEXT,
    "avance_pct" INTEGER NOT NULL DEFAULT 0,
    "notas" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plan_trabajo_sst_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "norma_matriz_legal" (
    "id" UUID NOT NULL,
    "norma" TEXT NOT NULL,
    "emisor" TEXT,
    "tema" TEXT NOT NULL,
    "articulos" TEXT,
    "como_cumple" TEXT,
    "cumplimiento" "cumplimiento_norma" NOT NULL DEFAULT 'NO_CUMPLE',
    "evidencia_doc_id" UUID,
    "responsable_rol" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "norma_matriz_legal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "responsable_sgsst_colaborador_id_idx" ON "responsable_sgsst"("colaborador_id");

-- CreateIndex
CREATE UNIQUE INDEX "plan_trabajo_sst_anio_key" ON "plan_trabajo_sst"("anio");

-- AddForeignKey
ALTER TABLE "responsable_sgsst" ADD CONSTRAINT "responsable_sgsst_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
