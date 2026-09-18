-- El reporte de la línea ética va a nombre de quien lo envía (2026-09-17): se
-- guarda su ficha; entra «por clasificar» y Jurídica le pone el tipo.
ALTER TABLE "denuncia_acoso" ADD COLUMN     "colaborador_id" UUID,
ALTER COLUMN "anonima" SET DEFAULT false,
ALTER COLUMN "tipo" SET DEFAULT 'SIN_CLASIFICAR';

CREATE INDEX "denuncia_acoso_colaborador_id_idx" ON "denuncia_acoso"("colaborador_id");

ALTER TABLE "denuncia_acoso" ADD CONSTRAINT "denuncia_acoso_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;
