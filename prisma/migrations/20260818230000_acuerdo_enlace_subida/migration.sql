-- Enlace público para que el aspirante suba el acuerdo firmado sin tener cuenta.
-- Aditiva: columnas nulables sobre una tabla recién creada y aún vacía.
ALTER TABLE "acuerdo_evaluacion" ADD COLUMN "enviado_por_id" UUID;
ALTER TABLE "acuerdo_evaluacion" ADD COLUMN "token_subida" TEXT;
ALTER TABLE "acuerdo_evaluacion" ADD COLUMN "token_expira_en" TIMESTAMP(3);
ALTER TABLE "acuerdo_evaluacion" ADD COLUMN "firmado_en" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "acuerdo_evaluacion_token_subida_key" ON "acuerdo_evaluacion"("token_subida");
