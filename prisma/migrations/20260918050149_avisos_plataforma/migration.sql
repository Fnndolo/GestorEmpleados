-- CreateEnum
CREATE TYPE "tipo_aviso" AS ENUM ('NUEVO_MODULO', 'MEJORA', 'CAMBIO');

-- CreateEnum
CREATE TYPE "estado_aviso" AS ENUM ('BORRADOR', 'PUBLICADO', 'ARCHIVADO');

-- CreateTable
CREATE TABLE "aviso" (
    "id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "resumen" TEXT NOT NULL,
    "detalle" TEXT,
    "tipo" "tipo_aviso" NOT NULL DEFAULT 'NUEVO_MODULO',
    "enlace" TEXT,
    "imagen_path" TEXT,
    "audiencia" JSONB NOT NULL DEFAULT '{}',
    "estado" "estado_aviso" NOT NULL DEFAULT 'BORRADOR',
    "publicado_en" TIMESTAMP(3),
    "vigente_hasta" DATE,
    "creado_por_id" UUID NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "aviso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "aviso_lectura" (
    "aviso_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "leido_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "aviso_lectura_pkey" PRIMARY KEY ("aviso_id","user_id")
);

-- CreateIndex
CREATE INDEX "aviso_estado_publicado_en_idx" ON "aviso"("estado", "publicado_en");

-- CreateIndex
CREATE INDEX "aviso_lectura_user_id_idx" ON "aviso_lectura"("user_id");

-- AddForeignKey
ALTER TABLE "aviso" ADD CONSTRAINT "aviso_creado_por_id_fkey" FOREIGN KEY ("creado_por_id") REFERENCES "user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aviso_lectura" ADD CONSTRAINT "aviso_lectura_aviso_id_fkey" FOREIGN KEY ("aviso_id") REFERENCES "aviso"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "aviso_lectura" ADD CONSTRAINT "aviso_lectura_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
