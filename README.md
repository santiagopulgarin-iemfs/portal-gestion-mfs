# Portal de Gestión — I.E. Marco Fidel Suárez

Aplicación web (Vite + React + TypeScript) con login de Google (Supabase Auth) y datos compartidos en Supabase.
La interfaz y la lógica originales del portal (proyectos, actividades, direcciones de grupo, cargas académicas y POA)
se conservan intactas en `src/legacy/`; el shell de React se encarga del login, la autorización y la conexión a Supabase.

## Cómo funciona

- `src/App.tsx`: pantalla de login, pantalla "No autorizado" (cierra sesión) y montaje del portal.
- `src/lib/claudeShim.ts`: adaptador que reemplaza el runtime del artefacto (`db`, `user`, `downloads`) con
  Supabase (tabla `app_docs`, realtime + polling cada 8 s) y descarga del Word por `Blob`. Si Supabase falla,
  el portal sigue con el respaldo de `localStorage`.
- `src/legacy/`: HTML, CSS y JS originales (sin reescribir).
- Documentos en `app_docs.key`: `tablero/principal`, `tablero/actividades`, `tablero/direcciones`, `tablero/cargas`, `tablero/poa`.

## 1. Supabase

1. Creá un proyecto en <https://supabase.com>.
2. En **SQL Editor** pegá y ejecutá `supabase/migrations/0001_init.sql` (tablas, RLS, función `app_role()`, realtime y el administrador inicial `pulgarinsantiago1a@gmail.com`).
3. En **Project Settings > API** copiá `Project URL` y la clave `anon public`.

## 2. Google Cloud (OAuth)

1. <https://console.cloud.google.com> > **APIs y servicios > Pantalla de consentimiento OAuth** (tipo Externo; agregá tu correo como usuario de prueba o publicá la app).
2. **Credenciales > Crear credenciales > ID de cliente de OAuth > Aplicación web**.
3. **URI de redireccionamiento autorizado**: `https://<project-ref>.supabase.co/auth/v1/callback`
4. Copiá el Client ID y el Client Secret.
5. En Supabase: **Authentication > Providers > Google**: activalo y pegá Client ID y Secret.

## 3. Supabase: URLs de Auth

**Authentication > URL Configuration**:

- **Site URL**: `https://<tu-dominio>.vercel.app`
- **Redirect URLs**: `https://<tu-dominio>.vercel.app/**` y `http://localhost:5173/**`

## 4. Desarrollo local

```bash
npm install
cp .env.example .env     # completá VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY
npm run dev              # http://localhost:5173
npm run typecheck
```

## 5. Cargar los datos actuales (seed)

Los documentos exportados del artefacto están en `supabase/seed/*.json` (el nombre `tablero__poa.json` se carga como clave `tablero/poa`).
Contienen nombres de docentes: mantené el repositorio **privado**.

```bash
# .env.local (no se commitea)
SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

npm run seed             # falla si ya existen datos; usá  npm run seed -- --force  para sobrescribir
```

La service role key salta RLS: nunca la pongas en Vercel ni en el repositorio.

## 6. Vercel

1. Importá el repositorio de GitHub en Vercel (preset Vite, build `npm run build`, salida `dist`).
2. **Settings > Environment Variables**: `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY` (Production, Preview y Development).
3. `vercel.json` ya incluye el rewrite SPA.
4. Agregá el dominio final a Site URL / Redirect URLs de Supabase (paso 3).

## 7. Autorizar usuarios

Solo los correos en `allowed_emails` pueden entrar; el resto ve "No autorizado" y se cierra su sesión.
En el SQL Editor de Supabase (correos en minúscula):

```sql
insert into public.allowed_emails (email, role) values ('docente@gmail.com', 'editor');
update public.allowed_emails set role = 'viewer' where email = 'docente@gmail.com';
delete from public.allowed_emails where email = 'docente@gmail.com';
```

Roles: `admin` (todo, y gestiona la lista), `editor` (lee y escribe datos), `viewer` (solo lectura).
