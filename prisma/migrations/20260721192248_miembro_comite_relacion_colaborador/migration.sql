-- CreateIndex
CREATE INDEX "miembro_comite_colaborador_id_idx" ON "miembro_comite"("colaborador_id");

-- AddForeignKey
ALTER TABLE "miembro_comite" ADD CONSTRAINT "miembro_comite_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
