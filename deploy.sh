#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$ROOT_DIR/.env.release"
PROJECT_NAME="playzo-release"
CHECK_ONLY=false
EVOLUTION_CHOICE=""
SKIP_PULL=false

usage() {
  cat <<'HELP'
Usage: ./deploy.sh [--env-file PATH] [--project-name NAME] [--check] [--apply-evolutions|--skip-evolutions] [--skip-pull]

Build and start a Playzo release on the current Docker host.
  --env-file PATH      Release configuration (default: .env.release)
  --project-name NAME  Compose project/volume namespace (default: playzo-release)
  --apply-evolutions   Apply pending SQL evolutions without prompting
  --skip-evolutions    Skip applying SQL; fail if evolutions are pending
  --skip-pull          Deploy this checkout without pulling
  --check              Validate configuration without building or starting services
HELP
}

while (($#)); do
  case "$1" in
    --env-file|--project-name)
      if (($# < 2)) || [[ -z "$2" || "$2" == --* ]]; then
        echo "Missing value for $1" >&2
        exit 2
      fi
      if [[ "$1" == --env-file ]]; then ENV_FILE="$2"; else PROJECT_NAME="$2"; fi
      shift 2
      ;;
    --check) CHECK_ONLY=true; shift ;;
    --apply-evolutions|--skip-evolutions)
      [[ -z "$EVOLUTION_CHOICE" ]] || { echo 'Choose only one evolution option.' >&2; exit 2; }
      if [[ "$1" == --apply-evolutions ]]; then EVOLUTION_CHOICE=y; else EVOLUTION_CHOICE=n; fi
      shift ;;
    --skip-pull) SKIP_PULL=true; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

cd "$ROOT_DIR"
if ! "$CHECK_ONLY" && ! "$SKIP_PULL"; then
  command -v git >/dev/null || { echo 'Git is required.' >&2; exit 1; }
  [[ -z "$(git status --porcelain)" ]] || { echo 'Commit or stash local changes before deploying.' >&2; exit 1; }
  git pull --ff-only
  # Re-enter the pulled script so changes to deployment logic take effect too.
  deploy_args=(--skip-pull --env-file "$ENV_FILE" --project-name "$PROJECT_NAME")
  if [[ "$EVOLUTION_CHOICE" == y ]]; then deploy_args+=(--apply-evolutions); fi
  if [[ "$EVOLUTION_CHOICE" == n ]]; then deploy_args+=(--skip-evolutions); fi
  exec "$ROOT_DIR/deploy.sh" "${deploy_args[@]}"
fi

command -v docker >/dev/null || { echo 'Docker is required.' >&2; exit 1; }
docker compose version >/dev/null
[[ -f "$ENV_FILE" ]] || {
  echo "Release environment file not found: $ENV_FILE" >&2
  echo 'Copy .env.release.example to .env.release and configure it first.' >&2
  exit 1
}

compose=(docker compose --project-name "$PROJECT_NAME" --env-file "$ENV_FILE" -f "$ROOT_DIR/docker-compose.release.yml")
"${compose[@]}" config --quiet
echo 'Release configuration is valid.'
if "$CHECK_ONLY"; then exit 0; fi

if [[ -z "$EVOLUTION_CHOICE" ]]; then
  if [[ ! -t 0 ]]; then
    echo 'Non-interactive deployment requires --apply-evolutions or --skip-evolutions.' >&2
    exit 2
  fi
  while [[ "$EVOLUTION_CHOICE" != y && "$EVOLUTION_CHOICE" != n ]]; do
    read -r -p 'Apply pending SQL evolutions? [y/n] ' EVOLUTION_CHOICE
    EVOLUTION_CHOICE="$(printf '%s' "$EVOLUTION_CHOICE" | tr '[:upper:]' '[:lower:]')"
  done
fi

docker info >/dev/null
trap 'echo "Release failed. Inspect containers with: docker compose --project-name $PROJECT_NAME --env-file \"$ENV_FILE\" -f \"$ROOT_DIR/docker-compose.release.yml\" logs --tail=100" >&2' ERR

echo 'Building release images. Running containers stay up during the build.'
"${compose[@]}" build --pull
echo 'Starting database and cache...'
"${compose[@]}" up -d --wait --wait-timeout 180 db valkey

if [[ "$EVOLUTION_CHOICE" == y ]]; then
  "$ROOT_DIR/evolve.sh" --project-name "$PROJECT_NAME" --env-file "$ENV_FILE" -f "$ROOT_DIR/docker-compose.release.yml"
else
  "$ROOT_DIR/evolve.sh" --project-name "$PROJECT_NAME" --env-file "$ENV_FILE" -f "$ROOT_DIR/docker-compose.release.yml" -- --check
fi
echo 'Starting release and waiting for healthy services...'
"${compose[@]}" up -d --wait --wait-timeout 180 --remove-orphans
"${compose[@]}" ps
echo 'Release is running. Configure your HTTPS reverse proxy for the frontend and API ports.'
