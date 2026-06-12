-- AlterTable
ALTER TABLE "colaborador" ADD COLUMN     "busqueda_normalizada" TEXT NOT NULL DEFAULT '';

-- CreateIndex
CREATE INDEX "colaborador_busqueda_normalizada_idx" ON "colaborador"("busqueda_normalizada");
