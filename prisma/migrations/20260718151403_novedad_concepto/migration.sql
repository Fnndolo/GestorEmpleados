-- CreateTable
CREATE TABLE "novedad_concepto" (
    "id" UUID NOT NULL,
    "colaborador_id" UUID NOT NULL,
    "periodo_id" UUID NOT NULL,
    "concepto_id" UUID NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "observaciones" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "novedad_concepto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "novedad_concepto_colaborador_id_periodo_id_idx" ON "novedad_concepto"("colaborador_id", "periodo_id");

-- CreateIndex
CREATE INDEX "novedad_concepto_periodo_id_idx" ON "novedad_concepto"("periodo_id");

-- AddForeignKey
ALTER TABLE "novedad_concepto" ADD CONSTRAINT "novedad_concepto_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "novedad_concepto" ADD CONSTRAINT "novedad_concepto_periodo_id_fkey" FOREIGN KEY ("periodo_id") REFERENCES "periodo_nomina"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "novedad_concepto" ADD CONSTRAINT "novedad_concepto_concepto_id_fkey" FOREIGN KEY ("concepto_id") REFERENCES "concepto_nomina"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
