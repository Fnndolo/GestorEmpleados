-- CreateTable
CREATE TABLE "accion_mejora_sst" (
    "id" UUID NOT NULL,
    "autoevaluacion_id" UUID NOT NULL,
    "actividad" TEXT NOT NULL,
    "responsable" TEXT NOT NULL,
    "fecha_limite" DATE NOT NULL,
    "recursos" TEXT,
    "cumplida" BOOLEAN NOT NULL DEFAULT false,
    "cumplida_en" DATE,
    "evidencia_doc_id" UUID,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accion_mejora_sst_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "accion_mejora_sst_autoevaluacion_id_idx" ON "accion_mejora_sst"("autoevaluacion_id");

-- AddForeignKey
ALTER TABLE "accion_mejora_sst" ADD CONSTRAINT "accion_mejora_sst_autoevaluacion_id_fkey" FOREIGN KEY ("autoevaluacion_id") REFERENCES "autoevaluacion_sst"("id") ON DELETE CASCADE ON UPDATE CASCADE;
