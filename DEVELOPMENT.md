# Desarrollo en Docker

El servidor Astro de desarrollo se publica mediante Traefik en
`https://durafencemetal.terrerov.com`. El router aplica el middleware
`ipwhitelist@file` compartido, que limita el acceso a la red Tailscale.

Desde este directorio, inicia o reconstruye el entorno con:

```sh
docker compose up -d --build
```

El directorio del proyecto está montado dentro del contenedor y Astro usa HMR,
así que los cambios guardados por el desarrollador o sus agentes aparecen en el
navegador sin reconstruir la imagen. El volumen `durafencemetal-node-modules`
mantiene las dependencias del contenedor separadas de las del host.

Para seguir el arranque y detenerlo:

```sh
docker compose logs -f durafencemetal-dev
docker compose down
```

Traefik ya debe estar ejecutándose en la red Docker externa
`traefik_traefik-net`; el dominio debe resolver al host de Traefik desde los
dispositivos conectados a Tailscale.
