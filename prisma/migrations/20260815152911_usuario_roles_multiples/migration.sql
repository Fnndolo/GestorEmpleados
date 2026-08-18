-- CreateTable
CREATE TABLE "usuario_rol" (
    "user_id" UUID NOT NULL,
    "rol_id" UUID NOT NULL,

    CONSTRAINT "usuario_rol_pkey" PRIMARY KEY ("user_id","rol_id")
);

-- AddForeignKey
ALTER TABLE "usuario_rol" ADD CONSTRAINT "usuario_rol_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "usuario_rol" ADD CONSTRAINT "usuario_rol_rol_id_fkey" FOREIGN KEY ("rol_id") REFERENCES "rol"("id") ON DELETE CASCADE ON UPDATE CASCADE;
