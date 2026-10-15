# Dura Fence Metal

Sitio de Astro para [durafencemetal.com](https://durafencemetal.com).

El checkout independiente de Facebook está en `/shop-checkout/` y envía un PDF
estimado al cliente con copia a `info@durafencemetal.com`.
Configuración, parámetros y pruebas: [checkout de Facebook](docs/shop-checkout.md).

## Cloudflare

### SEO y Google Analytics 4

La primera etapa SEO conserva las URLs existentes y añade breadcrumbs visuales
y `BreadcrumbList`, contenido para planificar estimados y enlaces entre catálogo,
área de servicio y cotización. Resultados y pendientes: [auditoría SEO](docs/seo-audit.md).

El Google tag existente conserva el ID `G-1Y94FEZF3D`. Para sustituirlo, configura
`PUBLIC_GA4_MEASUREMENT_ID` como variable de **build** y vuelve a compilar.
La variable anterior `PUBLIC_GA_MEASUREMENT_ID` sigue funcionando; la nueva tiene
prioridad, incluso si está vacía. Un valor explícitamente vacío desactiva GA4:

```sh
PUBLIC_GA4_MEASUREMENT_ID='' npm run build
```

El sitio envía estos eventos a esa propiedad:

| Evento | Cuándo ocurre |
| --- | --- |
| `estimate_start` | Primera modificación del estimador por el usuario, una vez por visita a la página. |
| `estimate_complete` | Primer cálculo no vacío y válido, sin errores de dimensiones, componentes o descuento; una vez por visita. No significa que se haya enviado un lead. |
| `quote_submit` | `/api/quote` responde correctamente con `ok: true`. |
| `phone_click` | Clic en un enlace telefónico; no confirma una llamada realizada. |

Los eventos propios llevan únicamente su nombre y el ID de destino, sin datos
de formularios ni importes. La ubicación de página enviada a GA4 usa el dominio
canónico y omite query y fragmento; el referrer también omite query y fragmento.
Las señales de Google y de personalización publicitaria están desactivadas en
la configuración de esta etiqueta. La recopilación automática adicional depende
de los ajustes de GA4: revisar Enhanced Measurement, especialmente Form interactions,
antes de interpretar conversiones o garantizar qué datos recoge la biblioteca.

Con acceso a la propiedad correcta, verificar estos eventos en Realtime/DebugView
y marcar `quote_submit` como evento clave. Mantener `estimate_complete` como medida
del uso de la herramienta y no sumarlo a leads. Excluir visitas de pruebas mediante
los filtros de datos de la propiedad.

Search Console se configura fuera del repositorio: comprobar propiedad del dominio,
verificar mediante DNS si hace falta y enviar
`https://durafencemetal.com/sitemap-index.xml`. Registrar clicks, impressions, CTR y
posición por página antes de publicar, y comparar a los 28 y 56 días.

Documentación oficial: [configurar el Google tag](https://developers.google.com/tag-platform/gtagjs/configure),
[eventos GA4](https://developers.google.com/analytics/devguides/collection/ga4/events),
[breadcrumbs](https://developers.google.com/search/docs/appearance/structured-data/breadcrumb).

### Píxel de Meta

El píxel de Dura Fence Metal es `1991001054903517` y está configurado por defecto.
El script está justo después de `<head>` en la plantilla común a todas las páginas.
La variable de compilación `PUBLIC_META_PIXEL_ID` permite sustituir ese ID;
un valor vacío desactiva el píxel.
El ID de la página de Facebook (`61594968148256`) es un activo diferente.

1. En el [Administrador de eventos de Meta](https://business.facebook.com/events_manager2/),
   selecciona el píxel del negocio Dura Fence Metal o crea una fuente de datos web.
   Copia el ID del píxel/conjunto de datos.
2. Para usar otro píxel, añade `PUBLIC_META_PIXEL_ID=ID_REAL` a `.env` (ignorado por Git).
   En Cloudflare configura ese mismo valor en las variables del **build** si deseas
   sustituir el ID predeterminado.
   El ID es público; no necesita un token de acceso ni una contraseña.
3. Vuelve a compilar y publicar. Para una compilación local:
   `PUBLIC_META_PIXEL_ID=ID_REAL npm run build`.
4. En Meta, vincula el conjunto de datos a la cuenta publicitaria usada por Dura
   Fence Metal. La página de Facebook y el píxel se administran como activos
   del negocio; el enlace de la página por sí solo no permite hacer esa conexión.
5. En **Probar eventos**, abre la web publicada.
   Comprueba `PageView` al visitar páginas y `Lead` después de enviar correctamente
   una solicitud o el correo de un estimado.

El formulario enlazado desde Facebook envía `ViewContent` con los SKU del catálogo
y precios unitarios en USD. Preparar un estimado no genera `AddToCart` ni
`InitiateCheckout`.
`Lead` se envía tras la confirmación del correo con referencia del servidor.
El PDF es un estimado: no confirma una compra y no genera `Purchase`. La compra
se acuerda con ventas, con estimado presencial de la obra para instalaciones;
el pago se realiza presencialmente. Square se usa en el terminal físico y no
interviene en el envío de estimados de esta web.
Diagnóstico del reporte de Commerce Manager y pasos de verificación:
[eventos del catálogo](docs/facebook-commerce-events.md).

Se usa el código base proporcionado por Meta. La imagen de respaldo `noscript`
está en el cuerpo del documento. Los envíos fallidos, los enlaces `mailto` y la
impresión de un PDF no generan `Lead`. Los eventos añadidos por el sitio no
incluyen los datos de contacto ni la dirección del proyecto. La recopilación automática adicional
depende de los ajustes del píxel en Meta.

Los dominios `durafencemetal.com` y `www.durafencemetal.com` están en el Worker `durafence`. `wrangler.jsonc` publica el sitio estático de `dist/` en ese Worker. `www` redirige al dominio principal.

Node queda fijado en `.node-version` (`22.16.0`). Astro 7 no construye con Node 18.

Para publicar una versión nueva:

```sh
npm run build
npx wrangler deploy
```

Si conectas el repositorio al Worker, el comando de build es `npm run build` y el de deploy es `npx wrangler deploy`. No sustituyas el script por la plantilla Hello World del panel: esa plantilla es lo que deja la página en blanco de texto.

### Correo con Resend

El botón **Email PDF** en `/estimate/` envía el PDF con Resend desde
`Dura Fence Metal <invoice@durafencemetal.com>`. El destinatario es el cliente;
las copias ocultas van a `abelterreros@yahoo.com` y `allneedsdiscount1@gmail.com`.
El Worker recalcula los precios y genera el PDF antes de enviarlo.
El campo **Project address** consulta [Photon](https://github.com/komoot/photon) para sugerir direcciones de EE. UU. y el [Censo de EE. UU.](https://www.census.gov/programs-surveys/geography/technical-documentation/complete-technical-documentation/census-geocoder.html) para comprobar la dirección al salir del campo y antes del envío. No requiere una clave adicional. La coincidencia del Censo se basa en rangos de direcciones y no confirma la existencia física de una vivienda ni su entregabilidad postal. El servidor público de Photon puede limitar las consultas; si eso ocurre, el cliente puede escribir la dirección completa manualmente.
**Print / Save PDF** conserva la hoja original de impresión del navegador, con
el monograma y el dibujo técnico. El PDF adjunto por correo reproduce ese diseño
en una página, con el dibujo y los detalles del pedido en dos columnas.

Configuración de producción:

1. En Resend → Domains, añade `durafencemetal.com`, copia a Cloudflare DNS
   los registros de verificación que indique Resend y espera el estado **Verified**.
   No reemplaces los MX del dominio principal destinados a recibir respuestas.
2. Crea una API key de Resend con permiso de envío para ese dominio.
3. En Cloudflare → Workers & Pages → `durafence` → Settings → Variables and Secrets,
   guarda la clave como secreto de ejecución `RESEND_API_KEY`.
   También se acepta `RESENT_API_KEY`, el nombre configurado inicialmente;
   si ambos existen, tiene prioridad `RESEND_API_KEY`.
   Una variable de **Builds** por sí sola no está disponible en `env` del Worker.
   No uses el prefijo `PUBLIC_` ni guardes claves en GitHub o `wrangler.jsonc`.
4. Publica los cambios en la rama conectada a Cloudflare y espera un deploy exitoso.
5. Desde `/estimate/`, completa un estimado con un destinatario de prueba propio
   y pulsa **Email PDF**. Confirma la entrega en Resend → Emails y en la bandeja.

El formulario `/quote/` usa la misma clave de Resend. Envía desde
`Dura Fence Metal <info@durafencemetal.com>` directamente a
`allneedsdiscount1@gmail.com` y `terrerov@gmail.com`. La dirección pública del sitio es
`info@durafencemetal.com`; las variables antiguas `QUOTE_FROM` y `QUOTE_TO`
ya no controlan este destino.

Resend se utiliza para el envío; no requiere Cloudflare Email Sending ni su binding.
Las respuestas a `invoice@durafencemetal.com` requieren un buzón o una regla de
Email Routing separada. El Worker conserva su manejador de reenvío a las dos
bandejas del negocio, que solo funciona con la regla y destinos verificados.

Para recibir correos enviados directamente a `info@durafencemetal.com` o
respuestas al remitente del formulario, activa Cloudflare Email Routing para el
dominio. Verifica `allneedsdiscount1@gmail.com` y `terrerov@gmail.com` como
direcciones de destino y crea
una regla para `info@durafencemetal.com` con acción **Send to a Worker**,
seleccionando `durafence`. El manejador del Worker reenvía esos mensajes a ambas bandejas.
Confirma además que los registros MX de Email Routing sigan activos.

Si una clave fue compartida en un chat, revócala y reemplaza el secreto en Cloudflare.
Las pruebas locales simulan Resend y no envían mensajes reales.

Documentación: [enviar correos](https://resend.com/docs/api-reference/emails/send-email),
[verificar dominios](https://resend.com/docs/dashboard/domains/introduction).
Para el correo entrante: [reglas y destinos de Cloudflare Email Routing](https://developers.cloudflare.com/email-service/configuration/email-routing-addresses/).

### Dominio

En el proyecto de Pages, Custom domains → `durafencemetal.com`.

Si el DNS de ese dominio está en la misma cuenta de Cloudflare, acepta el registro que propone Pages. Si también añades `www.durafencemetal.com` al mismo proyecto, el sitio redirige `www` al dominio principal.

Los hostnames `*.pages.dev` responden `noindex` para que las vistas previas no compitan con el dominio real.

## Continuacion con Hermes Agent

Entrada del proyecto: [HERMES.md](HERMES.md). Incluye estado del candidato,
autorizaciones existentes y reglas de coordinacion. Operacion desde el Mac
Mini por SSH: [guia remota](docs/hermes/REMOTE-WORKFLOW.md).
Estado y siguiente paso: [handoff](docs/hermes/HANDOFF.md).
Encargos: [Codex implementador](docs/hermes/CODEX-TASK.md) y
[Grok revisor](docs/hermes/GROK-REVIEW.md).

El paquete prepara la continuacion; no certifica SSH, agentes conectados,
pruebas completas, configuracion Cloudflare ni publicacion.

