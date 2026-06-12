-- CreateEnum
CREATE TYPE "categoria_doc_legal" AS ENUM ('REGLAMENTO_INTERNO', 'POLITICA', 'CONVENIO_FINANCIERA', 'POLIZA', 'ARRIENDO', 'MARCA', 'DOMINIO_WEB', 'LICENCIA_SOFTWARE', 'ACUERDO_TRANSMISION_DATOS', 'PERMISO_ESTABLECIMIENTO', 'OTRO');

-- CreateEnum
CREATE TYPE "etapa_disciplinaria" AS ENUM ('CITACION_DESCARGOS', 'DESCARGOS', 'DECISION', 'RECURSO', 'CERRADO');

-- CreateEnum
CREATE TYPE "estado_denuncia" AS ENUM ('RECIBIDA', 'EN_INVESTIGACION', 'RESUELTA', 'ARCHIVADA');

-- CreateEnum
CREATE TYPE "TipoConsultaReclamo" AS ENUM ('CONSULTA', 'RECLAMO');

-- CreateEnum
CREATE TYPE "EstadoConsultaReclamo" AS ENUM ('ABIERTO', 'EN_TRAMITE', 'RESUELTO');

-- CreateEnum
CREATE TYPE "periodicidad_obligacion" AS ENUM ('MENSUAL', 'BIMESTRAL', 'CUATRIMESTRAL', 'SEMESTRAL', 'ANUAL', 'CADA_N_ANIOS', 'POR_EVENTO');

-- CreateEnum
CREATE TYPE "categoria_obligacion" AS ENUM ('SOCIETARIO', 'TRIBUTARIO', 'LABORAL', 'HABEAS_DATA', 'COMERCIAL', 'SST', 'CONTRACTUAL');

-- CreateEnum
CREATE TYPE "estado_ocurrencia" AS ENUM ('PENDIENTE', 'CUMPLIDA', 'VENCIDA');

-- CreateTable
CREATE TABLE "documento_legal" (
    "id" UUID NOT NULL,
    "categoria" "categoria_doc_legal" NOT NULL,
    "titulo" TEXT NOT NULL,
    "descripcion" TEXT,
    "vigencia_inicio" DATE,
    "vigencia_fin" DATE,
    "sede_id" UUID,
    "documento_id" UUID,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documento_legal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "version_documento_legal" (
    "id" UUID NOT NULL,
    "documento_legal_id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "vigente" BOOLEAN NOT NULL DEFAULT true,
    "archivo_doc_id" UUID,
    "cambios" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "version_documento_legal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "proceso_disciplinario" (
    "id" UUID NOT NULL,
    "colaborador_id" UUID NOT NULL,
    "asunto" TEXT NOT NULL,
    "descripcion" TEXT,
    "etapa" "etapa_disciplinaria" NOT NULL DEFAULT 'CITACION_DESCARGOS',
    "fecha_apertura" DATE NOT NULL,
    "decision" TEXT,
    "cerrado" BOOLEAN NOT NULL DEFAULT false,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "proceso_disciplinario_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "etapa_proceso" (
    "id" UUID NOT NULL,
    "proceso_id" UUID NOT NULL,
    "etapa" "etapa_disciplinaria" NOT NULL,
    "fecha" DATE NOT NULL,
    "detalle" TEXT,
    "documento_id" UUID,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "etapa_proceso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "denuncia_acoso" (
    "id" UUID NOT NULL,
    "codigo" TEXT NOT NULL,
    "anonima" BOOLEAN NOT NULL DEFAULT true,
    "denunciante_nombre" TEXT,
    "hechos" TEXT NOT NULL,
    "fecha_hechos" DATE,
    "sede_id" UUID,
    "estado" "estado_denuncia" NOT NULL DEFAULT 'RECIBIDA',
    "resolucion" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "denuncia_acoso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "autorizacion_datos" (
    "id" UUID NOT NULL,
    "colaborador_id" UUID NOT NULL,
    "fecha_autorizacion" DATE NOT NULL,
    "finalidad" TEXT NOT NULL,
    "documento_id" UUID,
    "revocada" BOOLEAN NOT NULL DEFAULT false,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "autorizacion_datos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consulta_reclamo_datos" (
    "id" UUID NOT NULL,
    "tipo" "TipoConsultaReclamo" NOT NULL,
    "titular" TEXT NOT NULL,
    "descripcion" TEXT NOT NULL,
    "fecha_radicacion" DATE NOT NULL,
    "fecha_limite" DATE,
    "estado" "EstadoConsultaReclamo" NOT NULL DEFAULT 'ABIERTO',
    "respuesta" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "consulta_reclamo_datos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "obligacion_legal" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "categoria" "categoria_obligacion" NOT NULL,
    "periodicidad" "periodicidad_obligacion" NOT NULL,
    "descripcion" TEXT,
    "responsable_rol" TEXT,
    "por_sede" BOOLEAN NOT NULL DEFAULT false,
    "cada_n_anios" INTEGER,
    "fuente_legal" TEXT,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "obligacion_legal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ocurrencia_obligacion" (
    "id" UUID NOT NULL,
    "obligacion_id" UUID NOT NULL,
    "fecha_limite" DATE NOT NULL,
    "sede_id" UUID,
    "estado" "estado_ocurrencia" NOT NULL DEFAULT 'PENDIENTE',
    "fecha_cumplido" DATE,
    "evidencia_doc_id" UUID,
    "observaciones" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ocurrencia_obligacion_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documento_legal_categoria_idx" ON "documento_legal"("categoria");

-- CreateIndex
CREATE UNIQUE INDEX "version_documento_legal_documento_legal_id_version_key" ON "version_documento_legal"("documento_legal_id", "version");

-- CreateIndex
CREATE INDEX "proceso_disciplinario_colaborador_id_idx" ON "proceso_disciplinario"("colaborador_id");

-- CreateIndex
CREATE INDEX "etapa_proceso_proceso_id_idx" ON "etapa_proceso"("proceso_id");

-- CreateIndex
CREATE UNIQUE INDEX "denuncia_acoso_codigo_key" ON "denuncia_acoso"("codigo");

-- CreateIndex
CREATE INDEX "autorizacion_datos_colaborador_id_idx" ON "autorizacion_datos"("colaborador_id");

-- CreateIndex
CREATE INDEX "ocurrencia_obligacion_obligacion_id_fecha_limite_idx" ON "ocurrencia_obligacion"("obligacion_id", "fecha_limite");

-- CreateIndex
CREATE INDEX "ocurrencia_obligacion_estado_fecha_limite_idx" ON "ocurrencia_obligacion"("estado", "fecha_limite");

-- AddForeignKey
ALTER TABLE "version_documento_legal" ADD CONSTRAINT "version_documento_legal_documento_legal_id_fkey" FOREIGN KEY ("documento_legal_id") REFERENCES "documento_legal"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proceso_disciplinario" ADD CONSTRAINT "proceso_disciplinario_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "etapa_proceso" ADD CONSTRAINT "etapa_proceso_proceso_id_fkey" FOREIGN KEY ("proceso_id") REFERENCES "proceso_disciplinario"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "autorizacion_datos" ADD CONSTRAINT "autorizacion_datos_colaborador_id_fkey" FOREIGN KEY ("colaborador_id") REFERENCES "colaborador"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ocurrencia_obligacion" ADD CONSTRAINT "ocurrencia_obligacion_obligacion_id_fkey" FOREIGN KEY ("obligacion_id") REFERENCES "obligacion_legal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
