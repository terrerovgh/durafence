# ADR-002: Dashboard privado de estimados e invoices

Estado: candidato aprobado para implementacion local por el usuario.
Revision R2 de otra familia y promocion pendientes.

## Problema y decisiones

Precios fijos y materiales sobre toda la longitud no representan acuerdos,
aberturas ni cantidades corregidas. Se agrega un modelo independiente:
tarifas iniciales del catalogo, overrides por documento, geometria por tramos
y gates, cantidades corregibles y motor puro compartido.

El usuario eligio historial compartido y acceso por codigo de email.
Se utiliza D1 dedicada y Cloudflare Access sobre el Worker existente,
sin nuevas contrasenas ni cambios en tarifas publicas.
Las revisiones son inmutables con version optimista validada por trigger.
Los pagos se conservan al editar; anular agrega reversa.

El PDF conserva identidad y distribucion del documento actual.
Un generador sirve vista previa, descarga, impresion y correo.
El cliente ve el acuerdo final, sin notas internas.

## Consecuencias y limites

Se necesitan recursos reales en Cloudflare, aun no aplicados.
La API falla cerrada sin Access/D1. No hay bypass local en produccion.
Se incluyen pruebas con identidad y almacenamiento sinteticos.
El dibujo no sustituye validacion estructural.
Correo ambiguo requiere comprobar el proveedor.
Los datos Dura Fence no se mezclan con Terreros.

## Aceptacion para revision independiente

Reproducir los escenarios originales del plan y las pruebas nuevas.
Verificar JWT falsificado, expiracion y rutas alternativas.
Comprobar concurrencia sobre SQLite y D1 de prueba.
Comprobar PDF multipagina y margen real al imprimir.
Confirmar tarifas publicas, ausencia de Analytics/Meta privados,
preservacion de pagos e historial y reversibilidad con D1 conservada.

Fuentes oficiales consultadas en planificacion:
https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
https://developers.cloudflare.com/d1/worker-api/d1-database/
https://developers.cloudflare.com/d1/reference/migrations/

