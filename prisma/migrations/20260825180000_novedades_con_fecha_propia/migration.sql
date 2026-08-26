-- Las novedades de nómina pasan a existir por sí solas, con su propia fecha de
-- causación. Antes solo podían registrarse dentro de un periodo ya creado, así
-- que una comisión de julio no tenía dónde vivir hasta que alguien abriera la
-- nómina de julio — y a quien se retiraba a mitad de mes se le perdían.
--
-- Ahora el periodo no las crea: las RECOGE por rango de fechas y les estampa su
-- id al pagarlas. periodo_id nulo = causada y todavía sin pagar.

-- ── comision ──────────────────────────────────────────────────────────────
ALTER TABLE "comision" ADD COLUMN "fecha" DATE;

-- Lo ya registrado se fecha con el cierre de su periodo, que es cuando se pagó.
-- Si quedó suelta (sin periodo), vale la fecha en que se digitó.
UPDATE "comision" c
SET "fecha" = COALESCE(
  (SELECT p."fecha_fin" FROM "periodo_nomina" p WHERE p."id" = c."periodo_id"),
  c."creado_en"::date
);

ALTER TABLE "comision" ALTER COLUMN "fecha" SET NOT NULL;
CREATE INDEX "comision_fecha_idx" ON "comision"("fecha");

-- ── novedad_concepto ──────────────────────────────────────────────────────
ALTER TABLE "novedad_concepto" ADD COLUMN "fecha" DATE;

UPDATE "novedad_concepto" n
SET "fecha" = COALESCE(
  (SELECT p."fecha_fin" FROM "periodo_nomina" p WHERE p."id" = n."periodo_id"),
  n."creado_en"::date
);

ALTER TABLE "novedad_concepto" ALTER COLUMN "fecha" SET NOT NULL;
CREATE INDEX "novedad_concepto_fecha_idx" ON "novedad_concepto"("fecha");

-- El periodo pasa a ser opcional. Y se cambia el ON DELETE CASCADE: borrar un
-- periodo ya no debe borrar las novedades que recogió, solo soltarlas para que
-- las recoja el siguiente.
ALTER TABLE "novedad_concepto" ALTER COLUMN "periodo_id" DROP NOT NULL;

ALTER TABLE "novedad_concepto" DROP CONSTRAINT "novedad_concepto_periodo_id_fkey";
ALTER TABLE "novedad_concepto"
  ADD CONSTRAINT "novedad_concepto_periodo_id_fkey"
  FOREIGN KEY ("periodo_id") REFERENCES "periodo_nomina"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
