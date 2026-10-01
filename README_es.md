<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/inkforum-wordmark-light.png">
  <img src=".github/assets/inkforum-wordmark-dark.png" alt="InkForum" width="360">
</picture>

### Software de comunidad moderno y ligero que gestionas por completo desde el navegador

Pensado para servidores de juegos, comunidades de rol, marcas y grupos de aficionados:
se instala con un solo comando, funciona sin problemas en un VPS económico y se actualiza con un clic.

[![Última versión](https://img.shields.io/github/v/release/vokartz/inkforum?label=release&color=7b61ff)](https://github.com/vokartz/inkforum/releases)
[![Docker](https://img.shields.io/badge/docker-ghcr.io%2Fvokartz%2Finkforum-2496ed?logo=docker&logoColor=white)](https://github.com/vokartz/inkforum/pkgs/container/inkforum)
[![Plataforma](https://img.shields.io/badge/platform-amd64%20%7C%20arm64-555)](#requisitos)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-ffdd00?logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/vokartz)

[English](README.md) · [Türkçe](README_tr.md) · [Deutsch](README_de.md) · [简体中文](README_zh.md) · **Español** · [Français](README_fr.md) · [Русский](README_ru.md) · [Português](README_pt.md)

[Inicio rápido](#-inicio-rápido) · [Funcionalidades](#-funcionalidades) · [Actualizaciones](#-actualizaciones) · [Copias de seguridad](#-copias-de-seguridad-y-restauración) · [Importar](#-importar-desde-otro-foro) · [Preguntas frecuentes](#-preguntas-frecuentes) · [Apoyo](#-apoya-el-proyecto)

</div>

---

## ¿Por qué InkForum?

| | |
|---|---|
| **En línea en minutos** | Un instalador de una sola línea prepara Docker, obtiene un certificado HTTPS gratuito para tu dominio y te deja en manos de un asistente de configuración muy sencillo. |
| **Rápido en hardware económico** | Un único proceso con SQLite por defecto: sin Redis, sin servidor de búsqueda y sin servidor de base de datos aparte. Un VPS con 1 GB de RAM es más que suficiente. |
| **Control total sin código** | Temas, colores, menús, página de inicio, permisos, plantillas de correo, plugins… todo se gestiona desde el panel de administración. |
| **Actualizaciones con un clic** | Las nuevas versiones aparecen en el panel junto con sus notas de la versión. Antes se crea una copia de seguridad y, si algo falla, se restaura automáticamente la versión anterior. |
| **Seguro por defecto** | Cortafuegos de aplicaciones web (WAF) integrado, autenticación en dos pasos, reautenticación para acciones de administración y una Content Security Policy estricta. |
| **Multilingüe** | Inglés, turco, alemán, chino, español, francés, ruso y portugués: cada miembro elige su propio idioma. |

## 🚀 Inicio rápido

En Ubuntu, Debian, Rocky, Alma o cualquier servidor Linux capaz de ejecutar Docker:

```bash
curl -fsSL https://raw.githubusercontent.com/vokartz/inkforum/main/install.sh | sudo bash
```

El script:

1. instala Docker si no está presente (tras pedirte confirmación),
2. crea `/opt/inkforum` y un archivo `.env` con secretos aleatorios robustos,
3. activa **HTTPS automático** (Let's Encrypt mediante Caddy) si introduces un dominio,
4. inicia InkForum y muestra tu **URL y código de instalación**.

Abre `https://your-domain.com/install` en el navegador. El asistente comprueba tu servidor y te pide el nombre del foro,
el tema, la cuenta de administrador, el modo de registro, los plugins y (opcionalmente) la configuración de correo. Y listo.

> **¿Por qué un código de instalación?** Impide que otra persona se apropie de un servidor recién instalado y expuesto a internet.
> El código solo se muestra en el registro del servidor: `docker compose -f /opt/inkforum/docker-compose.yml logs inkforum | grep "Kurulum kodu"`

### Instalación manual (Docker Compose)

```bash
mkdir -p /opt/inkforum && cd /opt/inkforum
curl -fsSLO https://raw.githubusercontent.com/vokartz/inkforum/main/docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/vokartz/inkforum/main/.env.example -o .env
# fill in APP_URL, APP_SECRET and UPDATER_TOKEN in .env
docker compose up -d
```

### Coolify, Dokploy, Portainer

Añade `docker-compose.yml` directamente a tu plataforma y define `APP_URL`, `APP_SECRET` (al menos 32 caracteres) y
`UPDATER_TOKEN` (al menos 16 caracteres). Si la plataforma ofrece su propio proxy inverso, mantén `TRUST_PROXY=uniquelocal`
y no actives el perfil `https` (Caddy).

### Requisitos

| | Mínimo | Recomendado |
|---|---|---|
| CPU | 1 vCPU (amd64 o arm64) | 2 vCPU |
| Memoria | 1 GB | 2 GB |
| Disco | 5 GB | 20 GB + archivos subidos |
| Software | Docker 24+ con el plugin Compose | — |

¿No puedes usar Docker (cPanel/Passenger, Plesk, Node.js sin más)? Cada versión incluye también un **paquete de servidor**; consulta
[Instalación sin Docker](#instalación-sin-docker).

## ✨ Funcionalidades

<details open>
<summary><b>Foro</b></summary>

- Categorías, subforos anidados, foros de enlace, portadas de foro y páginas de normas
- Prefijos de tema, etiquetas, encuestas, fijar, destacar, cerrar, mover y fusionar temas
- Editor de texto enriquecido: encabezados, tablas, spoilers, código, colores, subida de imágenes y borradores guardados automáticamente
- Inserción automática de contenido de 24 proveedores, entre ellos YouTube, Twitch, Kick, Spotify, X, Instagram, TikTok e invitaciones de Discord
- Citas, @menciones, reacciones con emoji, reputación, seguimiento de no leídos y suscripciones a temas
- Búsqueda avanzada, temas similares, cola de aprobación e historial de ediciones
</details>

<details>
<summary><b>Miembros y comunidad</b></summary>

- Cinco modos de registro (inmediato, verificación por correo, aprobación del administrador, ambos o cerrado) con protección contra bots
- Grupos, rangos según número de mensajes, membresías por tiempo limitado y solicitudes de ingreso a grupos
- Perfiles con foto de portada, campos personalizados, logros, firmas y ajustes de privacidad
- Conversaciones privadas (1:1 y en grupo), notificaciones y notificaciones por correo
- Inicio de sesión con Discord, Google y GitHub
</details>

<details>
<summary><b>Diseño</b></summary>

- Tres temas: **Modern**, **Community** (gran banner) y **Classic** (inspirado en SMF, con toques modernos)
- Modo claro/oscuro, color de acento, 9 fuentes, radio de las esquinas, banner, logotipo y fondos
- Editor de menús y bloques de la página de inicio con arrastrar y soltar
- **Studio**: un creador de páginas a pantalla completa con arrastrar y soltar: landing pages, galerías, tarjetas de servidor, cuentas atrás, tablas de precios, preguntas frecuentes…
- Restablece la apariencia a los valores predeterminados con un clic
- Totalmente adaptable; se puede instalar en la pantalla de inicio (manifiesto PWA)
</details>

<details>
<summary><b>Plugins</b></summary>

| Plugin | Qué hace |
|---|---|
| **Página de aterrizaje** | Una página de Studio se convierte en tu página de inicio; el foro se traslada automáticamente a `/forum` |
| **Wiki** | Páginas anidadas ilimitadas, índice de contenidos, búsqueda e historial de páginas |
| **Solicitudes** | Solicitudes para el equipo y para roles con 8 tipos de pregunta, requisitos, revisiones y asignación automática de grupo |
| **Tickets de soporte** | Equipos responsables por categoría, estados, prioridades y notas internas |
</details>

<details>
<summary><b>Buscadores y compartir</b></summary>

- `robots.txt` dinámico y un `sitemap.xml` automático dividido en secciones (solo contenido público)
- Tarjetas Open Graph y de X, URL canónicas y datos estructurados (JSON-LD)
- **Imágenes para compartir** generadas automáticamente para los temas (título, foro, autor, estadísticas)
- oEmbed y tarjetas de tema que se pueden insertar en otros sitios web
- Verificación de Google, Bing y Yandex; bloqueo opcional de rastreadores de IA
</details>

<details>
<summary><b>Seguridad</b></summary>

- **Cortafuegos** integrado: bloqueo de patrones de ataque, limitación de peticiones, bloqueo de bots maliciosos y reglas por IP/rango
- Página de desafío durante un ataque: proof-of-work integrado, Cloudflare Turnstile o hCaptcha
- Contraseñas con argon2id, 2FA, gestión de sesiones y reautenticación para acciones de administración
- CSP estricta, protección CSRF y webhooks protegidos contra SSRF
- Bloqueos por IP, correo, dominio y miembro; puntos de advertencia con sanciones automáticas
</details>

<details>
<summary><b>Integraciones</b></summary>

- Proveedor OAuth 2.0 («Inicia sesión con tu cuenta del foro», PKCE), API REST con permisos por ámbito y claves de API
- Webhooks firmados (nuevo tema, registro, cambio de grupo…) y tokens de miembro firmados para paneles de juego / UCP
- Fragmentos HTML/CSS/JS personalizados (seguros gracias a los nonces de CSP) y una API de JavaScript `window.forum`
</details>

## 🔄 Actualizaciones

InkForum sigue las [versiones](https://github.com/vokartz/inkforum/releases) publicadas en este repositorio.

- **Administración → Actualizaciones** muestra tu versión, la versión más reciente y sus **notas de la versión**.
- **Actualizar ahora**: copia de seguridad de la base de datos → descarga de la nueva imagen → reinicio con comprobación de estado → **reversión automática** si la
  nueva versión no arranca. El progreso se muestra en tiempo real.
- **Actualizaciones automáticas**: desactivadas, solo correcciones (1.2.x), correcciones + funcionalidades (1.x) o todo, a la hora nocturna que elijas.
  Los administradores reciben una notificación cuando se publica una nueva versión.
- Canales **Estable / Beta**.

¿Prefieres la línea de comandos?

```bash
cd /opt/inkforum && docker compose pull && docker compose up -d
```

Los cambios en la base de datos se aplican automáticamente al iniciar.

## 💾 Copias de seguridad y restauración

- **Administración → Mantenimiento y copias de seguridad**: instantánea de la base de datos, **volcado SQL** portátil o **copia completa** (base de datos + archivos subidos).
- Copias automáticas diarias a la hora que elijas; se conservan las N más recientes. También se crea una copia antes de cada actualización y de cada restauración.
- **Subir y restaurar**: sube una copia de seguridad (también de otro servidor), escribe `GERİ YÜKLE` para confirmar e InkForum la restaurará
  durante el reinicio. Antes se guarda el estado actual, así que siempre podrás volver atrás.
- Todo (base de datos, archivos subidos, copias de seguridad) se guarda en el volumen de Docker `inkforum-storage`:

```bash
docker run --rm -v inkforum_inkforum-storage:/data -v "$PWD":/backup alpine tar czf /backup/inkforum-storage.tgz -C /data .
```

## 🚚 Importar desde otro foro

¿Vienes de **SMF**, **phpBB**, **Invision Community (IPS)** o **MyBB**? **Administración → Importar** trae desde un volcado de la base de datos los miembros, los grupos
y las imágenes de rango, las categorías y los foros, los temas, los mensajes, las encuestas, los mensajes privados, los adjuntos y los avatares.
Los miembros conservan su contraseña cuando se puede verificar el antiguo sistema de hash; de lo contrario, establecen una nueva con «¿Olvidaste tu contraseña?».

## ⚙️ Configuración

Todos los ajustes del foro están en el panel de administración. El archivo `.env` solo describe la infraestructura:

| Variable | Descripción |
|---|---|
| `APP_URL` | Dirección completa del sitio (`https://forum.example.com`) |
| `APP_SECRET` | Clave de sesión y cifrado (32 caracteres o más; cambiarla cierra la sesión de todos) |
| `UPDATER_TOKEN` | Clave compartida con el contenedor de actualización |
| `DOMAIN`, `COMPOSE_PROFILES=https` | HTTPS automático con Caddy |
| `DB_DRIVER`, `DATABASE_URL` | Usar PostgreSQL (añade `postgres` a `COMPOSE_PROFILES`) |
| `TRUST_PROXY` | IP reales de los clientes detrás de un proxy inverso (se recomienda `uniquelocal`) |
| `INKFORUM_PORT`, `INKFORUM_BIND` | Puerto publicado y dirección de enlace |
| `UPDATES_DISABLED` | Desactiva la búsqueda de actualizaciones en servidores sin conexión |
| `WAF_DISABLED` | Interruptor de emergencia para desactivar el cortafuegos |

## Instalación sin Docker

Cada versión incluye `inkforum-<version>-linux-x64.tar.gz` (con las dependencias incluidas) e `inkforum-<version>.tar.gz`.
Se necesita Node.js 22.13 o posterior.

```bash
curl -fsSLO https://github.com/vokartz/inkforum/releases/latest/download/inkforum-<version>-linux-x64.tar.gz
tar xzf inkforum-*-linux-x64.tar.gz && cd inkforum
cp .env.example .env   # fill in APP_URL and APP_SECRET
NODE_ENV=production node --env-file=.env server.mjs
```

Ejecútalo con systemd, PM2 o Passenger. Las actualizaciones desde el panel descargan el paquete, lo verifican con SHA-256, lo instalan
y reinician el proceso (tu gestor de procesos debe encargarse de reiniciarlo). Ejemplo de unidad de systemd:

```ini
[Unit]
Description=InkForum
After=network.target

[Service]
WorkingDirectory=/opt/inkforum
Environment=NODE_ENV=production
ExecStart=/usr/bin/node --env-file=.env server.mjs
Restart=always
User=inkforum

[Install]
WantedBy=multi-user.target
```

## ❓ Preguntas frecuentes

**¿Qué base de datos debería elegir?**
SQLite es suficiente para la mayoría de las comunidades y es la que menos mantenimiento requiere. PostgreSQL está disponible para comunidades muy grandes
o si prefieres una base de datos gestionada.

**Mi servidor no tiene acceso a internet, ¿qué pasa con las actualizaciones?**
Establece `UPDATES_DISABLED=true`, carga la nueva imagen manualmente y ejecuta `docker compose up -d`.

**El cortafuegos me ha bloqueado el acceso.**
Añade `WAF_DISABLED=true` a `.env`, ejecuta `docker compose up -d` y después corrige los ajustes en el panel.

**He olvidado la contraseña de administrador.**
Usa «¿Olvidaste tu contraseña?» en la página de inicio de sesión. Si no hay configuración de correo, el enlace se guarda en `storage/mail`:
`docker compose exec inkforum ls /app/storage/mail`

## 🐞 Errores e ideas

¿Has encontrado un error o tienes una idea? [Abre una incidencia](https://github.com/vokartz/inkforum/issues/new/choose): los formularios te guían
por todos los datos que necesitamos. En tu foro, **Administración → Información del sistema → «Informar de un error en GitHub»** rellena automáticamente tu versión y
tu entorno. Para problemas de seguridad, usa los [avisos privados](https://github.com/vokartz/inkforum/security/advisories/new).

## ☕ Apoya el proyecto

InkForum lo desarrolla un equipo pequeño. Si le resulta útil a tu comunidad, puedes ayudar a que la tinta siga fluyendo:

<a href="https://buymeacoffee.com/vokartz"><img src="https://img.shields.io/badge/Buy%20me%20a%20coffee-ffdd00?style=for-the-badge&logo=buymeacoffee&logoColor=black" alt="Buy Me a Coffee"></a>

### 💛 Colaboradores

Muchísimas gracias a todas las personas que apoyan InkForum. Los colaboradores aparecen aquí con su permiso.

<!-- SUPPORTERS:START -->
| | |
|---|---|
| *Tu nombre o tu comunidad podría estar aquí* | [Hazte colaborador](https://buymeacoffee.com/vokartz) |
<!-- SUPPORTERS:END -->

Otras formas de ayudar: ⭐ dale una estrella a este repositorio, informa de errores, propón funcionalidades, traduce InkForum a tu idioma
o háblales de él a otros administradores de comunidades.

## Licencia

InkForum es software libre y de código abierto bajo la [GNU AGPL-3.0](LICENSE). Puedes usarlo, estudiarlo, modificarlo y compartirlo;
si ejecutas una versión modificada para otros (también como servicio alojado), debes publicar tus cambios con la misma licencia.
Para contribuir: [CONTRIBUTING.md](CONTRIBUTING.md). Cambios: [CHANGELOG.md](CHANGELOG.md). Seguridad: [SECURITY.md](SECURITY.md).

<div align="center"><sub>© InkForum · hecho con ♥ en Turquía</sub></div>
