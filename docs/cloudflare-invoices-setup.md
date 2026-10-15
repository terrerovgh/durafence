# D1 y Access para Dura Fence

## Estado y alcance

Preparado localmente; no aplicado ni verificado en Cloudflare. El usuario autorizo configurar D1 y Access y publicar este proyecto. Esta sesion no dispone de un conector administrativo Cloudflare y las herramientas nativas fallan al iniciar. No se ha creado una base, cambiado una politica, desplegado ni enviado correo real.

La propuesta concreta esta en docs/invoice-evidence/cloudflare-setup.json. Incluye el correo autorizado y queda fuera del manifiesto de publicacion.

## Identificar el entorno existente

En Cloudflare, identificar la cuenta que contiene el Worker durafence y el dominio durafencemetal.com. Confirmar los dos hostnames antes de agregarlos. Registrar Account ID, version actual del Worker, bindings y politicas existentes. Conservar la integracion GitHub y su comando de despliegue. No crear otro Worker escritor ni reemplazar recursos existentes sin revisar su estado.

## Base D1

Crear durafence-invoices solo si no existe una base adecuada. Copiar su Database ID; es un identificador publico. Usar INVOICE_DB como binding del Worker. Si ya contiene datos, detener la migracion hasta revisar tablas y respaldo recuperable; no recrearla.

Preparar wrangler.invoice.jsonc con scripts/prepare-invoice-config.mjs y los identificadores reales. Revisar el resultado y trasladar los bindings y variables al archivo wrangler.jsonc que utiliza la integracion de produccion. El generador no modifica la configuracion activa ni ejecuta acciones remotas.

En un terminal funcional, validar primero en una base local o de pruebas:

    npx wrangler d1 migrations apply durafence-invoices --local --config wrangler.invoice.jsonc

Tras pruebas y revision independiente, aplicar a la base de produccion identificada:

    npx wrangler d1 migrations apply durafence-invoices --remote --config wrangler.invoice.jsonc

La migracion es migrations/0001_invoices.sql. Configurar migrations_dir como migrations. No usar una base de pruebas como destino de produccion.

## Una aplicacion Access para pagina y API

Crear una unica aplicacion Self-hosted llamada Dura Fence Invoices con estos destinos, sujetos a confirmar los hostnames existentes:

| Hostname | Path |
| --- | --- |
| durafencemetal.com | invoice |
| durafencemetal.com | api/invoices |
| www.durafencemetal.com | invoice |
| www.durafencemetal.com | api/invoices |

El path padre protege sus descendientes si no existe otra aplicacion mas especifica que reemplace la politica. Revisar posibles solapamientos. Una regla que termina solo en /* no cubre el path padre. Mantener pagina y API en la misma aplicacion para que compartan AUD. No proteger el dominio publico completo.

Seleccionar One-time PIN como metodo de inicio de sesion, sin habilitar proveedores adicionales para esta aplicacion. Crear una politica Allow cuyo selector Emails contenga solo terrerov@gmail.com; no usar Everyone ni un dominio completo. Sesion propuesta: 8 horas.

Copiar el Team domain y el Application Audience (AUD). Configurar en el Worker:

- INVOICE_ACCESS_ISSUER: https://equipo-real.cloudflareaccess.com, sin slash final.
- INVOICE_ACCESS_AUD: AUD real de esa misma aplicacion.
- INVOICE_DB: binding D1, no una variable de texto.

No modificar ni leer credenciales de correo existentes. El Worker valida la firma del JWT, issuer, audiencia y vigencia y rechaza el acceso si falta configuracion valida.

## Comprobar y revertir

Antes de publicar: build, pruebas, revision independiente y prueba de reversion. Comprobar que el correo autorizado entra, otro correo queda rechazado y las peticiones sin sesion a pagina y API no obtienen documentos. Probar ambos hostnames y subrutas; las rutas publicas deben seguir disponibles. Validar con datos sinteticos guardado, conflictos de revision, historial, pagos y PDF. No enviar correo real como prueba automatica.

Si falla el despliegue, restaurar la version anterior del Worker y la configuracion Access registrada. Conservar D1 y sus datos. No borrar tablas ni desproteger invoices para resolver un problema de login. La restauracion aun no esta ensayada en esta sesion.

## Referencias oficiales

- [D1: inicio y binding](https://developers.cloudflare.com/d1/get-started/)
- [Migraciones D1](https://developers.cloudflare.com/d1/reference/migrations/)
- [Access: paths y precedencia](https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/)
- [Access: One-time PIN](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/)

