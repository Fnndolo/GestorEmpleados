-- Lote de entrega: las asignaciones hechas en un mismo acto comparten lote_id
-- y, por tanto, una sola acta (acta_entrega_doc_id apunta al mismo documento).
ALTER TABLE "asignacion_activo" ADD COLUMN "lote_id" UUID;

CREATE INDEX "asignacion_activo_lote_id_idx" ON "asignacion_activo"("lote_id");
