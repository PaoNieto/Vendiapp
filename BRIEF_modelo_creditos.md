# Brief: evaluar migración de BYOK → modelo de créditos (keys propias)

> Documento para trabajar la decisión en un chat nuevo de Claude. Pegá esto al inicio del chat como contexto.

---

## Contexto de quién soy y qué es Vendí

Soy Paolo, founder solo de Vendí. Sede Perú, construyo para PYMEs de Latinoamérica.

**Vendí** = generador de fotografía de producto con IA. El usuario sube la foto básica de su producto, elige estilo + formato, y la app genera variaciones fotográficas profesionales listas para vender (ecommerce, redes, ads). Sin sesión de fotos, sin diseñador, sin Photoshop.

**Stack:** Next.js 16 (App Router) + TypeScript + Supabase (DB + Auth + Storage) + Tailwind. La IA es **Gemini 3.1** (modelo de imagen = Nano Banana 2, string `gemini-3.1-flash-image-preview`). Hosting en Vercel (vendiapp.vercel.app).

**Cómo se genera HOY (importante):** la generación corre 100% en el browser. El archivo `lib/ai/image-generator.ts` le pega directo a la API de Gemini desde el navegador del usuario.

---

## La decisión que quiero trabajar

Hoy Vendí usa **BYOK (Bring Your Own Key)**: cada usuario pega SU propia API key de Google AI Studio en "Mi Negocio", esa key vive en el localStorage de su browser, y él le paga a Google directo. Vendí no absorbe costo de IA.

**Quiero evaluar migrar a un modelo de CRÉDITOS / suscripción con MI propia key de Google**, como hace CienAds (mi referencia de mercado: cobra USD 47 el plan base por 75 imágenes).

NO me preocupa cobrar suscripción — eso lo tengo claro, voy a cobrar igual. Lo que quiero resolver es la **mecánica técnica** de tener UNA key propia que sirva a todos mis usuarios.

---

## Diferencia técnica entre los dos modelos

```
MODELO BYOK (hoy):
- Key del usuario, en su browser (localStorage)
- Genera en el browser con su key
- El usuario le paga a Google directo
- A mí no me cuesta nada de IA
- Fricción ALTA: el usuario tiene que sacar su key de Google + configurar billing

MODELO CRÉDITOS (a evaluar):
- UNA key mía, en mi server (.env, nunca en el browser)
- La llamada a Gemini pasa por MI server (API route)
- Mi factura de Google suma TODO el consumo de todos los usuarios
- Le descuento créditos al usuario y le cobré un markup
- Fricción BAJA: el usuario paga y usa, nunca ve una API key
```

---

## Lo que YA entendí (no hace falta re-explicarme)

1. **Conseguir la key única NO tiene traba.** Es la misma key normal de AI Studio que ya sé crear, solo que con una tarjeta con fondos reales y guardada en el server. No necesito permiso empresarial de Google ni hablar con un vendedor.

2. **El modelo de negocio no me preocupa.** Voy a cobrar suscripción/créditos igual (referencia CienAds: USD 47 / 75 imágenes).

3. **Costo de Gemini:** ~USD 0.02–0.04 por imagen (verificar número exacto en la doc actual de Gemini). Una tanda de 5 ≈ USD 0.10–0.20 de costo mío.

---

## Lo que quiero que me ayudes a resolver en este chat

### A. Lo técnico de tener UNA key sirviendo a todos
1. **Rate limits de Google:** ¿cuántas requests/min aguanta una key en tier pago? ¿Qué pasa si 50 usuarios generan al mismo tiempo? ¿Cómo pido aumento de quota? ¿Necesito una cola de procesamiento? ¿Rotación de varias keys?
2. **Proteger la key:** vive en server-side, encriptada, nunca en browser ni en código commiteado. ¿Cómo lo implemento bien en Next.js + Vercel env vars?
3. **Control de abuso:** que un usuario no me queme la factura. Rate limiting por usuario + el candado de créditos.

### B. La arquitectura del cambio
1. Mover la generación de browser-side (BYOK actual) a server-side (API route con mi key).
2. **Dato clave:** en el repo hay API routes en `app/api/generations/` que son stubs de un modelo de créditos viejo (literalmente dicen "verificar créditos" / "descontar créditos"). Son el esqueleto que necesitaría — NO las borré justamente por esto.
3. Sistema de créditos en Supabase: tabla `subscriptions` o `credits`, descuento por generación, integración con Stripe.

### C. La decisión de producto (lo más importante)
Antes de codear nada, quiero validar SI conviene el cambio. Trade-off:
- BYOK: cero costo/riesgo para mí, pero fricción alta = peor conversión.
- Créditos: mejor conversión, pero asumo costo de IA + riesgo de caja + más infra (Stripe, créditos, rate limiting).

Quiero que me ayudes a pensar esto con rigor antes de tocar código.

---

## Cómo trabajo (importante para el otro chat)

- Hablame **directo, accionable, sin opciones múltiples ni relleno de marketing**. Si algo está mal, decímelo derecho.
- **No inventes datos.** Si no sabés algo (ej. cómo está construido CienAds por dentro), decí "no sé" en vez de inventar. Eso no es público.
- Cuando hables de partes técnicas, sé concreto (archivo, función, paso).
- No me marees con teoría — quiero saber QUÉ hago y en QUÉ orden.

---

## Primera pregunta para arrancar el chat nuevo

"Antes de decidir si migro de BYOK a créditos: ¿cuáles son los límites reales (rate limits, quota) de una sola API key de Google AI Studio en tier pago, y a partir de cuántos usuarios concurrentes esa key se vuelve un cuello de botella? Quiero saber si una key aguanta o si necesito una arquitectura más compleja desde el día uno."
