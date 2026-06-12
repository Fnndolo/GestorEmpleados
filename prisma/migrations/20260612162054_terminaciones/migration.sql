-- CreateEnum
CREATE TYPE "tipo_terminacion" AS ENUM ('RENUNCIA_VOLUNTARIA', 'SIN_JUSTA_CAUSA', 'CON_JUSTA_CAUSA', 'TERMINACION_ANTICIPADA', 'MUTUO_ACUERDO', 'VENCIMIENTO_PLAZO', 'PERIODO_PRUEBA', 'FIN_OPS');

-- CreateEnum
CREATE TYPE "estado_terminacion" AS ENUM ('EN_PROCESO', 'LIQUIDADA', 'CERRADA');

-- CreateEnum
CREATE TYPE "estado_paz_y_salvo" AS ENUM ('PENDIENTE', 'COMPLETO');

-- CreateTable
CREATE TABLE "terminacion" (
    "id" UUID NOT NULL,
    "colaborador_id" UUID NOT NULL,
    "tipo" "tipo_terminacion" NOT NULL,
    "fecha_retiro" DATE NOT NULL,
    "preaviso_dias" INTEGER,
    "indemnizacion" DECIMAL(14,2),
    "motivo" TEXT,
    "estado" "estado_terminacion" NOT NULL DEFAULT 'EN_PROCESO',
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "terminacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "liquidacion_definitiva" (
    "id" UUID NOT NULL,
    "terminacion_id" UUID NOT NULL,
    "dias_liquidados" INTEGER NOT NULL,
    "salario_base" DECIMAL(14,2) NOT NULL,
    "cesantias" DECIMAL(14,2) NOT NULL,
    "intereses_cesantias" DECIMAL(14,2) NOT NULL,
    "prima" DECIMAL(14,2) NOT NULL,
    "vacaciones" DECIMAL(14,2) NOT NULL,
    "indemnizacion" DECIMAL(14,2) NOT NULL,
    "otros" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "deducciones" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(14,2) NOT NULL,
    "detalle" JSONB,
    "documento_id" UUID,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "liquidacion_definitiva_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paz_y_salvo" (
    "id" UUID NOT NULL,
    "terminacion_id" UUID NOT NULL,
    "estado" "estado_paz_y_salvo" NOT NULL DEFAULT 'PENDIENTE',
    "documento_id" UUID,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paz_y_salvo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paz_y_salvo_item" (
    "id" UUID NOT NULL,
    "paz_y_salvo_id" UUID NOT NULL,
    "area" TEXT NOT NULL,
    "concepto" TEXT NOT NULL,
    "cumplido" BOOLEAN NOT NULL DEFAULT false,
    "observacion" TEXT,
    "verificado_por_id" UUID,
    "verificado_en" TIMESTAMP(3),

    CONSTRAINT "paz_y_salvo_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "terminacion_colaborador_id_idx" ON "terminacion"("colaborador_id");

-- CreateIndex
CREATE UNIQUE INDEX "liquidacion_definitiva_terminacion_id_key" ON "liquidacion_definitiva"("terminacion_id");

-- CreateIndex
CREATE UNIQUE INDEX "paz_y_salvo_terminacion_id_key" ON "paz_y_salvo"("terminacion_id");

-- CreateIndex
CREATE INDEX "paz_y_salvo_item_paz_y_salvo_id_idx" ON "paz_y_salvo_item"("paz_y_salvo_id");

-- AddForeignKey
ALTER TABLE "terminacion" ADD CONSTRAINT "terminacion_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidacion_definitiva" ADD CONSTRAINT "liquidacion_definitiva_terminacion_id_fkey" FOREIGN KEY ("terminacion_id") REFERENCES "terminacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paz_y_salvo" ADD CONSTRAINT "paz_y_salvo_terminacion_id_fkey" FOREIGN KEY ("terminacion_id") REFERENCES "terminacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paz_y_salvo_item" ADD CONSTRAINT "paz_y_salvo_item_paz_y_salvo_id_fkey" FOREIGN KEY ("paz_y_salvo_id") REFERENCES "paz_y_salvo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
