-- AlterTable
ALTER TABLE "preferencia_notificacion" ADD COLUMN     "correo" BOOLEAN NOT NULL DEFAULT false;

-- Las filas que ya existían (creadas al configurar el pop-up) quedarían con
-- correo = false y eso apagaría el correo de los eventos con plazo legal, que
-- deben mandarlo mientras nadie lo cambie a propósito.
UPDATE "preferencia_notificacion" SET "correo" = true
WHERE "evento" IN (
  'contrato_pendiente_firma',
  'contrato_por_firmar',
  'denuncia_acoso',
  'disciplinario_citacion',
  'disciplinario_decision',
  'habeas_data'
);
