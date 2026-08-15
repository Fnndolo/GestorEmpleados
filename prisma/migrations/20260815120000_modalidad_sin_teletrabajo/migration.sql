-- Quita TELETRABAJO de modalidad_trabajo. Postgres no permite borrar un valor
-- de un enum: se recrea el tipo y se reapunta a las columnas que lo usan.
-- Seguro: ninguna fila usa ese valor (verificado en local y producción).
ALTER TYPE "modalidad_trabajo" RENAME TO "modalidad_trabajo_old";

CREATE TYPE "modalidad_trabajo" AS ENUM ('PRESENCIAL', 'REMOTO', 'HIBRIDO');

ALTER TABLE "colaborador"
  ALTER COLUMN "modalidad_trabajo" DROP DEFAULT,
  ALTER COLUMN "modalidad_trabajo" TYPE "modalidad_trabajo"
    USING ("modalidad_trabajo"::text::"modalidad_trabajo"),
  ALTER COLUMN "modalidad_trabajo" SET DEFAULT 'PRESENCIAL';

ALTER TABLE "contrato"
  ALTER COLUMN "modalidad_trabajo" TYPE "modalidad_trabajo"
    USING ("modalidad_trabajo"::text::"modalidad_trabajo");

DROP TYPE "modalidad_trabajo_old";
