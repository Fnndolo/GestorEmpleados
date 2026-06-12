-- CreateEnum
CREATE TYPE "vinculo_modulo" AS ENUM ('GLOBAL', 'POR_COLABORADOR', 'POR_SEDE');

-- CreateEnum
CREATE TYPE "tipo_campo" AS ENUM ('TEXTO', 'TEXTO_LARGO', 'NUMERO', 'DECIMAL', 'MONEDA', 'FECHA', 'OPCION', 'SI_NO', 'COLABORADOR');

-- CreateTable
CREATE TABLE "modulo_personalizado" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "icono" TEXT NOT NULL DEFAULT 'Layers',
    "seccion" TEXT NOT NULL DEFAULT 'Personalizados',
    "vinculo" "vinculo_modulo" NOT NULL DEFAULT 'GLOBAL',
    "descripcion" TEXT,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 100,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "modulo_personalizado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campo_personalizado" (
    "id" UUID NOT NULL,
    "modulo_id" UUID NOT NULL,
    "clave" TEXT NOT NULL,
    "etiqueta" TEXT NOT NULL,
    "tipo" "tipo_campo" NOT NULL,
    "requerido" BOOLEAN NOT NULL DEFAULT false,
    "opciones" TEXT,
    "genera_alerta" BOOLEAN NOT NULL DEFAULT false,
    "mostrar_en_tabla" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 100,

    CONSTRAINT "campo_personalizado_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "registro_personalizado" (
    "id" UUID NOT NULL,
    "modulo_id" UUID NOT NULL,
    "colaborador_id" UUID,
    "sede_id" UUID,
    "datos" JSONB NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "registro_personalizado_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "modulo_personalizado_slug_key" ON "modulo_personalizado"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "campo_personalizado_modulo_id_clave_key" ON "campo_personalizado"("modulo_id", "clave");

-- CreateIndex
CREATE INDEX "registro_personalizado_modulo_id_idx" ON "registro_personalizado"("modulo_id");

-- AddForeignKey
ALTER TABLE "campo_personalizado" ADD CONSTRAINT "campo_personalizado_modulo_id_fkey" FOREIGN KEY ("modulo_id") REFERENCES "modulo_personalizado"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "registro_personalizado" ADD CONSTRAINT "registro_personalizado_modulo_id_fkey" FOREIGN KEY ("modulo_id") REFERENCES "modulo_personalizado"("id") ON DELETE CASCADE ON UPDATE CASCADE;
