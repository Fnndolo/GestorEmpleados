-- CreateTable
CREATE TABLE "preaviso_contrato" (
    "id" UUID NOT NULL,
    "colaborador_id" UUID NOT NULL,
    "contrato_id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "mensaje" TEXT,
    "documento_id" UUID NOT NULL,
    "respuesta_doc_id" UUID,
    "respondido_en" TIMESTAMP(3),
    "enviado_por_id" UUID,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "preaviso_contrato_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "preaviso_contrato_colaborador_id_idx" ON "preaviso_contrato"("colaborador_id");
CREATE INDEX "preaviso_contrato_contrato_id_idx" ON "preaviso_contrato"("contrato_id");

-- AddForeignKey
ALTER TABLE "preaviso_contrato" ADD CONSTRAINT "preaviso_contrato_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "contrato"("id") ON DELETE CASCADE ON UPDATE CASCADE;
