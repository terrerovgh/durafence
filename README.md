# Dura Fence Metal

Sitio de Astro para [durafencemetal.com](https://durafencemetal.com).

## Cloudflare

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

El formulario `/quote/` usa la misma clave y además necesita estas variables
de ejecución (no son necesarias para el botón Email PDF):

- `QUOTE_FROM`: `Dura Fence Metal <invoice@durafencemetal.com>`
- `QUOTE_TO`: la bandeja del negocio que debe recibir solicitudes.

Resend se utiliza para el envío; no requiere Cloudflare Email Sending ni su binding.
Las respuestas a `invoice@durafencemetal.com` requieren un buzón o una regla de
Email Routing separada. El Worker conserva su manejador de reenvío a las dos
bandejas del negocio, que solo funciona con la regla y destinos verificados.

Si una clave fue compartida en un chat, revócala y reemplaza el secreto en Cloudflare.
Las pruebas locales simulan Resend y no envían mensajes reales.

Documentación: [enviar correos](https://resend.com/docs/api-reference/emails/send-email),
[verificar dominios](https://resend.com/docs/dashboard/domains/introduction).

### Dominio

En el proyecto de Pages, Custom domains → `durafencemetal.com`.

Si el DNS de ese dominio está en la misma cuenta de Cloudflare, acepta el registro que propone Pages. Si también añades `www.durafencemetal.com` al mismo proyecto, el sitio redirige `www` al dominio principal.

Los hostnames `*.pages.dev` responden `noindex` para que las vistas previas no compitan con el dominio real.
