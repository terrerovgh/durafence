# Dashboard privado de invoices

## Estado y alcance

Implementacion local candidata, sin publicar. Ruta: /invoice/.
El usuario aprobo precios negociados solo en invoices, acceso para vendedores
por codigo de email, historial compartido, tramos y ubicacion de gates,
postes compartidos, estimados convertibles en invoices y pagos manuales.
El estimador publico conserva tarifas y contrato de API.

Editor en espanol; documento del cliente en ingles. No carga Analytics ni Meta
ni guarda clientes en localStorage. La politica de Cloudflare Access administra
la lista de vendedores. Sin Access configurado: 503. Sin JWT valido: 403.
El Worker verifica firma RSA, emisor, audiencia y expiracion.
Las escrituras requieren Origin del mismo sitio.

## Uso

1. Agregar tramos, longitud y puntos inicial/final. Un punto compartido cuenta
   como un unico poste. Ejemplo: frente P1-P2 y lateral P2-P3.
2. Elegir paquete y servicio. Dejar precios/especificaciones en blanco utiliza
   el paquete; un valor explicito los reemplaza solo para este documento.
3. Agregar gates. La posicion se mide desde el inicio del tramo. Un gate
   independiente no descuenta longitud. Included conserva materiales con
   importe cero. Postes separados y refuerzos son opciones por gate.
4. Elegir camaras incluidas y adicionales. No se inventa un precio adicional:
   debe indicarse o incluirse en el acuerdo. Agregar otras partidas libremente.
5. Revisar materiales y corregir cantidades. Los materiales del paquete no
   se facturan otra vez: los extras cobrados son partidas adicionales.
6. Configurar descuento, cargo con concepto, deposito y condiciones.
   Las notas internas nunca se muestran en el PDF ni el correo.
7. Guardar, revisar el PDF y convertir cuando el cliente haya aceptado.
   Descargar, imprimir desde el visor PDF o enviar mediante accion explicita.
8. Registrar pagos en invoices. Anular crea una reversa, no borra el pago.
   Las revisiones anteriores se consultan y se pueden copiar como estimados.

## Calculo

200 pies contratados a 30 USD/pie cuestan 6000 USD incluso con un gate incluido.
Un gate de 12 pies deja 188 pies de cerca efectiva y 376 pies lineales de
rieles en Standard. Si lleva planks, agrega 24 planks de gate.
Los custom aluminium gates no agregan planks. Ancho nominal de plank:
6 pulgadas. El redondeo se hace por seccion continua.

Postes por seccion solida, deduplicando extremos; sin postes dentro de la
abertura. Reforzados es un subconjunto del total. Los rieles excluyen aberturas;
marcos y herrajes pertenecen al gate. Altura inicial: 6 pies.
El dibujo indica altura mas empotramiento y es orientativo, no estructural.
Limites: 100 tramos, gates y partidas; 5000 pies por tramo, abertura hasta
100 pies y altura hasta 50 pies. Cantidades enteras donde procede.

Importes en centavos: partidas, descuento, cargo sobre subtotal descontado,
total, deposito y saldo menos pagos. Descuento limitado al subtotal.
Deposito no superior al total. Saldo negativo representa credito.
No se aplica automaticamente el antiguo cargo con tarjeta.

## API y almacenamiento

- POST /api/invoices crea estimado.
- PUT /api/invoices/:id agrega revision y exige version. Conflicto: 409.
- POST /api/invoices/search busca y pagina sin nombres en la URL.
- GET /api/invoices/:id?version=N consulta una revision.
- GET /api/invoices/:id/history incluye autores, fechas y estado del correo.
- POST /api/invoices/:id/convert registra aceptacion y convierte a invoice.
- POST /api/invoices/:id/payments registra pago o reversa.
- POST /api/invoices/preview genera PDF sin guardar, conservando los pagos
  de la revision indicada cuando el documento ya existe.
- GET /api/invoices/:id/pdf?version=N genera PDF de esa revision.
- POST /api/invoices/:id/send envia la revision indicada.

D1 utiliza documentos, revisiones JSON y registros de envio. El trigger
valida la siguiente version y actualiza el resumen atomicamente.
Consultas parametrizadas. Numeros EST o DFM, ano de creacion y secuencia
unica; convertir conserva el estimado en una revision anterior.
Editar conserva pagos. No hay borrado fisico.

El PDF nuevo usa Letter con margen de 40 puntos, encabezado y pie dentro del
area imprimible y varias paginas. Vista previa, descarga y correo comparten
generador. La impresion publica usa media pulgada de margen directamente en el
componente Astro existente, sin cambiar la composicion.

## Aprovisionamiento pendiente

El rol infra y el usuario deben aprobar el destino concreto. No se aplicaron
acciones externas. Entornos de prueba separados de produccion.

- Crear D1 dedicada y confirmar nombre e ID reales.
- Configurar Access OTP y Allow de emails de vendedores.
  Proteger /invoice, /invoice/*, /api/invoices y /api/invoices/* en los
  hostnames reales; establecer emisor y AUD de esa aplicacion.
- Preparar config sin sustituir la original:

    node scripts/prepare-invoice-config.mjs WORKER_NAME DB_NAME DB_ID ACCESS_ISSUER ACCESS_AUD

- Aplicar primero la migracion local:

    npx wrangler d1 migrations apply DB_NAME --local --config wrangler.invoice.jsonc

- Ensayar migracion, copia y restauracion en una base de prueba.
- Configurar RESEND_API_KEY desde el panel, sin leerlo del proyecto.
  Se conserva compatibilidad con RESENT_API_KEY.
- Publicar tras revision independiente, pruebas y aprobacion concreta.

Las pruebas usan SQLite en memoria y JWT sinteticos. No existe bypass
de autenticacion en produccion. No se inventaron IDs reales de recursos.

## Correo y fallos

Se conservan remitente y copias del estimador existente.
El estado del envio se reserva antes de contactar Resend, con clave idempotente
por documento y revision. Un envio confirmado no se repite.
El limite de 30 envios por hora se reserva atomicamente en D1.
Un timeout o resultado ambiguo bloquea el reintento automatico.
Revisar el registro del proveedor antes de resolver manualmente ese estado.
No crear una revision nueva solo para repetir un resultado desconocido.

## Verificacion y reversibilidad

    npm test
    scripts\test-invoices.cmd
    npm run build

Usar Node 22.16.0 fijado en .node-version; las pruebas de SQLite utilizan
node:sqlite. Las pruebas nuevas cubren calculos, PDF, JWT firmado, transacciones SQLite,
concurrencia y API privada. Revision de navegador pendiente: cliente nuevo,
200 pies a 30 USD, gates incluidos/excluidos/aluminium, dos camaras,
varios tramos conectados, overrides y reset, altura custom, duplicacion,
revisiones, pagos/reversas, correo simulado, teclado, movil y PDF multipagina.

Reversion: volver al Worker anterior conservando D1 y sus copias.
No eliminar D1 ni restaurar una copia antigua sobre datos nuevos.
Antes de publicar, ensayar recuperacion compatible de los documentos creados.
Restauracion y reversion remota: not_run. Estado detallado y evidencia
de preparacion local: invoice-evidence/status.md.

