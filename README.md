# Dura Fence Metal

Sitio de Astro para [durafencemetal.com](https://durafencemetal.com).

## Cloudflare Pages

Conecta este repositorio en Workers & Pages → Create → Pages → Import a Git repository.

| Ajuste | Valor |
| --- | --- |
| Production branch | `main` |
| Framework preset | Astro |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `/` |

Node queda fijado en `.node-version` (`22.16.0`). Astro 7 no construye con Node 18.

Las Pages Functions viven en `functions/` (formulario de presupuesto y redirecciones del dominio). Cloudflare las toma de la raíz del repositorio; no hace falta copiarlas dentro de `dist`.

### Correo del formulario

El sitio se publica sin estas variables. El formulario solo envía correo cuando las tres están definidas en Settings → Environment variables, tanto en Production como en Preview:

- `RESEND_API_KEY`
- `QUOTE_TO` — bandeja que recibe las solicitudes
- `QUOTE_FROM` — remitente ya verificado en Resend

### Dominio

En el proyecto de Pages, Custom domains → `durafencemetal.com`.

Si el DNS de ese dominio está en la misma cuenta de Cloudflare, acepta el registro que propone Pages. Si también añades `www.durafencemetal.com` al mismo proyecto, el sitio redirige `www` al dominio principal.

Los hostnames `*.pages.dev` responden `noindex` para que las vistas previas no compitan con el dominio real.
