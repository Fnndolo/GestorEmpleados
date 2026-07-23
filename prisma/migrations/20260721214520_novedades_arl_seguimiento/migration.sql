-- CreateEnum
CREATE TYPE "tipo_novedad_arl" AS ENUM ('AFILIACION', 'RETIRO', 'TRASLADO_ARL', 'CAMBIO_CLASE_RIESGO', 'OTRA');

-- AlterTable
ALTER TABLE "examen_medico" ADD COLUMN     "seguimiento_cerrado" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "seguimiento_examen" (
    "id" UUID NOT NULL,
    "examen_id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "nota" TEXT NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "seguimiento_examen_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "novedad_arl" (
    "id" UUID NOT NULL,
    "colaborador_id" UUID NOT NULL,
    "tipo" "tipo_novedad_arl" NOT NULL,
    "fecha" DATE NOT NULL,
    "detalle" TEXT,
    "clase_riesgo" "clase_riesgo_arl",
    "soporte_doc_id" UUID,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "novedad_arl_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "seguimiento_examen_examen_id_idx" ON "seguimiento_examen"("examen_id");

-- CreateIndex
CREATE INDEX "novedad_arl_colaborador_id_idx" ON "novedad_arl"("colaborador_id");

-- AddForeignKey
ALTER TABLE "seguimiento_examen" ADD CONSTRAINT "seguimiento_examen_examen_id_fkey" FOREIGN KEY ("examen_id") REFERENCES "examen_medico"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "novedad_arl" ADD CONSTRAINT "novedad_arl_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
