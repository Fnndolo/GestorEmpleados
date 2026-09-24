-- Marca por colaborador: Talento Humano confirma que ya cargo su historial de
-- vacaciones. Solo entonces se le muestra el saldo en Autoservicio.
ALTER TABLE "colaborador" ADD COLUMN "vacaciones_historial_completo_en" TIMESTAMP(3);
ALTER TABLE "colaborador" ADD COLUMN "vacaciones_historial_completo_por_id" UUID;
