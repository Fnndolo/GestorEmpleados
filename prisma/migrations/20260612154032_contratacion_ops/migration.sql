-- CreateEnum
CREATE TYPE "tipo_contrato_laboral" AS ENUM ('TERMINO_FIJO', 'TERMINO_INDEFINIDO', 'OBRA_LABOR', 'APRENDIZAJE_SENA', 'PRACTICA');

-- CreateEnum
CREATE TYPE "tipo_salario" AS ENUM ('ORDINARIO', 'INTEGRAL');

-- CreateEnum
CREATE TYPE "jornada" AS ENUM ('TIEMPO_COMPLETO', 'MEDIO_TIEMPO', 'POR_DIAS');

-- CreateEnum
CREATE TYPE "estado_contrato" AS ENUM ('BORRADOR', 'ACTIVO', 'SUSPENDIDO', 'TERMINADO');

-- CreateEnum
CREATE TYPE "etapa_aprendizaje" AS ENUM ('LECTIVA', 'PRODUCTIVA');

-- CreateEnum
CREATE TYPE "tipo_cambio_otrosi" AS ENUM ('SALARIO', 'CARGO', 'SEDE', 'MODALIDAD_TRABAJO', 'JORNADA', 'FUNCIONES', 'DURACION', 'OTRO');

-- CreateEnum
CREATE TYPE "causa_suspension" AS ENUM ('SANCION_DISCIPLINARIA', 'LICENCIA_NO_REMUNERADA', 'FUERZA_MAYOR', 'OTRO');

-- CreateEnum
CREATE TYPE "estado_contrato_ops" AS ENUM ('BORRADOR', 'ACTIVO', 'TERMINADO');

-- CreateEnum
CREATE TYPE "estado_cuenta_cobro" AS ENUM ('RADICADA', 'EN_VERIFICACION_SS', 'BLOQUEADA_SS', 'APROBADA', 'PAGADA', 'RECHAZADA');

-- CreateEnum
CREATE TYPE "estado_verificacion_ss" AS ENUM ('PENDIENTE', 'VALIDA', 'INVALIDA');

-- CreateTable
CREATE TABLE "contrato" (
    "id" UUID NOT NULL,
    "numero" TEXT NOT NULL,
    "colaborador_id" UUID NOT NULL,
    "tipo" "tipo_contrato_laboral" NOT NULL,
    "cargo_id" UUID,
    "sede_id" UUID NOT NULL,
    "jornada" "jornada" NOT NULL DEFAULT 'TIEMPO_COMPLETO',
    "horas_semanales" INTEGER,
    "modalidad_trabajo" "modalidad_trabajo" NOT NULL,
    "salario_base" DECIMAL(14,2) NOT NULL,
    "tipo_salario" "tipo_salario" NOT NULL DEFAULT 'ORDINARIO',
    "fecha_inicio" DATE NOT NULL,
    "fecha_fin" DATE,
    "objeto_obra_labor" TEXT,
    "etapa_aprendizaje" "etapa_aprendizaje",
    "apoyo_sostenimiento" DECIMAL(14,2),
    "periodo_prueba_dias" INTEGER,
    "periodo_prueba_fin" DATE,
    "estado" "estado_contrato" NOT NULL DEFAULT 'BORRADOR',
    "observaciones" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contrato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prorroga_contrato" (
    "id" UUID NOT NULL,
    "contrato_id" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "fecha_inicio" DATE NOT NULL,
    "fecha_fin" DATE NOT NULL,
    "fecha_firma" DATE,

    CONSTRAINT "prorroga_contrato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "otrosi_contrato" (
    "id" UUID NOT NULL,
    "contrato_id" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "fecha" DATE NOT NULL,
    "tipos_cambio" "tipo_cambio_otrosi"[],
    "descripcion" TEXT NOT NULL,
    "valores_anteriores" JSONB,
    "valores_nuevos" JSONB,

    CONSTRAINT "otrosi_contrato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suspension_contrato" (
    "id" UUID NOT NULL,
    "contrato_id" UUID NOT NULL,
    "fecha_inicio" DATE NOT NULL,
    "fecha_fin" DATE,
    "causa" "causa_suspension" NOT NULL,
    "descripcion" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "suspension_contrato_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "variacion_salarial" (
    "id" UUID NOT NULL,
    "colaborador_id" UUID NOT NULL,
    "salario_anterior" DECIMAL(14,2) NOT NULL,
    "salario_nuevo" DECIMAL(14,2) NOT NULL,
    "fecha_vigencia" DATE NOT NULL,
    "motivo" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "variacion_salarial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contrato_ops" (
    "id" UUID NOT NULL,
    "numero" TEXT NOT NULL,
    "colaborador_id" UUID NOT NULL,
    "objeto" TEXT NOT NULL,
    "valor_total" DECIMAL(14,2) NOT NULL,
    "valor_mensual" DECIMAL(14,2),
    "supervisor_id" UUID,
    "sede_id" UUID NOT NULL,
    "fecha_inicio" DATE NOT NULL,
    "fecha_fin" DATE NOT NULL,
    "rut" TEXT,
    "estado" "estado_contrato_ops" NOT NULL DEFAULT 'ACTIVO',
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contrato_ops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entregable_ops" (
    "id" UUID NOT NULL,
    "contrato_ops_id" UUID NOT NULL,
    "descripcion" TEXT NOT NULL,
    "fecha_entrega" DATE,
    "cumplido" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "entregable_ops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cuenta_cobro_ops" (
    "id" UUID NOT NULL,
    "contrato_ops_id" UUID NOT NULL,
    "numero" TEXT NOT NULL,
    "periodo" TEXT NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "fecha_radicacion" DATE NOT NULL,
    "estado" "estado_cuenta_cobro" NOT NULL DEFAULT 'RADICADA',
    "observaciones" TEXT,
    "fecha_pago" DATE,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cuenta_cobro_ops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "soporte_ss_ops" (
    "id" UUID NOT NULL,
    "cuenta_cobro_id" UUID NOT NULL,
    "operador" TEXT,
    "periodo_cotizado" TEXT NOT NULL,
    "ibc_declarado" DECIMAL(14,2),
    "estado_verificacion" "estado_verificacion_ss" NOT NULL DEFAULT 'PENDIENTE',
    "verificado_por_id" UUID,
    "verificado_en" TIMESTAMP(3),
    "observaciones" TEXT,

    CONSTRAINT "soporte_ss_ops_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plantilla_documento" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "categoria" TEXT NOT NULL,
    "tipo_vinculo" "tipo_vinculo",
    "contenido" TEXT NOT NULL,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "plantilla_documento_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "contrato_numero_key" ON "contrato"("numero");

-- CreateIndex
CREATE INDEX "contrato_colaborador_id_estado_idx" ON "contrato"("colaborador_id", "estado");

-- CreateIndex
CREATE INDEX "contrato_tipo_estado_fecha_fin_idx" ON "contrato"("tipo", "estado", "fecha_fin");

-- CreateIndex
CREATE INDEX "contrato_sede_id_idx" ON "contrato"("sede_id");

-- CreateIndex
CREATE UNIQUE INDEX "prorroga_contrato_contrato_id_numero_key" ON "prorroga_contrato"("contrato_id", "numero");

-- CreateIndex
CREATE UNIQUE INDEX "otrosi_contrato_contrato_id_numero_key" ON "otrosi_contrato"("contrato_id", "numero");

-- CreateIndex
CREATE INDEX "suspension_contrato_contrato_id_idx" ON "suspension_contrato"("contrato_id");

-- CreateIndex
CREATE INDEX "variacion_salarial_colaborador_id_idx" ON "variacion_salarial"("colaborador_id");

-- CreateIndex
CREATE UNIQUE INDEX "contrato_ops_numero_key" ON "contrato_ops"("numero");

-- CreateIndex
CREATE INDEX "contrato_ops_colaborador_id_estado_idx" ON "contrato_ops"("colaborador_id", "estado");

-- CreateIndex
CREATE INDEX "contrato_ops_sede_id_idx" ON "contrato_ops"("sede_id");

-- CreateIndex
CREATE INDEX "entregable_ops_contrato_ops_id_idx" ON "entregable_ops"("contrato_ops_id");

-- CreateIndex
CREATE INDEX "cuenta_cobro_ops_estado_idx" ON "cuenta_cobro_ops"("estado");

-- CreateIndex
CREATE UNIQUE INDEX "cuenta_cobro_ops_contrato_ops_id_periodo_key" ON "cuenta_cobro_ops"("contrato_ops_id", "periodo");

-- CreateIndex
CREATE UNIQUE INDEX "soporte_ss_ops_cuenta_cobro_id_key" ON "soporte_ss_ops"("cuenta_cobro_id");

-- AddForeignKey
ALTER TABLE "contrato" ADD CONSTRAINT "contrato_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrato" ADD CONSTRAINT "contrato_cargo_id_fkey" FOREIGN KEY ("cargo_id") REFERENCES "cargo"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrato" ADD CONSTRAINT "contrato_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sede"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prorroga_contrato" ADD CONSTRAINT "prorroga_contrato_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "contrato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "otrosi_contrato" ADD CONSTRAINT "otrosi_contrato_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "contrato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suspension_contrato" ADD CONSTRAINT "suspension_contrato_contrato_id_fkey" FOREIGN KEY ("contrato_id") REFERENCES "contrato"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "variacion_salarial" ADD CONSTRAINT "variacion_salarial_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrato_ops" ADD CONSTRAINT "contrato_ops_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrato_ops" ADD CONSTRAINT "contrato_ops_supervisor_id_fkey" FOREIGN KEY ("supervisor_id") REFERENCES "colaborador"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contrato_ops" ADD CONSTRAINT "contrato_ops_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sede"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entregable_ops" ADD CONSTRAINT "entregable_ops_contrato_ops_id_fkey" FOREIGN KEY ("contrato_ops_id") REFERENCES "contrato_ops"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuenta_cobro_ops" ADD CONSTRAINT "cuenta_cobro_ops_contrato_ops_id_fkey" FOREIGN KEY ("contrato_ops_id") REFERENCES "contrato_ops"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "soporte_ss_ops" ADD CONSTRAINT "soporte_ss_ops_cuenta_cobro_id_fkey" FOREIGN KEY ("cuenta_cobro_id") REFERENCES "cuenta_cobro_ops"("id") ON DELETE CASCADE ON UPDATE CASCADE;
