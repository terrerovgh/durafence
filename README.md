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

### Correo del formulario

El sitio se publica sin estas variables. El formulario solo envía correo cuando las tres están definidas en Settings → Environment variables, tanto en Production como en Preview:

- `RESEND_API_KEY`
- `QUOTE_TO` — bandeja que recibe las solicitudes
- `QUOTE_FROM` — remitente ya verificado en Resend

### Dominio

En el proyecto de Pages, Custom domains → `durafencemetal.com`.

Si el DNS de ese dominio está en la misma cuenta de Cloudflare, acepta el registro que propone Pages. Si también añades `www.durafencemetal.com` al mismo proyecto, el sitio redirige `www` al dominio principal.

Los hostnames `*.pages.dev` responden `noindex` para que las vistas previas no compitan con el dominio real.
