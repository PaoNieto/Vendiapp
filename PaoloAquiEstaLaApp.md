# Hola Paolo, acá está la app

## Para abrir la app

Una vez que el servidor esté corriendo, abrila en tu navegador:

### 👉 http://localhost:3000

## Cómo levantar el servidor

Abrí una terminal en la carpeta del proyecto y corré:

```
pnpm install
pnpm dev
```

Esperá a que diga "Ready" y abrí el link de arriba.

## Rutas principales

| Página | Link |
|---|---|
| Inicio | http://localhost:3000 |
| Login | http://localhost:3000/login |
| Signup | http://localhost:3000/signup |
| Onboarding | http://localhost:3000/onboarding |
| Dashboard | http://localhost:3000/dashboard |
| Mi Negocio | http://localhost:3000/mi-negocio |
| **Fábrica Creativa — recorrido completo** | |
| 01 Producto | http://localhost:3000/producto |
| 02 Referencias | http://localhost:3000/referencias |
| 03 Estilo | http://localhost:3000/estilo |
| 04 Formato | http://localhost:3000/formato |
| 05 Prompt | http://localhost:3000/prompt |
| Fábrica (motor IA) | http://localhost:3000/fabrica |
| Proyectos | http://localhost:3000/proyectos |
| Ajustes | http://localhost:3000/ajustes |

## Qué hay implementado en esta sesión

Las 5 estaciones del recorrido para armar el brief antes de mandar a la Fábrica:

- **01 Producto** — subida de fotos del producto con drag & drop (hasta 5)
- **02 Referencias** — subida + galería curada con tabs
- **03 Estilo** — 6 moods + paleta de colores + ocasión
- **04 Formato** — selector visual de ratio + cantidad de variaciones
- **05 Prompt** — prompt natural editable, generado automáticamente del brief

El estado persiste en localStorage entre páginas (excepto las imágenes, que se pierden al refrescar — eso queda para conectar con Supabase Storage).

## Stack

Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui + Zustand + Framer Motion.
