#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────
#  InkForum kurulum betiği
#
#    curl -fsSL https://raw.githubusercontent.com/vokartz/inkforum/main/install.sh | sudo bash
#
#  Ortam değişkenleriyle soru sormadan kurulum:
#    INKFORUM_DIR=/opt/inkforum  INKFORUM_DOMAIN=forum.ornek.com  INKFORUM_PORT=3000
#    INKFORUM_DB=sqlite|postgres  INKFORUM_YES=1
# ─────────────────────────────────────────────────────────────
set -euo pipefail

REPO_RAW="${INKFORUM_REPO_RAW:-https://raw.githubusercontent.com/vokartz/inkforum/main}"
DIR="${INKFORUM_DIR:-/opt/inkforum}"
PORT="${INKFORUM_PORT:-3000}"
DOMAIN="${INKFORUM_DOMAIN:-}"
DB="${INKFORUM_DB:-sqlite}"
YES="${INKFORUM_YES:-0}"

bold=$'\e[1m'; dim=$'\e[2m'; green=$'\e[32m'; yellow=$'\e[33m'; red=$'\e[31m'; reset=$'\e[0m'
step() { printf '\n%s▸ %s%s\n' "$bold" "$1" "$reset"; }
ok()   { printf '  %s✓%s %s\n' "$green" "$reset" "$1"; }
warn() { printf '  %s!%s %s\n' "$yellow" "$reset" "$1"; }
die()  { printf '\n%s✗ %s%s\n' "$red" "$1" "$reset" >&2; exit 1; }

# Betik boru ile çalıştırılsa da (curl | bash) soruları terminalden oku
ask() {
  local prompt="$1" default="${2:-}" answer=""
  if [[ "$YES" == "1" ]] || [[ ! -r /dev/tty ]]; then echo "$default"; return; fi
  read -r -p "  $prompt ${default:+[$default] }" answer < /dev/tty || true
  echo "${answer:-$default}"
}

rand() { (LC_ALL=C tr -dc 'A-Za-z0-9' < /dev/urandom 2>/dev/null | head -c "${1:-48}") || true; }

cat <<'BANNER'

   ___       _    _____
  |_ _|_ __ | | _|  ___|__  _ __ _   _ _ __ ___
   | || '_ \| |/ / |_ / _ \| '__| | | | '_ ` _ \
   | || | | |   <|  _| (_) | |  | |_| | | | | | |
  |___|_| |_|_|\_\_|  \___/|_|   \__,_|_| |_| |_|

BANNER
printf '  %sModern topluluk yazılımı — Docker kurulumu%s\n' "$dim" "$reset"

[[ "$(id -u)" -eq 0 ]] || die "Bu betiği root olarak çalıştırın (sudo bash)."

step "Docker denetleniyor"
if ! command -v docker >/dev/null 2>&1; then
  warn "Docker kurulu değil."
  if [[ "$(ask 'Docker resmi betiğiyle kurulsun mu? (E/h)' E)" =~ ^[EeYy] ]]; then
    curl -fsSL https://get.docker.com | sh
  else
    die "Docker gerekli: https://docs.docker.com/engine/install/"
  fi
fi
docker compose version >/dev/null 2>&1 || die "Docker Compose eklentisi bulunamadı (docker compose)."
ok "$(docker --version)"

step "Klasör hazırlanıyor: $DIR"
mkdir -p "$DIR"
cd "$DIR"
curl -fsSL "$REPO_RAW/docker-compose.yml" -o docker-compose.yml
ok "docker-compose.yml indirildi"

if [[ -f .env ]]; then
  ok ".env zaten var; korunuyor (yeniden kurulum)"
else
  curl -fsSL "$REPO_RAW/.env.example" -o .env
  if [[ -z "$DOMAIN" ]]; then
    DOMAIN="$(ask 'Alan adınız (otomatik HTTPS için; yoksa boş bırakın):' '')"
  fi
  if [[ -n "$DOMAIN" ]]; then
    APP_URL="https://$DOMAIN"
    sed -i "s|^COMPOSE_PROFILES=.*|COMPOSE_PROFILES=https|; s|^DOMAIN=.*|DOMAIN=$DOMAIN|; s|^INKFORUM_BIND=.*|INKFORUM_BIND=127.0.0.1|" .env
  else
    IP="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
    APP_URL="http://${IP:-localhost}:$PORT"
  fi
  sed -i "s|^APP_URL=.*|APP_URL=$APP_URL|; s|^APP_SECRET=.*|APP_SECRET=$(rand 48)|; s|^UPDATER_TOKEN=.*|UPDATER_TOKEN=$(rand 40)|; s|^INKFORUM_PORT=.*|INKFORUM_PORT=$PORT|" .env
  if [[ "$DB" == "postgres" ]]; then
    PG="$(rand 32)"
    profiles="$(grep '^COMPOSE_PROFILES=' .env | cut -d= -f2)"
    sed -i "s|^COMPOSE_PROFILES=.*|COMPOSE_PROFILES=${profiles:+$profiles,}postgres|; s|^DB_DRIVER=.*|DB_DRIVER=postgres|" .env
    printf 'POSTGRES_PASSWORD=%s\nDATABASE_URL=postgres://inkforum:%s@postgres:5432/inkforum\n' "$PG" "$PG" >> .env
  fi
  chmod 600 .env
  ok ".env oluşturuldu (adres: $APP_URL)"
fi

step "InkForum indiriliyor ve başlatılıyor"
docker compose pull --quiet
docker compose up -d --remove-orphans
ok "Kapsayıcılar çalışıyor"

step "Uygulamanın açılması bekleniyor"
for _ in $(seq 1 90); do
  if docker compose exec -T inkforum node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))" >/dev/null 2>&1; then
    ok "Hazır"
    break
  fi
  sleep 2
done

APP_URL="$(grep '^APP_URL=' .env | cut -d= -f2-)"
CODE="$(docker compose logs inkforum 2>/dev/null | grep -o 'Kurulum kodu: [A-Z0-9-]*' | tail -1 | cut -d' ' -f3 || true)"

printf '\n%s══════════════════════════════════════════════════════════%s\n' "$green" "$reset"
printf '  %sInkForum kuruldu!%s\n\n' "$bold" "$reset"
printf '  Kurulum sihirbazı : %s%s/install%s\n' "$bold" "$APP_URL" "$reset"
if [[ -n "$CODE" ]]; then
  printf '  Kurulum kodu      : %s%s%s\n' "$bold" "$CODE" "$reset"
else
  printf '  Kurulum kodu      : docker compose -f %s/docker-compose.yml logs inkforum | grep "Kurulum kodu"\n' "$DIR"
fi
printf '\n  %sYapılandırma: %s/.env · Güncellemeler: Yönetim → Güncellemeler%s\n' "$dim" "$DIR" "$reset"
printf '%s══════════════════════════════════════════════════════════%s\n\n' "$green" "$reset"
