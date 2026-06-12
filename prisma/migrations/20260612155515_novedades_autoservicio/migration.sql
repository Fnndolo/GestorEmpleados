-- CreateEnum
CREATE TYPE "tipo_incapacidad" AS ENUM ('ENFERMEDAD_GENERAL', 'ACCIDENTE_TRABAJO', 'ENFERMEDAD_LABORAL', 'LICENCIA_MATERNIDAD', 'LICENCIA_PATERNIDAD');

-- CreateEnum
CREATE TYPE "tipo_licencia" AS ENUM ('MATERNIDAD', 'PATERNIDAD', 'LUTO', 'CALAMIDAD', 'MATRIMONIO', 'ESTUDIO', 'NO_REMUNERADA', 'DIA_DE_LA_FAMILIA', 'OTRA');

-- CreateEnum
CREATE TYPE "estado_vacaciones" AS ENUM ('SOLICITADA', 'APROBADA', 'EN_DISFRUTE', 'DISFRUTADA', 'RECHAZADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "estado_bonificacion" AS ENUM ('PENDIENTE', 'PAGADO');

-- CreateEnum
CREATE TYPE "tipo_solicitud" AS ENUM ('VACACIONES', 'PERMISO', 'CERTIFICACION_LABORAL', 'LICENCIA', 'OTRA');

-- CreateEnum
CREATE TYPE "estado_solicitud" AS ENUM ('PENDIENTE', 'EN_APROBACION', 'APROBADA', 'RECHAZADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "estado_paso_aprobacion" AS ENUM ('PENDIENTE', 'APROBADO', 'RECHAZADO', 'OMITIDO');

-- CreateEnum
CREATE TYPE "tipo_certificacion" AS ENUM ('SIMPLE', 'CON_SALARIO', 'CON_FUNCIONES', 'ENTIDAD_FINANCIERA');

-- CreateEnum
CREATE TYPE "estado_certificacion" AS ENUM ('SOLICITADA', 'GENERADA', 'ENTREGADA');

-- CreateTable
CREATE TABLE "incapacidad" (
    "id" UUID NOT NULL,
    "colaborador_id" UUID NOT NULL,
    "tipo" "tipo_incapacidad" NOT NULL,
    "fecha_inicio" DATE NOT NULL,
    "fecha_fin" DATE NOT NULL,
    "dias" INTEGER NOT NULL,
    "diagnostico_cie10" TEXT,
    "entidad" TEXT,
    "es_prorroga" BOOLEAN NOT NULL DEFAULT false,
    "observaciones" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "incapacidad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "licencia" (
    "id" UUID NOT NULL,
    "colaborador_id" UUID NOT NULL,
    "tipo" "tipo_licencia" NOT NULL,
    "fecha_inicio" DATE NOT NULL,
    "fecha_fin" DATE NOT NULL,
    "dias" INTEGER NOT NULL,
    "remunerada" BOOLEAN NOT NULL DEFAULT true,
    "observaciones" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "licencia_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permiso" (
    "id" UUID NOT NULL,
    "colaborador_id" UUID NOT NULL,
    "fecha" DATE NOT NULL,
    "horas" DECIMAL(4,1),
    "dia_completo" BOOLEAN NOT NULL DEFAULT false,
    "motivo" TEXT NOT NULL,
    "remunerado" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permiso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vacaciones" (
    "id" UUID NOT NULL,
    "colaborador_id" UUID NOT NULL,
    "fecha_inicio" DATE NOT NULL,
    "fecha_fin" DATE NOT NULL,
    "dias_habiles" DECIMAL(5,2) NOT NULL,
    "estado" "estado_vacaciones" NOT NULL DEFAULT 'SOLICITADA',
    "observaciones" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vacaciones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bonificacion" (
    "id" UUID NOT NULL,
    "colaborador_id" UUID NOT NULL,
    "concepto" TEXT NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "constitutivo_salario" BOOLEAN NOT NULL DEFAULT false,
    "estado_pago" "estado_bonificacion" NOT NULL DEFAULT 'PENDIENTE',
    "fecha_pago" DATE,
    "observaciones" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "bonificacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "solicitud" (
    "id" UUID NOT NULL,
    "colaborador_id" UUID NOT NULL,
    "tipo" "tipo_solicitud" NOT NULL,
    "datos" JSONB NOT NULL,
    "estado" "estado_solicitud" NOT NULL DEFAULT 'EN_APROBACION',
    "resultado" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "solicitud_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paso_aprobacion" (
    "id" UUID NOT NULL,
    "solicitud_id" UUID NOT NULL,
    "orden" INTEGER NOT NULL,
    "rolAprobador" TEXT,
    "usa_jefe_inmediato" BOOLEAN NOT NULL DEFAULT false,
    "estado" "estado_paso_aprobacion" NOT NULL DEFAULT 'PENDIENTE',
    "decidido_por_id" UUID,
    "decidido_en" TIMESTAMP(3),
    "comentario" TEXT,

    CONSTRAINT "paso_aprobacion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "certificacion_laboral" (
    "id" UUID NOT NULL,
    "colaborador_id" UUID NOT NULL,
    "tipo" "tipo_certificacion" NOT NULL,
    "dirigida_a" TEXT,
    "estado" "estado_certificacion" NOT NULL DEFAULT 'GENERADA',
    "documento_id" UUID,
    "generado_por_id" UUID,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "certificacion_laboral_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "incapacidad_colaborador_id_idx" ON "incapacidad"("colaborador_id");

-- CreateIndex
CREATE INDEX "licencia_colaborador_id_idx" ON "licencia"("colaborador_id");

-- CreateIndex
CREATE INDEX "permiso_colaborador_id_idx" ON "permiso"("colaborador_id");

-- CreateIndex
CREATE INDEX "vacaciones_colaborador_id_estado_idx" ON "vacaciones"("colaborador_id", "estado");

-- CreateIndex
CREATE INDEX "bonificacion_colaborador_id_idx" ON "bonificacion"("colaborador_id");

-- CreateIndex
CREATE INDEX "solicitud_colaborador_id_estado_idx" ON "solicitud"("colaborador_id", "estado");

-- CreateIndex
CREATE INDEX "solicitud_estado_idx" ON "solicitud"("estado");

-- CreateIndex
CREATE INDEX "paso_aprobacion_solicitud_id_orden_idx" ON "paso_aprobacion"("solicitud_id", "orden");

-- CreateIndex
CREATE INDEX "certificacion_laboral_colaborador_id_idx" ON "certificacion_laboral"("colaborador_id");

-- AddForeignKey
ALTER TABLE "incapacidad" ADD CONSTRAINT "incapacidad_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "licencia" ADD CONSTRAINT "licencia_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "permiso" ADD CONSTRAINT "permiso_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vacaciones" ADD CONSTRAINT "vacaciones_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bonificacion" ADD CONSTRAINT "bonificacion_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "solicitud" ADD CONSTRAINT "solicitud_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "paso_aprobacion" ADD CONSTRAINT "paso_aprobacion_solicitud_id_fkey" FOREIGN KEY ("solicitud_id") REFERENCES "solicitud"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "certificacion_laboral" ADD CONSTRAINT "certificacion_laboral_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;
