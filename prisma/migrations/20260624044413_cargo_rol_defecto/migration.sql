-- AlterTable
ALTER TABLE "cargo" ADD COLUMN     "rol_defecto_id" UUID;

-- AddForeignKey
ALTER TABLE "cargo" ADD CONSTRAINT "cargo_rol_defecto_id_fkey" FOREIGN KEY ("rol_defecto_id") REFERENCES "rol"("id") ON DELETE SET NULL ON UPDATE CASCADE;
