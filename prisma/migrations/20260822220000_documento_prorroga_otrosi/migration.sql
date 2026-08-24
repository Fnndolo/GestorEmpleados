-- Prórrogas y otrosíes pueden llevar adjunto su PDF firmado. El sistema no los
-- genera desde plantilla: se redactan fuera, se firman y se suben.
ALTER TABLE "prorroga_contrato" ADD COLUMN "documento_id" UUID;
ALTER TABLE "otrosi_contrato" ADD COLUMN "documento_id" UUID;
