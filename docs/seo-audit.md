# Auditoría e implementación SEO — 30 de septiembre de 2026

## Estado y alcance

Primera etapa implementada en local, sin despliegue. Fuente de prioridades:
`deep-research-report.md`; fuente de hechos comerciales: catálogo y estimador del
repositorio. Se mantienen las siete URLs comerciales y Privacy. No se crearon
URLs de ciudades, artículos ni afirmaciones comerciales nuevas.

El diagnóstico inicial ya encontró canonicals, metadata, sitemap, robots y un
grafo `HomeAndConstructionBusiness`/`WebSite`/`WebPage`. Se verificaron, sin
reemplazarlos. También se encontró un Google tag incorporado después de la
exploración del plan: se conservó su ID `G-1Y94FEZF3D` y se amplió esa integración.
La existencia y acceso a las propiedades de GA4 y Search Console siguen sin
verificarse; tener un ID en código no demuestra recepción ni titularidad.

## Cambios entregados

- Breadcrumbs `Home → página actual` en Fences, Gates, Parts, Service Area,
  Estimate y Quote; la misma lista genera el marcado `BreadcrumbList` conectado
  a `WebPage`. Sin breadcrumbs en Home, Privacy o 404.
- Home conserva el logotipo e incorpora una explicación comercial visible.
  Service Area explica cómo confirmar ubicación y coordinar un proyecto.
  Estimate incluye instrucciones, siguientes pasos y metadata específica de costos.
- Enlaces contextuales Fences ↔ Gates ↔ Parts, y conexiones hacia Service Area,
  Estimate y Quote. Las intenciones existentes adecuadas se conservan.
- Eventos `estimate_start`, `estimate_complete`, `quote_submit` y `phone_click`.
  Un cálculo válido se registra una vez, incluso después de sucesivos cambios.
  Los errores no cuentan como finalización ni como cotización enviada.
- Variable preferente `PUBLIC_GA4_MEASUREMENT_ID`, compatible con la anterior;
  valor vacío desactiva la biblioteca. Créditos de imágenes y precios intactos.

## Evidencia de validación

Comprobaciones públicas anteriores al despliegue de estos cambios:

| Solicitud | Resultado |
| --- | --- |
| `https://durafencemetal.com/robots.txt` | 200; permite rastreo y declara el sitemap correcto. |
| `https://durafencemetal.com/sitemap-index.xml` | 200. |
| `https://www.durafencemetal.com/services` | 301 directo a `https://durafencemetal.com/services/`. |
| `https://durafencemetal.com/seo-check-missing/` | 404 real. |

Comprobaciones sobre el build local nuevo:

- `npm run build`, `npm test` (cuatro archivos de pruebas) y `git diff --check` pasan.
- Chromium: nueve páginas, 15 destinos internos/anclas, títulos y descripciones
  únicos, un H1 por página, canonicals esperados y ausencia de canonical en 404.
  Sitemap incluye todas las páginas indexables y excluye 404.
- JSON-LD parseable, URLs absolutas y posiciones secuenciales de breadcrumbs;
  nombres coinciden con el HTML y el nodo `WebPage` referencia la lista correcta.
- Viewports 390×844 y 1440×900: sin overflow horizontal ni errores de JavaScript.
  Revisión visual de Home, Fences, Service Area y Estimate; acceso por teclado.
- Estimador: carga inicial no dispara eventos; altura inválida no completa;
  corrección a un cálculo válido completa una sola vez; cambios posteriores no
  duplican; gate añadido mediante botón también inicia y completa correctamente.
- Cotización: validación fallida y respuesta 503 simulada no generan conversión;
  respuesta `ok: true` genera `quote_submit`. Clic telefónico genera `phone_click`.
  APIs simuladas y scripts de terceros interceptados: no se enviaron correos ni
  datos de prueba a Google/Meta.
- Impresión: breadcrumbs y ayuda del estimador ocultos; factura visible y PDF
  local generado. Ningún cambio al PDF que genera el servidor.
- Build con GA4 vacío: sin etiqueta; uso del estimador sin solicitudes a Google
  ni errores JS. Worker con ASSETS simulado: redirecciones correctas, preview
  `noindex, nofollow`, dominio principal sin ese header.

Comparación local de rendimiento: mismo servidor estático, Chromium móvil sin
throttling, tres contextos nuevos por página, scripts externos interceptados.
LCP mediano y CLS máximo durante la carga inicial:

| Página | LCP antes / después | CLS antes / después |
| --- | --- | --- |
| Home | 28 / 28 ms | 0.009 / 0.009 |
| Fences | 24 / 20 ms | 0.192 / 0.179 |
| Estimate | 32 / 24 ms | 0.0004 / 0.0004 |

Sin regresiones observadas atribuibles al cambio. Estas mediciones de laboratorio
no representan Core Web Vitals de usuarios reales ni una mejora demostrada de
velocidad en producción. Fences presenta desplazamiento visual previo que merece
diagnóstico separado. No se midió INP de campo.

Artefactos de esta sesión: `/tmp/durafence-seo/` contiene capturas antes/después,
JSON de auditoría/rendimiento, scripts de verificación y PDF de impresión.
Son temporales. Las pruebas del ciclo de eventos se conservan en el repositorio
y forman parte de `npm test`.

## Despliegue y comprobación en producción

El 30 de septiembre de 2026 se publicó el Worker `durafence` con Wrangler
4.143.0 y `--keep-vars`. Cloudflare confirmó 13 archivos subidos y asignó a
la versión `b4618992-2fc0-4938-99bb-b863b4be13d8` el 100 % del tráfico.

Chromium comprobó contra `https://durafencemetal.com` las ocho rutas de contenido,
sus canonical/JSON-LD, 15 destinos internos y anclas, sitemap y `robots.txt`.
En el entorno publicado se repitieron los eventos del estimador y la cotización
con scripts de terceros interceptados y el endpoint de cotización simulado; no
se enviaron solicitudes de prueba a GA4/Meta ni correos. No se modificaron cuentas
de analytics o Search Console.

Una ruta inexistente normal devuelve HTTP 404. En cambio, la ruta interna
`/404.html` redirige a `/404`, y `/404` y `/404/` forman un ciclo al abrirlas
directamente. La web no enlaza esas rutas y el sitemap excluye 404; conviene
corregir esta particularidad de la ruta interna en un cambio separado del Worker.

## Pendientes externos

1. Verificar acceso a Search Console y a la propiedad GA4 correcta; obtener línea
   base orgánica por página/query y comprobar eventos en Realtime/DebugView.
2. Revisar Enhanced Measurement y filtros de pruebas en GA4; marcar `quote_submit`
   como evento clave. `estimate_complete` mide uso del estimador, no leads.
3. Ejecutar Rich Results Test y URL Inspection sobre las
   páginas modificadas y enviar el sitemap. La comprobación local de JSON-LD no
   sustituye la validación externa de Google ni garantiza resultados enriquecidos.
4. Comparar clicks, impressions, CTR y cotizaciones orgánicas a los 28 y 56 días.
   No hay datos disponibles para establecer metas cuantitativas todavía.

No añadir dirección física, horarios, garantías o testimonios al schema sin
evidencia del negocio. Las ciudades conservadas son las ya publicadas; las
condiciones específicas de cada proyecto se confirman por contacto.

Referencias oficiales: [breadcrumbs](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb),
[enlaces](https://developers.google.com/search/docs/crawling-indexing/links-crawlable),
[Google tag](https://developers.google.com/tag-platform/gtagjs/configure),
[eventos GA4](https://developers.google.com/analytics/devguides/collection/ga4/events).
