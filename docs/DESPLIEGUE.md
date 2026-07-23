# Despliegue a producción — Vercel + Supabase + Gmail SMTP

Guía paso a paso. La app sale a producción **sin colaboradores** (solo se crea el usuario
administrador). Tiempo estimado: 30–45 min.

## 0. Cuentas necesarias
- **GitHub** (para subir el código).
- **Supabase** (base de datos PostgreSQL + almacenamiento de documentos) — plan Free para
  empezar; Pro recomendado en producción real (backups diarios, 8 GB+).
- **Vercel** (hospeda la app Next.js) — Hobby para empezar; Pro recomendado.
- **Gmail** `smartventaspasto@gmail.com` (envío de correos).

---

## 1. Subir el código a GitHub
```powershell
# En la carpeta del proyecto
git remote add origin https://github.com/TU_USUARIO/gestor-empleados.git
git push -u origin main
```
> El archivo `.env` NO se sube (está en `.gitignore`). Las claves se ponen en Vercel.

---

## 2. Crear el proyecto en Supabase
1. Entra a https://supabase.com → **New project**. Elige región cercana (ej. *South America (São Paulo)*) y guarda la **Database Password**.
2. Cuando termine, ve a **Project Settings → Database → Connection string**:
   - **Transaction pooler** (puerto 6543): será `DATABASE_URL`. Agrégale `?pgbouncer=true&connection_limit=1` al final.
   - **Direct connection** (puerto 5432): será `DIRECT_URL`.
   - Reemplaza `[YOUR-PASSWORD]` por la contraseña de la base.
3. **Almacenamiento de documentos**: ve a **Storage → New bucket**:
   - Nombre: `documentos`
   - **Private** (NO público). Crear.
4. **Llaves de almacenamiento**: **Project Settings → API**:
   - `Project URL` → será `SUPABASE_URL`.
   - `service_role` secret → será `SUPABASE_SERVICE_ROLE_KEY` (¡secreto! solo servidor).

---

## 3. Crear la Contraseña de aplicación de Gmail
1. La cuenta debe tener **verificación en dos pasos** activada: https://myaccount.google.com/security
2. Entra a https://myaccount.google.com/apppasswords → crea una para "Correo" / "Otra (Smart Gadgets)".
3. Google te da **16 caracteres** (ej. `abcd efgh ijkl mnop`). **Quítale los espacios** → `abcdefghijklmnop`. Ese valor es `SMTP_PASS`.

---

## 4. Importar el proyecto en Vercel y poner las variables
1. https://vercel.com → **Add New → Project** → importa el repo de GitHub.
2. Framework: **Next.js** (autodetectado). No cambies el build.
3. En **Environment Variables**, agrega (todas como *Production* y *Preview*):

| Variable | Valor |
|---|---|
| `DATABASE_URL` | (pooler de Supabase, puerto 6543, con `?pgbouncer=true&connection_limit=1`) |
| `DIRECT_URL` | (conexión directa de Supabase, puerto 5432) |
| `BETTER_AUTH_SECRET` | genera uno: `openssl rand -base64 32` (o https://generate-secret.vercel.app/32) |
| `BETTER_AUTH_URL` | `https://TU-APP.vercel.app` (la URL que te dé Vercel) |
| `NEXT_PUBLIC_APP_URL` | `https://TU-APP.vercel.app` |
| `STORAGE_DRIVER` | `supabase` |
| `SUPABASE_URL` | (Project URL de Supabase) |
| `SUPABASE_SERVICE_ROLE_KEY` | (service_role secret) |
| `SUPABASE_BUCKET` | `documentos` |
| `EMAIL_DRIVER` | `smtp` |
| `EMAIL_FROM` | `Smart Gadgets <smartventaspasto@gmail.com>` |
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `465` |
| `SMTP_SECURE` | `true` |
| `SMTP_USER` | `smartventaspasto@gmail.com` |
| `SMTP_PASS` | (la contraseña de aplicación de 16 caracteres, sin espacios) |
| `CRON_SECRET` | una cadena aleatoria larga (protege los cron) |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | clave pública VAPID (notificaciones push) — genera el par con `npx web-push generate-vapid-keys` |
| `VAPID_PRIVATE_KEY` | clave privada VAPID del mismo par (¡secreta!) |
| `VAPID_SUBJECT` | `mailto:smartventaspasto@gmail.com` |
| `SEED_ADMIN_EMAIL` | `smartventaspasto@gmail.com` |
| `SEED_ADMIN_PASSWORD` | **una contraseña NUEVA y fuerte — no uses una que esté escrita en documentos del repo; cámbiala además al primer ingreso** |
| `SEED_ADMIN_NAME` | `Administrador` |
| `SEED_ADMIN_FORCE_CHANGE` | `true` (exige cambiar la contraseña del admin en el primer ingreso) |

> Sin las claves VAPID la app funciona igual, pero no habrá notificaciones push en el celular
> (correo e in-app sí). Genera el par una vez y no lo cambies (los suscritos se perderían).

4. **Deploy**. Espera a que termine (la primera vez tarda unos minutos).
> Tras conocer la URL final, vuelve a Settings → Environment Variables y confirma que
> `BETTER_AUTH_URL` y `NEXT_PUBLIC_APP_URL` apuntan a esa URL exacta. Si las cambias, **Redeploy**.

---

## 5. Crear las tablas y el administrador (una sola vez)
Esto se corre **desde tu PC** apuntando a Supabase (la app en Vercel no migra sola).
En PowerShell, en la carpeta del proyecto:

```powershell
$env:DATABASE_URL = "PEGA_AQUI_TU_DIRECT_URL"   # usa la conexión DIRECTA (5432) para migrar
$env:DIRECT_URL   = "PEGA_AQUI_TU_DIRECT_URL"
$env:SEED_ADMIN_EMAIL    = "smartventaspasto@gmail.com"
$env:SEED_ADMIN_PASSWORD = "LA_MISMA_CONTRASEÑA_NUEVA_QUE_PUSISTE_EN_VERCEL"
$env:SEED_ADMIN_FORCE_CHANGE = "true"

pnpm prisma migrate deploy   # crea todas las tablas
pnpm db:seed                 # roles + permisos + catálogos + parámetros + admin (SIN empleados)
```
> NO corras `pnpm db:seed:demo` en producción (eso crea empleados de prueba).
> Verás en consola: `Usuario administrador creado: smartventaspasto@gmail.com`.

---

## 6. Verificación
1. Abre `https://TU-APP.vercel.app/login` → entra con el correo y la contraseña del admin (te pedirá cambiarla).
2. **Configuración → Empresa**: llena NIT, representante legal y demás datos (vienen en "Por definir").
3. **Configuración → Sedes**: la base arranca **sin ciudades ni sedes**. Crea tu **ciudad** (ej. Pasto, Nariño) y luego tu **sede** real. Sin al menos una sede no se pueden crear colaboradores.
4. **Configuración → Cargos**: revisa/ajusta el **rol por defecto** de cada cargo (ej. cargos de Talento Humano → rol *Recursos Humanos*; el resto → *Empleado*).
5. **Colaboradores → Nuevo**: crea uno con su **correo**. Debe:
   - crearse su **usuario** automáticamente con el rol del cargo, y
   - **llegarle el correo** de invitación con su contraseña temporal. ← así confirmas que el correo funciona.
6. Sube una foto/documento → confirma que se guarda (Supabase Storage).

---

## Notas
- **Backups**: el plan Free de Supabase NO tiene backups diarios automáticos. Para nómina y
  documentos laborales esto es obligatorio: usa Supabase Pro (backups diarios) o programa un
  `pg_dump` periódico desde otra máquina. Sin backup no salgas a uso real.
- **Cron de alertas**: Vercel ejecuta `/api/cron/calendario-legal` (05:30 Bogotá) y `/api/cron/alertas` (06:00 Bogotá) según `vercel.json`. En plan Hobby los cron corren 1 vez/día (suficiente). Para mayor frecuencia, plan Pro.
- **Correos a muchos destinatarios**: Gmail tiene un límite (~500/día) más que suficiente para RH. Si en el futuro creces, migra a Resend con un dominio propio (el código ya lo soporta: `EMAIL_DRIVER=resend`).
- **Cambiar la contraseña del admin**: el admin entra y la puede cambiar desde su perfil cuando quiera.
- **Migraciones futuras**: cada vez que cambie el esquema, vuelve a correr `pnpm prisma migrate deploy` con las variables de Supabase (paso 5).
