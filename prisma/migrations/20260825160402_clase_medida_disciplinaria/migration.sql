-- CreateEnum
CREATE TYPE "clase_medida" AS ENUM ('LLAMADO_ATENCION', 'PROCESO');

-- AlterTable
ALTER TABLE "proceso_disciplinario" ADD COLUMN     "clase" "clase_medida" NOT NULL DEFAULT 'PROCESO';
