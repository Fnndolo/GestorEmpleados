-- CreateEnum
CREATE TYPE "tipo_comite" AS ENUM ('VIGIA_SST', 'COPASST', 'CONVIVENCIA');

-- CreateEnum
CREATE TYPE "nivel_riesgo_ipevr" AS ENUM ('BAJO', 'MEDIO', 'ALTO', 'CRITICO');

-- CreateEnum
CREATE TYPE "tipo_examen_medico" AS ENUM ('INGRESO', 'PERIODICO', 'EGRESO', 'POST_INCAPACIDAD');

-- CreateEnum
CREATE TYPE "concepto_examen" AS ENUM ('APTO', 'APTO_CON_RECOMENDACIONES', 'NO_APTO', 'APLAZADO');

-- CreateEnum
CREATE TYPE "estado_accidente" AS ENUM ('REPORTADO', 'EN_INVESTIGACION', 'CERRADO');

-- CreateTable
CREATE TABLE "comite" (
    "id" UUID NOT NULL,
    "tipo" "tipo_comite" NOT NULL,
    "fecha_conformacion" DATE NOT NULL,
    "vigencia_hasta" DATE NOT NULL,
    "sede_id" UUID,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "miembro_comite" (
    "id" UUID NOT NULL,
    "comite_id" UUID NOT NULL,
    "colaborador_id" UUID NOT NULL,
    "rol" TEXT NOT NULL,
    "por_empleador" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "miembro_comite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reunion_comite" (
    "id" UUID NOT NULL,
    "comite_id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "temas" TEXT NOT NULL,
    "compromisos" TEXT,
    "acta_doc_id" UUID,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reunion_comite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "peligro_ipevr" (
    "id" UUID NOT NULL,
    "sede_id" UUID,
    "proceso" TEXT NOT NULL,
    "peligro" TEXT NOT NULL,
    "riesgo" TEXT NOT NULL,
    "nivel" "nivel_riesgo_ipevr" NOT NULL,
    "controles" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "peligro_ipevr_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "examen_medico" (
    "id" UUID NOT NULL,
    "colaborador_id" UUID NOT NULL,
    "tipo" "tipo_examen_medico" NOT NULL,
    "fecha" DATE NOT NULL,
    "fecha_vencimiento" DATE,
    "concepto" "concepto_examen" NOT NULL DEFAULT 'APTO',
    "recomendaciones" TEXT,
    "restricciones" TEXT,
    "documento_id" UUID,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "examen_medico_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accidente_trabajo" (
    "id" UUID NOT NULL,
    "colaborador_id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "hora" TEXT,
    "sede_id" UUID,
    "descripcion" TEXT NOT NULL,
    "parte_cuerpo" TEXT,
    "dias_incapacidad" INTEGER,
    "furat_reportado" BOOLEAN NOT NULL DEFAULT false,
    "investigacion" TEXT,
    "estado" "estado_accidente" NOT NULL DEFAULT 'REPORTADO',
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accidente_trabajo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "elemento_epp" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "vida_util_meses" INTEGER,
    "activo" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "elemento_epp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entrega_epp" (
    "id" UUID NOT NULL,
    "elemento_epp_id" UUID NOT NULL,
    "colaborador_id" UUID NOT NULL,
    "cantidad" INTEGER NOT NULL DEFAULT 1,
    "fecha_entrega" DATE NOT NULL,
    "reposicion" BOOLEAN NOT NULL DEFAULT false,
    "soporte_doc_id" UUID,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entrega_epp_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "autoevaluacion_sst" (
    "id" UUID NOT NULL,
    "anio" INTEGER NOT NULL,
    "puntaje" DECIMAL(5,2) NOT NULL,
    "nivel_estandar" INTEGER NOT NULL,
    "plan_mejora" TEXT,
    "documento_id" UUID,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "autoevaluacion_sst_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "indicador_sst" (
    "id" UUID NOT NULL,
    "anio" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "num_trabajadores" INTEGER NOT NULL,
    "horas_hombre" DECIMAL(12,2) NOT NULL,
    "num_accidentes" INTEGER NOT NULL DEFAULT 0,
    "dias_perdidos" INTEGER NOT NULL DEFAULT 0,
    "dias_ausentismo" INTEGER NOT NULL DEFAULT 0,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "indicador_sst_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "reunion_comite_comite_id_idx" ON "reunion_comite"("comite_id");

-- CreateIndex
CREATE INDEX "examen_medico_colaborador_id_idx" ON "examen_medico"("colaborador_id");

-- CreateIndex
CREATE INDEX "accidente_trabajo_colaborador_id_idx" ON "accidente_trabajo"("colaborador_id");

-- CreateIndex
CREATE UNIQUE INDEX "elemento_epp_nombre_key" ON "elemento_epp"("nombre");

-- CreateIndex
CREATE INDEX "entrega_epp_colaborador_id_idx" ON "entrega_epp"("colaborador_id");

-- CreateIndex
CREATE UNIQUE INDEX "autoevaluacion_sst_anio_key" ON "autoevaluacion_sst"("anio");

-- CreateIndex
CREATE UNIQUE INDEX "indicador_sst_anio_mes_key" ON "indicador_sst"("anio", "mes");

-- AddForeignKey
ALTER TABLE "miembro_comite" ADD CONSTRAINT "miembro_comite_comite_id_fkey" FOREIGN KEY ("comite_id") REFERENCES "comite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reunion_comite" ADD CONSTRAINT "reunion_comite_comite_id_fkey" FOREIGN KEY ("comite_id") REFERENCES "comite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examen_medico" ADD CONSTRAINT "examen_medico_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accidente_trabajo" ADD CONSTRAINT "accidente_trabajo_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entrega_epp" ADD CONSTRAINT "entrega_epp_elemento_epp_id_fkey" FOREIGN KEY ("elemento_epp_id") REFERENCES "elemento_epp"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entrega_epp" ADD CONSTRAINT "entrega_epp_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
