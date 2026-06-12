-- CreateEnum
CREATE TYPE "estado_activo" AS ENUM ('DISPONIBLE', 'ASIGNADO', 'EN_MANTENIMIENTO', 'DADO_DE_BAJA');

-- CreateEnum
CREATE TYPE "tipo_capacitacion" AS ENUM ('INDUCCION', 'REINDUCCION', 'FORMACION', 'SST');

-- CreateTable
CREATE TABLE "activo" (
    "id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" TEXT NOT NULL,
    "marca" TEXT,
    "serie" TEXT,
    "valor" DECIMAL(14,2),
    "sede_id" UUID,
    "estado" "estado_activo" NOT NULL DEFAULT 'DISPONIBLE',
    "observaciones" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asignacion_activo" (
    "id" UUID NOT NULL,
    "activo_id" UUID NOT NULL,
    "colaborador_id" UUID NOT NULL,
    "fecha_entrega" DATE NOT NULL,
    "fecha_devolucion" DATE,
    "acta_entrega_doc_id" UUID,
    "acta_devolucion_doc_id" UUID,
    "observaciones" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "asignacion_activo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entrega_dotacion" (
    "id" UUID NOT NULL,
    "colaborador_id" UUID NOT NULL,
    "anio" INTEGER NOT NULL,
    "corte" TEXT NOT NULL,
    "items" TEXT NOT NULL,
    "fecha_entrega" DATE NOT NULL,
    "recibido_doc_id" UUID,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entrega_dotacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "capacitacion" (
    "id" UUID NOT NULL,
    "titulo" TEXT NOT NULL,
    "tipo" "tipo_capacitacion" NOT NULL DEFAULT 'FORMACION',
    "fecha" DATE NOT NULL,
    "duracion_horas" DECIMAL(5,1),
    "facilitador" TEXT,
    "descripcion" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "capacitacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "asistencia_capacitacion" (
    "id" UUID NOT NULL,
    "capacitacion_id" UUID NOT NULL,
    "colaborador_id" UUID NOT NULL,
    "asistio" BOOLEAN NOT NULL DEFAULT true,
    "evaluacion" DECIMAL(5,2),

    CONSTRAINT "asistencia_capacitacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evaluacion_desempeno" (
    "id" UUID NOT NULL,
    "colaborador_id" UUID NOT NULL,
    "periodo" TEXT NOT NULL,
    "evaluador_id" UUID,
    "puntaje" DECIMAL(5,2) NOT NULL,
    "fortalezas" TEXT,
    "oportunidades" TEXT,
    "compromisos" TEXT,
    "fecha" DATE NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evaluacion_desempeno_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "activo_codigo_key" ON "activo"("codigo");

-- CreateIndex
CREATE INDEX "activo_estado_idx" ON "activo"("estado");

-- CreateIndex
CREATE INDEX "asignacion_activo_colaborador_id_idx" ON "asignacion_activo"("colaborador_id");

-- CreateIndex
CREATE INDEX "asignacion_activo_activo_id_idx" ON "asignacion_activo"("activo_id");

-- CreateIndex
CREATE INDEX "entrega_dotacion_colaborador_id_idx" ON "entrega_dotacion"("colaborador_id");

-- CreateIndex
CREATE UNIQUE INDEX "asistencia_capacitacion_capacitacion_id_colaborador_id_key" ON "asistencia_capacitacion"("capacitacion_id", "colaborador_id");

-- CreateIndex
CREATE INDEX "evaluacion_desempeno_colaborador_id_idx" ON "evaluacion_desempeno"("colaborador_id");

-- AddForeignKey
ALTER TABLE "activo" ADD CONSTRAINT "activo_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sede"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asignacion_activo" ADD CONSTRAINT "asignacion_activo_activo_id_fkey" FOREIGN KEY ("activo_id") REFERENCES "activo"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asignacion_activo" ADD CONSTRAINT "asignacion_activo_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entrega_dotacion" ADD CONSTRAINT "entrega_dotacion_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asistencia_capacitacion" ADD CONSTRAINT "asistencia_capacitacion_capacitacion_id_fkey" FOREIGN KEY ("capacitacion_id") REFERENCES "capacitacion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "asistencia_capacitacion" ADD CONSTRAINT "asistencia_capacitacion_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evaluacion_desempeno" ADD CONSTRAINT "evaluacion_desempeno_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
