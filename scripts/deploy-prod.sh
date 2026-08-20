#!/usr/bin/env bash
#
# deploy-prod.sh — despliega signaling/ en el servidor de producción vía SSH
# por Tailscale y verifica la salud del servicio tras desplegar.
#
# Mismo patrón que scripts/deploy-prod.sh de moto-routes (ver su ADR-033):
#   ssh <usuario>@<host>  →  git pull --ff-only origin master
#                          →  docker compose -f docker-compose.prod.yml up -d --build
#                          →  curl -sf <URL-pública>/ping
#
# Este repo comparte servidor con moto-routes pero no su despliegue: el
# stack de este servicio (docker-compose.prod.yml) es independiente del de
# apps/api, así que desplegar uno nunca reconstruye ni reinicia el otro.
#
# Datos de conexión (host/usuario/URL pública) — NUNCA versionados, el repo
# es público. Se resuelven en este orden:
#   1) Variables de entorno: SERVER_HOST, SERVER_USER, PUBLIC_SIGNALING_URL
#   2) Fichero no versionado scripts/.env.deploy.local
# Si no hay ni variable ni fichero, el script falla con mensaje claro.
#
# Uso:
#   # Día a día (crear una vez scripts/.env.deploy.local con chmod 600):
#   ./scripts/deploy-prod.sh
#
#   # Uso puntual sin fichero:
#   SERVER_HOST=debian SERVER_USER=<usuario> \
#   PUBLIC_SIGNALING_URL=https://<host>.ts.net/intercom/ping \
#   ./scripts/deploy-prod.sh
#
# Termina con código ≠ 0 si cualquier paso falla o la verificación de salud
# no responde 200.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env.deploy.local"

# --- Resolución de configuración: env > .env.deploy.local > error -------------
SERVER_HOST="${SERVER_HOST:-}"
SERVER_USER="${SERVER_USER:-}"
PUBLIC_SIGNALING_URL="${PUBLIC_SIGNALING_URL:-}"

if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1091
  source "$ENV_FILE"
fi

SERVER_HOST="${SERVER_HOST:-}"
SERVER_USER="${SERVER_USER:-}"
PUBLIC_SIGNALING_URL="${PUBLIC_SIGNALING_URL:-}"

if [[ -z "$SERVER_HOST" || -z "$SERVER_USER" || -z "$PUBLIC_SIGNALING_URL" ]]; then
  echo "ERROR: faltan datos de conexión al servidor de producción." >&2
  echo "Defínelos como variables de entorno (SERVER_HOST, SERVER_USER, PUBLIC_SIGNALING_URL)" >&2
  echo "o créalos en $ENV_FILE (no versionado, chmod 600)." >&2
  echo "Ejemplo: SERVER_HOST=debian SERVER_USER=<usuario> PUBLIC_SIGNALING_URL=<url-ping> $0" >&2
  exit 1
fi

SSH_TARGET="${SERVER_USER}@${SERVER_HOST}"
# ~/intercom-app se expande en el shell REMOTO.
REMOTE_DIR="~/intercom-app"
COMPOSE_FILE="infra/docker/docker-compose.prod.yml"

echo "==> Desplegando en $SSH_TARGET (directorio $REMOTE_DIR)"

# --- 1) Pull en el servidor ---------------------------------------------------
echo "==> [1/3] git pull --ff-only origin master en el servidor"
ssh -o BatchMode=yes "$SSH_TARGET" "cd $REMOTE_DIR && git pull --ff-only origin master"

# --- 2) Rebuild + up en el servidor -------------------------------------------
echo "==> [2/3] docker compose -f $COMPOSE_FILE up -d --build"
ssh -o BatchMode=yes "$SSH_TARGET" "cd $REMOTE_DIR && docker compose -f '$COMPOSE_FILE' up -d --build"

# --- 3) Verificación de salud --------------------------------------------------
echo "==> [3/3] Verificando salud: $PUBLIC_SIGNALING_URL"
if curl -fsS -o /dev/null --max-time 15 "$PUBLIC_SIGNALING_URL"; then
  echo "OK: el servicio responde 200 tras el despliegue."
else
  echo "ERROR: la verificación de salud no respondió 200. Revisa el contenedor en el servidor." >&2
  exit 1
fi

echo "==> Despliegue completado con éxito."
