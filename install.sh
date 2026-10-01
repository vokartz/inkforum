#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  InkForum installer
#
#    curl -fsSL https://raw.githubusercontent.com/vokartz/inkforum/main/install.sh | sudo bash
#
#  The language is detected from the system locale (LANG); override it with INKFORUM_LANG.
#  Unattended install with environment variables:
#    INKFORUM_DIR=/opt/inkforum  INKFORUM_DOMAIN=forum.example.com  INKFORUM_PORT=3000
#    INKFORUM_DB=sqlite|postgres  INKFORUM_LANG=en|tr|de|es|fr|pt|ru|zh  INKFORUM_YES=1
# ─────────────────────────────────────────────────────────────
set -euo pipefail

REPO_RAW="${INKFORUM_REPO_RAW:-https://raw.githubusercontent.com/vokartz/inkforum/main}"
DIR="${INKFORUM_DIR:-/opt/inkforum}"
PORT="${INKFORUM_PORT:-3000}"
DOMAIN="${INKFORUM_DOMAIN:-}"
DB="${INKFORUM_DB:-sqlite}"
YES="${INKFORUM_YES:-0}"
LANGS=(en tr de es fr pt ru zh)
LANG_NAMES=(English Türkçe Deutsch Español Français Português Русский 中文)

bold=$'\e[1m'; dim=$'\e[2m'; green=$'\e[32m'; yellow=$'\e[33m'; red=$'\e[31m'; reset=$'\e[0m'
step() { printf '\n%s▸ %s%s\n' "$bold" "$1" "$reset"; }
ok()   { printf '  %s✓%s %s\n' "$green" "$reset" "$1"; }
warn() { printf '  %s!%s %s\n' "$yellow" "$reset" "$1"; }
die()  { printf '\n%s✗ %s%s\n' "$red" "$1" "$reset" >&2; exit 1; }

interactive() { [[ "$YES" != "1" && -r /dev/tty ]]; }

# Questions are read from the terminal even when the script is piped (curl | bash)
ask() {
  local prompt="$1" default="${2:-}" answer=""
  if ! interactive; then echo "$default"; return; fi
  read -r -p "  $prompt ${default:+[$default] }" answer < /dev/tty || true
  echo "${answer:-$default}"
}

# Yes is the default; any answer starting with a "no" letter in a supported language declines
confirm() {
  case "$(ask "$1 $M_YN" "$M_Y")" in
    [Nn]* | [Hh]* | н* | Н* | 否* | 不*) return 1 ;;
    *) return 0 ;;
  esac
}

rand() { (LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom 2>/dev/null | head -c "${1:-48}") || true; }

# ── Language ─────────────────────────────────────────────────
detect_lang() {
  local sys="${INKFORUM_LANG:-${LC_ALL:-${LC_MESSAGES:-${LANG:-${LANGUAGE:-}}}}}"
  sys="${sys,,}"; sys="${sys%%[_.@:-]*}"
  for l in "${LANGS[@]}"; do [[ "$l" == "$sys" ]] && { echo "$l"; return; }; done
  echo en
}

load_lang() {
  case "$1" in
    tr)
      M_TAGLINE='Modern topluluk yazılımı — Docker kurulumu'
      M_ROOT='Bu betiği root olarak çalıştırın (sudo bash).'
      M_YN='(E/h)'; M_Y='E'
      M_CHK_DOCKER='Docker denetleniyor'
      M_NO_DOCKER='Docker kurulu değil.'
      M_ASK_DOCKER='Docker resmi betiğiyle kurulsun mu?'
      M_NEED_DOCKER='Docker gerekli: https://docs.docker.com/engine/install/'
      M_NO_COMPOSE='Docker Compose eklentisi bulunamadı (docker compose).'
      M_DIR='Klasör hazırlanıyor: %s'
      M_GOT_COMPOSE='docker-compose.yml indirildi'
      M_ENV_KEPT='.env zaten var; korunuyor (yeniden kurulum)'
      M_ASK_DOMAIN='Alan adınız (otomatik HTTPS için; yoksa boş bırakın):'
      M_ENV_DONE='.env oluşturuldu (adres: %s)'
      M_PULL='InkForum indiriliyor ve başlatılıyor'
      M_PULL_FAIL='İmaj indirilemedi (ghcr.io/vokartz/inkforum). İnternet bağlantısını denetleyip yeniden deneyin.'
      M_RUNNING='Kapsayıcılar çalışıyor'
      M_WAIT='Uygulamanın açılması bekleniyor'
      M_READY='Hazır'
      M_SLOW='Uygulama zamanında yanıt vermedi; günlüğe bakın: docker compose logs inkforum'
      M_DONE='InkForum kuruldu!'
      M_WIZARD='Kurulum sihirbazı'
      M_FOOTER='Yapılandırma: %s/.env · Güncellemeler: Yönetim → Güncellemeler'
      ;;
    de)
      M_TAGLINE='Moderne Community-Software — Docker-Installation'
      M_ROOT='Führe dieses Skript als root aus (sudo bash).'
      M_YN='(J/n)'; M_Y='J'
      M_CHK_DOCKER='Docker wird geprüft'
      M_NO_DOCKER='Docker ist nicht installiert.'
      M_ASK_DOCKER='Docker mit dem offiziellen Skript installieren?'
      M_NEED_DOCKER='Docker wird benötigt: https://docs.docker.com/engine/install/'
      M_NO_COMPOSE='Docker-Compose-Plugin nicht gefunden (docker compose).'
      M_DIR='Ordner wird vorbereitet: %s'
      M_GOT_COMPOSE='docker-compose.yml heruntergeladen'
      M_ENV_KEPT='.env existiert bereits und bleibt erhalten (Neuinstallation)'
      M_ASK_DOMAIN='Deine Domain (für automatisches HTTPS; leer lassen, wenn keine):'
      M_ENV_DONE='.env erstellt (Adresse: %s)'
      M_PULL='InkForum wird heruntergeladen und gestartet'
      M_PULL_FAIL='Image konnte nicht geladen werden (ghcr.io/vokartz/inkforum). Prüfe die Internetverbindung und versuche es erneut.'
      M_RUNNING='Container laufen'
      M_WAIT='Warte auf den Start der Anwendung'
      M_READY='Bereit'
      M_SLOW='Die Anwendung hat nicht rechtzeitig geantwortet; siehe: docker compose logs inkforum'
      M_DONE='InkForum ist installiert!'
      M_WIZARD='Einrichtungsassistent'
      M_FOOTER='Konfiguration: %s/.env · Updates: Verwaltung → Updates'
      ;;
    es)
      M_TAGLINE='Software de comunidad moderno — instalación con Docker'
      M_ROOT='Ejecuta este script como root (sudo bash).'
      M_YN='(S/n)'; M_Y='S'
      M_CHK_DOCKER='Comprobando Docker'
      M_NO_DOCKER='Docker no está instalado.'
      M_ASK_DOCKER='¿Instalar Docker con el script oficial?'
      M_NEED_DOCKER='Docker es necesario: https://docs.docker.com/engine/install/'
      M_NO_COMPOSE='No se encontró el complemento Docker Compose (docker compose).'
      M_DIR='Preparando la carpeta: %s'
      M_GOT_COMPOSE='docker-compose.yml descargado'
      M_ENV_KEPT='.env ya existe; se conserva (reinstalación)'
      M_ASK_DOMAIN='Tu dominio (para HTTPS automático; déjalo vacío si no tienes):'
      M_ENV_DONE='.env creado (dirección: %s)'
      M_PULL='Descargando e iniciando InkForum'
      M_PULL_FAIL='No se pudo descargar la imagen (ghcr.io/vokartz/inkforum). Comprueba la conexión a internet e inténtalo de nuevo.'
      M_RUNNING='Los contenedores están en marcha'
      M_WAIT='Esperando a que arranque la aplicación'
      M_READY='Listo'
      M_SLOW='La aplicación no respondió a tiempo; revisa: docker compose logs inkforum'
      M_DONE='¡InkForum está instalado!'
      M_WIZARD='Asistente de instalación'
      M_FOOTER='Configuración: %s/.env · Actualizaciones: Administración → Actualizaciones'
      ;;
    fr)
      M_TAGLINE='Logiciel communautaire moderne — installation Docker'
      M_ROOT='Exécutez ce script en tant que root (sudo bash).'
      M_YN='(O/n)'; M_Y='O'
      M_CHK_DOCKER='Vérification de Docker'
      M_NO_DOCKER="Docker n'est pas installé."
      M_ASK_DOCKER='Installer Docker avec le script officiel ?'
      M_NEED_DOCKER='Docker est requis : https://docs.docker.com/engine/install/'
      M_NO_COMPOSE='Extension Docker Compose introuvable (docker compose).'
      M_DIR='Préparation du dossier : %s'
      M_GOT_COMPOSE='docker-compose.yml téléchargé'
      M_ENV_KEPT='.env existe déjà ; il est conservé (réinstallation)'
      M_ASK_DOMAIN="Votre nom de domaine (pour le HTTPS automatique ; laissez vide sinon) :"
      M_ENV_DONE='.env créé (adresse : %s)'
      M_PULL='Téléchargement et démarrage d’InkForum'
      M_PULL_FAIL="Impossible de télécharger l'image (ghcr.io/vokartz/inkforum). Vérifiez la connexion internet et réessayez."
      M_RUNNING='Les conteneurs sont en cours d’exécution'
      M_WAIT='Attente du démarrage de l’application'
      M_READY='Prêt'
      M_SLOW="L'application n'a pas répondu à temps ; consultez : docker compose logs inkforum"
      M_DONE='InkForum est installé !'
      M_WIZARD="Assistant d'installation"
      M_FOOTER='Configuration : %s/.env · Mises à jour : Administration → Mises à jour'
      ;;
    pt)
      M_TAGLINE='Software de comunidade moderno — instalação com Docker'
      M_ROOT='Execute este script como root (sudo bash).'
      M_YN='(S/n)'; M_Y='S'
      M_CHK_DOCKER='Verificando o Docker'
      M_NO_DOCKER='O Docker não está instalado.'
      M_ASK_DOCKER='Instalar o Docker com o script oficial?'
      M_NEED_DOCKER='O Docker é necessário: https://docs.docker.com/engine/install/'
      M_NO_COMPOSE='Plugin Docker Compose não encontrado (docker compose).'
      M_DIR='Preparando a pasta: %s'
      M_GOT_COMPOSE='docker-compose.yml baixado'
      M_ENV_KEPT='.env já existe; será mantido (reinstalação)'
      M_ASK_DOMAIN='Seu domínio (para HTTPS automático; deixe vazio se não tiver):'
      M_ENV_DONE='.env criado (endereço: %s)'
      M_PULL='Baixando e iniciando o InkForum'
      M_PULL_FAIL='Não foi possível baixar a imagem (ghcr.io/vokartz/inkforum). Verifique a conexão com a internet e tente novamente.'
      M_RUNNING='Os contêineres estão em execução'
      M_WAIT='Aguardando a aplicação iniciar'
      M_READY='Pronto'
      M_SLOW='A aplicação não respondeu a tempo; verifique: docker compose logs inkforum'
      M_DONE='O InkForum foi instalado!'
      M_WIZARD='Assistente de instalação'
      M_FOOTER='Configuração: %s/.env · Atualizações: Administração → Atualizações'
      ;;
    ru)
      M_TAGLINE='Современный движок сообщества — установка через Docker'
      M_ROOT='Запустите этот скрипт от имени root (sudo bash).'
      M_YN='(Д/н)'; M_Y='Д'
      M_CHK_DOCKER='Проверка Docker'
      M_NO_DOCKER='Docker не установлен.'
      M_ASK_DOCKER='Установить Docker официальным скриптом?'
      M_NEED_DOCKER='Требуется Docker: https://docs.docker.com/engine/install/'
      M_NO_COMPOSE='Плагин Docker Compose не найден (docker compose).'
      M_DIR='Подготовка папки: %s'
      M_GOT_COMPOSE='docker-compose.yml загружен'
      M_ENV_KEPT='.env уже существует и будет сохранён (переустановка)'
      M_ASK_DOMAIN='Ваш домен (для автоматического HTTPS; оставьте пустым, если его нет):'
      M_ENV_DONE='.env создан (адрес: %s)'
      M_PULL='Загрузка и запуск InkForum'
      M_PULL_FAIL='Не удалось загрузить образ (ghcr.io/vokartz/inkforum). Проверьте подключение к интернету и повторите попытку.'
      M_RUNNING='Контейнеры запущены'
      M_WAIT='Ожидание запуска приложения'
      M_READY='Готово'
      M_SLOW='Приложение не ответило вовремя; смотрите: docker compose logs inkforum'
      M_DONE='InkForum установлен!'
      M_WIZARD='Мастер установки'
      M_FOOTER='Настройки: %s/.env · Обновления: Управление → Обновления'
      ;;
    zh)
      M_TAGLINE='现代社区软件 — Docker 安装'
      M_ROOT='请以 root 身份运行此脚本（sudo bash）。'
      M_YN='(Y/n)'; M_Y='Y'
      M_CHK_DOCKER='正在检查 Docker'
      M_NO_DOCKER='未安装 Docker。'
      M_ASK_DOCKER='使用官方脚本安装 Docker？'
      M_NEED_DOCKER='需要 Docker：https://docs.docker.com/engine/install/'
      M_NO_COMPOSE='未找到 Docker Compose 插件（docker compose）。'
      M_DIR='正在准备目录：%s'
      M_GOT_COMPOSE='已下载 docker-compose.yml'
      M_ENV_KEPT='.env 已存在，将保留（重新安装）'
      M_ASK_DOMAIN='你的域名（用于自动 HTTPS；没有则留空）：'
      M_ENV_DONE='已创建 .env（地址：%s）'
      M_PULL='正在下载并启动 InkForum'
      M_PULL_FAIL='无法下载镜像（ghcr.io/vokartz/inkforum）。请检查网络连接后重试。'
      M_RUNNING='容器正在运行'
      M_WAIT='正在等待应用启动'
      M_READY='就绪'
      M_SLOW='应用未及时响应；请查看：docker compose logs inkforum'
      M_DONE='InkForum 安装完成！'
      M_WIZARD='安装向导'
      M_FOOTER='配置：%s/.env · 更新：管理 → 更新'
      ;;
    *)
      M_TAGLINE='Modern community software — Docker installation'
      M_ROOT='Run this script as root (sudo bash).'
      M_YN='(Y/n)'; M_Y='Y'
      M_CHK_DOCKER='Checking Docker'
      M_NO_DOCKER='Docker is not installed.'
      M_ASK_DOCKER='Install Docker with the official script?'
      M_NEED_DOCKER='Docker is required: https://docs.docker.com/engine/install/'
      M_NO_COMPOSE='Docker Compose plugin not found (docker compose).'
      M_DIR='Preparing folder: %s'
      M_GOT_COMPOSE='docker-compose.yml downloaded'
      M_ENV_KEPT='.env already exists; keeping it (reinstall)'
      M_ASK_DOMAIN='Your domain (for automatic HTTPS; leave empty if you have none):'
      M_ENV_DONE='.env created (address: %s)'
      M_PULL='Downloading and starting InkForum'
      M_PULL_FAIL='Could not download the image (ghcr.io/vokartz/inkforum). Check the internet connection and try again.'
      M_RUNNING='Containers are running'
      M_WAIT='Waiting for the application to start'
      M_READY='Ready'
      M_SLOW='The application did not respond in time; check: docker compose logs inkforum'
      M_DONE='InkForum is installed!'
      M_WIZARD='Setup wizard'
      M_FOOTER='Configuration: %s/.env · Updates: Admin → Updates'
      ;;
  esac
}

LC="$(detect_lang)"

cat <<'BANNER'

   ___       _    _____
  |_ _|_ __ | | _|  ___|__  _ __ _   _ _ __ ___
   | || '_ \| |/ / |_ / _ \| '__| | | | '_ ` _ \
   | || | | |   <|  _| (_) | |  | |_| | | | | | |
  |___|_| |_|_|\_\_|  \___/|_|   \__,_|_| |_| |_|

BANNER

# Language menu: only when interactive and not set explicitly; Enter keeps the detected language
if interactive && [[ -z "${INKFORUM_LANG:-}" ]]; then
  def=1
  printf '  %sLanguage / Dil%s\n' "$bold" "$reset"
  for i in "${!LANGS[@]}"; do
    [[ "${LANGS[$i]}" == "$LC" ]] && def=$((i + 1))
    printf '   %d) %-11s' "$((i + 1))" "${LANG_NAMES[$i]}"
    (( (i + 1) % 4 == 0 )) && printf '\n'
  done
  choice="$(ask '›' "$def")"
  [[ "$choice" =~ ^[1-8]$ ]] && LC="${LANGS[$((choice - 1))]}"
fi
load_lang "$LC"
printf '  %s%s%s\n' "$dim" "$M_TAGLINE" "$reset"

[[ "$(id -u)" -eq 0 ]] || die "$M_ROOT"

step "$M_CHK_DOCKER"
if ! command -v docker >/dev/null 2>&1; then
  warn "$M_NO_DOCKER"
  if confirm "$M_ASK_DOCKER"; then
    curl -fsSL https://get.docker.com | sh
  else
    die "$M_NEED_DOCKER"
  fi
fi
docker compose version >/dev/null 2>&1 || die "$M_NO_COMPOSE"
ok "$(docker --version)"

# shellcheck disable=SC2059
step "$(printf "$M_DIR" "$DIR")"
mkdir -p "$DIR"
cd "$DIR"
curl -fsSL "$REPO_RAW/docker-compose.yml" -o docker-compose.yml
ok "$M_GOT_COMPOSE"

if [[ -f .env ]]; then
  ok "$M_ENV_KEPT"
else
  curl -fsSL "$REPO_RAW/.env.example" -o .env
  if [[ -z "$DOMAIN" ]]; then
    DOMAIN="$(ask "$M_ASK_DOMAIN" '')"
  fi
  if [[ -n "$DOMAIN" ]]; then
    APP_URL="https://$DOMAIN"
    sed -i "s|^COMPOSE_PROFILES=.*|COMPOSE_PROFILES=https|; s|^DOMAIN=.*|DOMAIN=$DOMAIN|; s|^INKFORUM_BIND=.*|INKFORUM_BIND=127.0.0.1|" .env
  else
    IP="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
    APP_URL="http://${IP:-localhost}:$PORT"
  fi
  sed -i "s|^APP_URL=.*|APP_URL=$APP_URL|; s|^APP_SECRET=.*|APP_SECRET=$(rand 48)|; s|^UPDATER_TOKEN=.*|UPDATER_TOKEN=$(rand 40)|; s|^INKFORUM_PORT=.*|INKFORUM_PORT=$PORT|" .env
  if grep -q '^DEFAULT_LOCALE=' .env; then
    sed -i "s|^DEFAULT_LOCALE=.*|DEFAULT_LOCALE=$LC|" .env
  else
    printf 'DEFAULT_LOCALE=%s\n' "$LC" >> .env
  fi
  if [[ "$DB" == "postgres" ]]; then
    PG="$(rand 32)"
    profiles="$(grep '^COMPOSE_PROFILES=' .env | cut -d= -f2)"
    sed -i "s|^COMPOSE_PROFILES=.*|COMPOSE_PROFILES=${profiles:+$profiles,}postgres|; s|^DB_DRIVER=.*|DB_DRIVER=postgres|" .env
    printf 'POSTGRES_PASSWORD=%s\nDATABASE_URL=postgres://inkforum:%s@postgres:5432/inkforum\n' "$PG" "$PG" >> .env
  fi
  chmod 600 .env
  # shellcheck disable=SC2059
  ok "$(printf "$M_ENV_DONE" "$APP_URL")"
fi

step "$M_PULL"
docker compose pull --quiet || die "$M_PULL_FAIL"
docker compose up -d --remove-orphans
ok "$M_RUNNING"

step "$M_WAIT"
up=0
for _ in $(seq 1 90); do
  if docker compose exec -T inkforum node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
    ok "$M_READY"
    up=1
    break
  fi
  sleep 2
done
[[ "$up" == "1" ]] || warn "$M_SLOW"

APP_URL="$(grep '^APP_URL=' .env | cut -d= -f2-)"

printf '\n%s══════════════════════════════════════════════════════════%s\n' "$green" "$reset"
printf '  %s%s%s\n\n' "$bold" "$M_DONE" "$reset"
printf '  %s: %s%s/install%s\n' "$M_WIZARD" "$bold" "$APP_URL" "$reset"
# shellcheck disable=SC2059
printf "\n  %s$M_FOOTER%s\n" "$dim" "$DIR" "$reset"
printf '%s══════════════════════════════════════════════════════════%s\n\n' "$green" "$reset"
