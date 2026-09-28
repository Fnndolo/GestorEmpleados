-- AlterTable
ALTER TABLE "terminacion" ADD COLUMN     "retiro_aplicado_en" TIMESTAMP(3);

-- Las terminaciones que ya existen aplicaron el retiro al registrarse.
UPDATE "terminacion" SET "retiro_aplicado_en" = "creado_en" WHERE "retiro_aplicado_en" IS NULL;
