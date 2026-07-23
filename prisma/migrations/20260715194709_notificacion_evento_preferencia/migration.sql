-- AlterTable
ALTER TABLE "notificacion" ADD COLUMN     "evento" TEXT;

-- CreateTable
CREATE TABLE "preferencia_notificacion" (
    "evento" TEXT NOT NULL,
    "popup" BOOLEAN NOT NULL DEFAULT true,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "preferencia_notificacion_pkey" PRIMARY KEY ("evento")
);
