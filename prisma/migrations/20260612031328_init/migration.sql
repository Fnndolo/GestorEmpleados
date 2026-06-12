-- CreateEnum
CREATE TYPE "estado_usuario" AS ENUM ('ACTIVO', 'INACTIVO', 'BLOQUEADO');

-- CreateEnum
CREATE TYPE "accion_permiso" AS ENUM ('VER', 'CREAR', 'EDITAR', 'ELIMINAR', 'APROBAR', 'EXPORTAR');

-- CreateEnum
CREATE TYPE "alcance_datos" AS ENUM ('TODAS_SEDES', 'SEDES_ASIGNADAS', 'EQUIPO', 'PROPIO');

-- CreateEnum
CREATE TYPE "accion_auditoria" AS ENUM ('CREAR', 'EDITAR', 'ELIMINAR', 'LOGIN', 'LOGOUT', 'ACCESO', 'EXPORTAR');

-- CreateTable
CREATE TABLE "user" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "role" TEXT DEFAULT 'user',
    "banned" BOOLEAN DEFAULT false,
    "ban_reason" TEXT,
    "ban_expires" TIMESTAMP(3),
    "rol_id" UUID NOT NULL,
    "estado" "estado_usuario" NOT NULL DEFAULT 'ACTIVO',
    "debe_cambiar_password" BOOLEAN NOT NULL DEFAULT true,
    "telefono_e164" TEXT,
    "whatsapp_opt_in" BOOLEAN NOT NULL DEFAULT false,
    "whatsapp_opt_in_fecha" TIMESTAMP(3),
    "ultimo_acceso" TIMESTAMP(3),

    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "session" (
    "id" UUID NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "user_id" UUID NOT NULL,
    "impersonated_by" TEXT,

    CONSTRAINT "session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "account" (
    "id" UUID NOT NULL,
    "account_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "id_token" TEXT,
    "access_token_expires_at" TIMESTAMP(3),
    "refresh_token_expires_at" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification" (
    "id" UUID NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rol" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "descripcion" TEXT,
    "es_sistema" BOOLEAN NOT NULL DEFAULT false,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rol_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rol_permiso" (
    "id" UUID NOT NULL,
    "rol_id" UUID NOT NULL,
    "modulo" TEXT NOT NULL,
    "accion" "accion_permiso" NOT NULL,
    "alcance" "alcance_datos" NOT NULL DEFAULT 'TODAS_SEDES',

    CONSTRAINT "rol_permiso_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "usuario_sede" (
    "user_id" UUID NOT NULL,
    "sede_id" UUID NOT NULL,

    CONSTRAINT "usuario_sede_pkey" PRIMARY KEY ("user_id","sede_id")
);

-- CreateTable
CREATE TABLE "ciudad" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "departamento" TEXT NOT NULL,
    "codigo_dane" TEXT,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ciudad_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sede" (
    "id" UUID NOT NULL,
    "nombre" TEXT NOT NULL,
    "ciudad_id" UUID NOT NULL,
    "direccion" TEXT NOT NULL,
    "telefono" TEXT,
    "es_principal" BOOLEAN NOT NULL DEFAULT false,
    "activa" BOOLEAN NOT NULL DEFAULT true,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sede_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "configuracion_empresa" (
    "id" UUID NOT NULL,
    "razon_social" TEXT NOT NULL,
    "nombre_comercial" TEXT NOT NULL,
    "nit" TEXT NOT NULL,
    "representante_legal" TEXT NOT NULL,
    "email_contacto" TEXT,
    "telefono" TEXT,
    "direccion" TEXT,
    "sitio_web" TEXT,
    "logo_url" TEXT,
    "sabado_habil" BOOLEAN NOT NULL DEFAULT true,
    "actualizado_en" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "configuracion_empresa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" UUID NOT NULL,
    "creado_en" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "user_id" UUID,
    "user_email" TEXT,
    "accion" "accion_auditoria" NOT NULL,
    "modelo" TEXT NOT NULL,
    "registro_id" TEXT,
    "diff" JSONB,
    "descripcion" TEXT,
    "ip" TEXT,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "user"("email");

-- CreateIndex
CREATE UNIQUE INDEX "session_token_key" ON "session"("token");

-- CreateIndex
CREATE INDEX "session_user_id_idx" ON "session"("user_id");

-- CreateIndex
CREATE INDEX "account_user_id_idx" ON "account"("user_id");

-- CreateIndex
CREATE INDEX "verification_identifier_idx" ON "verification"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "rol_nombre_key" ON "rol"("nombre");

-- CreateIndex
CREATE UNIQUE INDEX "rol_permiso_rol_id_modulo_accion_key" ON "rol_permiso"("rol_id", "modulo", "accion");

-- CreateIndex
CREATE UNIQUE INDEX "ciudad_nombre_departamento_key" ON "ciudad"("nombre", "departamento");

-- CreateIndex
CREATE UNIQUE INDEX "sede_nombre_key" ON "sede"("nombre");

-- CreateIndex
CREATE INDEX "audit_log_modelo_registro_id_idx" ON "audit_log"("modelo", "registro_id");

-- CreateIndex
CREATE INDEX "audit_log_user_id_idx" ON "audit_log"("user_id");

-- AddForeignKey
ALTER TABLE "user" ADD CONSTRAINT "user_rol_id_fkey" FOREIGN KEY ("rol_id") REFERENCES "rol"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rol_permiso" ADD CONSTRAINT "rol_permiso_rol_id_fkey" FOREIGN KEY ("rol_id") REFERENCES "rol"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_sede" ADD CONSTRAINT "usuario_sede_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_sede" ADD CONSTRAINT "usuario_sede_sede_id_fkey" FOREIGN KEY ("sede_id") REFERENCES "sede"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sede" ADD CONSTRAINT "sede_ciudad_id_fkey" FOREIGN KEY ("ciudad_id") REFERENCES "ciudad"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
