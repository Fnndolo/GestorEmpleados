-- CreateEnum
CREATE TYPE "tipo_concepto" AS ENUM ('DEVENGADO', 'DEDUCCION', 'PROVISION', 'APORTE_PATRONAL');

-- CreateEnum
CREATE TYPE "tipo_calculo_concepto" AS ENUM ('VALOR_FIJO', 'PORCENTAJE_BASE', 'CANTIDAD_POR_VALOR', 'SISTEMA');

-- CreateEnum
CREATE TYPE "tipo_periodo_nomina" AS ENUM ('MENSUAL', 'QUINCENAL');

-- CreateEnum
CREATE TYPE "estado_periodo_nomina" AS ENUM ('BORRADOR', 'CALCULADA', 'APROBADA', 'CERRADA', 'PAGADA');

-- CreateEnum
CREATE TYPE "tipo_comision" AS ENUM ('VENTA', 'RECAUDO');

-- CreateEnum
CREATE TYPE "estado_prestamo" AS ENUM ('ACTIVO', 'PAGADO', 'CANCELADO');

-- CreateTable
CREATE TABLE "parametro_legal" (
    "id" UUID NOT NULL,
    "clave" TEXT NOT NULL,
    "valor" DECIMAL(14,4) NOT NULL,
    "vigencia_desde" DATE NOT NULL,
    "vigencia_hasta" DATE,
    "fuente_legal" TEXT NOT NULL,
    "descripcion" TEXT,

    CONSTRAINT "parametro_legal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "concepto_nomina" (
    "id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "tipo_concepto" NOT NULL,
    "tipo_calculo" "tipo_calculo_concepto" NOT NULL DEFAULT 'SISTEMA',
    "constitutivo_salario" BOOLEAN NOT NULL DEFAULT false,
    "afecta_ibc_ss" BOOLEAN NOT NULL DEFAULT false,
    "base_prestaciones" BOOLEAN NOT NULL DEFAULT false,
    "base_vacaciones" BOOLEAN NOT NULL DEFAULT false,
    "afecta_retefuente" BOOLEAN NOT NULL DEFAULT false,
    "porcentaje" DECIMAL(8,4),
    "valor_fijo" DECIMAL(14,2),
    "cuenta_contable" TEXT,
    "es_sistema" BOOLEAN NOT NULL DEFAULT false,
    "activo" BOOLEAN NOT NULL DEFAULT true,
    "orden" INTEGER NOT NULL DEFAULT 100,

    CONSTRAINT "concepto_nomina_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tipo_hora" (
    "id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "nombre" TEXT NOT NULL,
    "factor" DECIMAL(6,4) NOT NULL,
    "vigente_desde" DATE NOT NULL,
    "vigente_hasta" DATE,

    CONSTRAINT "tipo_hora_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "periodo_nomina" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "tipo" "tipo_periodo_nomina" NOT NULL DEFAULT 'MENSUAL',
    "anio" INTEGER NOT NULL,
    "mes" INTEGER NOT NULL,
    "quincena" INTEGER,
    "fecha_inicio" DATE NOT NULL,
    "fecha_fin" DATE NOT NULL,
    "dias_periodo" INTEGER NOT NULL,
    "estado" "estado_periodo_nomina" NOT NULL DEFAULT 'BORRADOR',
    "parametros_snapshot" JSONB,
    "es_ajuste" BOOLEAN NOT NULL DEFAULT false,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "periodo_nomina_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "liquidacion_nomina" (
    "id" UUID NOT NULL,
    "periodo_id" UUID NOT NULL,
    "colaborador_id" UUID NOT NULL,
    "dias_trabajados" DECIMAL(5,2) NOT NULL,
    "salario_base" DECIMAL(14,2) NOT NULL,
    "ibc" DECIMAL(14,2) NOT NULL,
    "total_devengado" DECIMAL(14,2) NOT NULL,
    "total_deducido" DECIMAL(14,2) NOT NULL,
    "neto" DECIMAL(14,2) NOT NULL,
    "documento_id" UUID,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "liquidacion_nomina_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "detalle_nomina" (
    "id" UUID NOT NULL,
    "liquidacion_id" UUID NOT NULL,
    "concepto_codigo" TEXT NOT NULL,
    "concepto_nombre" TEXT NOT NULL,
    "tipo" "tipo_concepto" NOT NULL,
    "cantidad" DECIMAL(8,2),
    "base" DECIMAL(14,2),
    "factor" DECIMAL(8,4),
    "valor" DECIMAL(14,2) NOT NULL,
    "cuenta_contable" TEXT,

    CONSTRAINT "detalle_nomina_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "novedad_horas" (
    "id" UUID NOT NULL,
    "colaborador_id" UUID NOT NULL,
    "periodo_id" UUID,
    "fecha" DATE NOT NULL,
    "hora_inicio" TEXT NOT NULL,
    "hora_fin" TEXT NOT NULL,
    "tipo_hora" TEXT NOT NULL,
    "horas" DECIMAL(5,2) NOT NULL,
    "observaciones" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "novedad_horas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comision" (
    "id" UUID NOT NULL,
    "colaborador_id" UUID NOT NULL,
    "periodo_id" UUID,
    "tipo" "tipo_comision" NOT NULL,
    "base_calculo" DECIMAL(14,2) NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "descripcion" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comision_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prestamo" (
    "id" UUID NOT NULL,
    "colaborador_id" UUID NOT NULL,
    "valor_total" DECIMAL(14,2) NOT NULL,
    "numero_cuotas" INTEGER NOT NULL,
    "valor_cuota" DECIMAL(14,2) NOT NULL,
    "saldo" DECIMAL(14,2) NOT NULL,
    "fecha_inicio" DATE NOT NULL,
    "estado" "estado_prestamo" NOT NULL DEFAULT 'ACTIVO',
    "descripcion" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prestamo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cuota_prestamo" (
    "id" UUID NOT NULL,
    "prestamo_id" UUID NOT NULL,
    "numero" INTEGER NOT NULL,
    "valor" DECIMAL(14,2) NOT NULL,
    "pagada" BOOLEAN NOT NULL DEFAULT false,
    "periodo_id" UUID,
    "fecha_pago" DATE,

    CONSTRAINT "cuota_prestamo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planilla_pila" (
    "id" UUID NOT NULL,
    "periodo" TEXT NOT NULL,
    "fecha_limite" DATE NOT NULL,
    "fecha_pago" DATE,
    "valor_total" DECIMAL(14,2),
    "pagada" BOOLEAN NOT NULL DEFAULT false,
    "documento_id" UUID,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planilla_pila_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "parametro_legal_clave_vigencia_desde_idx" ON "parametro_legal"("clave", "vigencia_desde");

-- CreateIndex
CREATE UNIQUE INDEX "concepto_nomina_codigo_key" ON "concepto_nomina"("codigo");

-- CreateIndex
CREATE INDEX "tipo_hora_codigo_vigente_desde_idx" ON "tipo_hora"("codigo", "vigente_desde");

-- CreateIndex
CREATE INDEX "liquidacion_nomina_colaborador_id_idx" ON "liquidacion_nomina"("colaborador_id");

-- CreateIndex
CREATE UNIQUE INDEX "liquidacion_nomina_periodo_id_colaborador_id_key" ON "liquidacion_nomina"("periodo_id", "colaborador_id");

-- CreateIndex
CREATE INDEX "detalle_nomina_liquidacion_id_idx" ON "detalle_nomina"("liquidacion_id");

-- CreateIndex
CREATE INDEX "novedad_horas_colaborador_id_periodo_id_idx" ON "novedad_horas"("colaborador_id", "periodo_id");

-- CreateIndex
CREATE INDEX "comision_colaborador_id_periodo_id_idx" ON "comision"("colaborador_id", "periodo_id");

-- CreateIndex
CREATE INDEX "prestamo_colaborador_id_estado_idx" ON "prestamo"("colaborador_id", "estado");

-- CreateIndex
CREATE INDEX "cuota_prestamo_prestamo_id_idx" ON "cuota_prestamo"("prestamo_id");

-- CreateIndex
CREATE UNIQUE INDEX "planilla_pila_periodo_key" ON "planilla_pila"("periodo");

-- AddForeignKey
ALTER TABLE "liquidacion_nomina" ADD CONSTRAINT "liquidacion_nomina_periodo_id_fkey" FOREIGN KEY ("periodo_id") REFERENCES "periodo_nomina"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "liquidacion_nomina" ADD CONSTRAINT "liquidacion_nomina_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "detalle_nomina" ADD CONSTRAINT "detalle_nomina_liquidacion_id_fkey" FOREIGN KEY ("liquidacion_id") REFERENCES "liquidacion_nomina"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "novedad_horas" ADD CONSTRAINT "novedad_horas_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "novedad_horas" ADD CONSTRAINT "novedad_horas_periodo_id_fkey" FOREIGN KEY ("periodo_id") REFERENCES "periodo_nomina"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comision" ADD CONSTRAINT "comision_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comision" ADD CONSTRAINT "comision_periodo_id_fkey" FOREIGN KEY ("periodo_id") REFERENCES "periodo_nomina"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prestamo" ADD CONSTRAINT "prestamo_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cuota_prestamo" ADD CONSTRAINT "cuota_prestamo_prestamo_id_fkey" FOREIGN KEY ("prestamo_id") REFERENCES "prestamo"("id") ON DELETE CASCADE ON UPDATE CASCADE;
