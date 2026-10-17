#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$ROOT_DIR/.env.release"
PROJECT_NAME="playzo-release"
CHECK_ONLY=false

usage() {
  cat <<'HELP'
Usage: ./deploy.sh [--env-file PATH] [--project-name NAME] [--check]

Build and start a Playzo release on the current Docker host.
  --env-file PATH      Release configuration (default: .env.release)
  --project-name NAME  Compose project/volume namespace (default: playzo-release)
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
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 2 ;;
  esac
done

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

docker info >/dev/null
trap 'echo "Release failed. Inspect containers with: docker compose --project-name $PROJECT_NAME --env-file \"$ENV_FILE\" -f \"$ROOT_DIR/docker-compose.release.yml\" logs --tail=100" >&2' ERR

echo 'Building release images. Running containers stay up during the build.'
"${compose[@]}" build --pull
echo 'Starting release and waiting for healthy services...'
"${compose[@]}" up -d --wait --wait-timeout 180 --remove-orphans
"${compose[@]}" ps
echo 'Release is running. Configure your HTTPS reverse proxy for the frontend and API ports.'
