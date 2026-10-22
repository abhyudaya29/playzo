
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

Build and start a playhud release on the current Docker host.
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
      if [[ "$1" == "--env-file" ]]; then
        ENV_FILE="$2"
      else
        PROJECT_NAME="$2"
      fi
      shift 2
      ;;
    --check)
      CHECK_ONLY=true
      shift
      ;;
    --apply-evolutions|--skip-evolutions)
      [[ -z "$EVOLUTION_CHOICE" ]] || {
        echo 'Choose only one evolution option.' >&2
        exit 2
      }
      if [[ "$1" == "--apply-evolutions" ]]; then
        EVOLUTION_CHOICE=y
      else
        EVOLUTION_CHOICE=n
      fi
      shift
      ;;
    --skip-pull)
      SKIP_PULL=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

cd "$ROOT_DIR"

# --------------------------------------------------
# Slack notifications
# --------------------------------------------------

SLACK_WEBHOOK_URL="${SLACK_WEBHOOK_URL:-}"

# Read webhook from .env.release without sourcing the
# entire file as shell code.
if [[ -z "$SLACK_WEBHOOK_URL" && -f "$ENV_FILE" ]]; then
  SLACK_WEBHOOK_URL="$(
    awk '
      /^[[:space:]]*#/ { next }
      /^[[:space:]]*SLACK_WEBHOOK_URL[[:space:]]*=/ {
        sub(/^[^=]*=/, "")
        sub(/\r$/, "")
        gsub(/^[[:space:]]+|[[:space:]]+$/, "")
        if (substr($0, 1, 1) == "\"" && substr($0, length($0), 1) == "\"") {
          $0 = substr($0, 2, length($0) - 2)
        } else if (substr($0, 1, 1) == "\047" && substr($0, length($0), 1) == "\047") {
          $0 = substr($0, 2, length($0) - 2)
        }
        print
        exit
      }
    ' "$ENV_FILE"
  )"
fi

slack_notify() {
  local message="$1"
  local payload

  if [[ -z "$SLACK_WEBHOOK_URL" ]]; then
    echo "Slack webhook not configured; skipping notification."
    return 0
  fi

  if ! command -v curl >/dev/null 2>&1; then
    echo "Warning: curl unavailable; skipping Slack notification." >&2
    return 0
  fi

  # Python safely escapes message content as JSON.
  if ! command -v python3 >/dev/null 2>&1; then
    echo "Warning: python3 unavailable; skipping Slack notification." >&2
    return 0
  fi

  if ! payload="$(python3 -c '
import json, sys
print(json.dumps({"text": sys.argv[1]}))
' "$message")"; then
    echo "Warning: could not encode Slack notification." >&2
    return 0
  fi

  if ! curl --silent --show-error --fail \
      --connect-timeout 5 --max-time 10 \
      -X POST \
      -H 'Content-Type: application/json' \
      --data-binary "$payload" \
      "$SLACK_WEBHOOK_URL" >/dev/null; then
    echo "Warning: Slack notification failed; continuing." >&2
  fi

  return 0
}

# Notify once if a deployment command fails.
on_deploy_error() {
  local exit_code=$?
  local line_number="${1:-unknown}"

  trap - ERR

  echo "Release failed near line $line_number (exit code $exit_code)." >&2

  slack_notify ":x: Playzo release FAILED. Project: ${PROJECT_NAME}. Line: ${line_number}. Exit code: ${exit_code}. Check deployment logs on the Docker host."

  echo "Inspect containers with: docker compose --project-name $PROJECT_NAME --env-file \"$ENV_FILE\" -f \"$ROOT_DIR/docker-compose.release.yml\" logs --tail=100" >&2

  exit "$exit_code"
}

# --------------------------------------------------
# Detect new development and pull latest code
# --------------------------------------------------

if ! "$CHECK_ONLY" && ! "$SKIP_PULL"; then
  command -v git >/dev/null || {
    echo 'Git is required.' >&2
    exit 1
  }

  [[ -z "$(git status --porcelain)" ]] || {
    echo 'Commit or stash local changes before deploying.' >&2
    exit 1
  }

  trap 'on_deploy_error "$LINENO"' ERR

  git fetch --quiet

  upstream="$(git rev-parse --abbrev-ref '@{upstream}')"
  current="$(git rev-parse HEAD)"
  remote="$(git rev-parse "$upstream")"

  if [[ "$current" != "$remote" ]]; then
    if ! git merge-base --is-ancestor HEAD "$upstream"; then
      slack_notify ":warning: Playzo release blocked. Remote changes detected, but the local branch cannot fast-forward."
      echo 'Cannot deploy: local branch cannot fast-forward to upstream.' >&2
      exit 1
    fi

    commit_count="$(git rev-list --count "HEAD..$upstream")"
    branch_name="$(git branch --show-current)"

    slack_notify ":rocket: New development available for Playzo release. Branch: ${branch_name}. New commits: ${commit_count}. Deployment is starting."

    git pull --ff-only
  else
    echo 'No new remote commits.'
  fi

  # Re-run the updated script after pulling. The new invocation
  # handles deployment and its success/failure notification.
  deploy_args=(--skip-pull --env-file "$ENV_FILE" --project-name "$PROJECT_NAME")

  if [[ "$EVOLUTION_CHOICE" == y ]]; then
    deploy_args+=(--apply-evolutions)
  fi

  if [[ "$EVOLUTION_CHOICE" == n ]]; then
    deploy_args+=(--skip-evolutions)
  fi

  exec "$ROOT_DIR/deploy.sh" "${deploy_args[@]}"
fi

# --------------------------------------------------
# Validate Docker and release configuration
# --------------------------------------------------

command -v docker >/dev/null || {
  echo 'Docker is required.' >&2
  exit 1
}

docker compose version >/dev/null

[[ -f "$ENV_FILE" ]] || {
  echo "Release environment file not found: $ENV_FILE" >&2
  echo 'Copy .env.release.example to .env.release and configure it first.' >&2
  exit 1
}

compose=(
  docker compose
  --project-name "$PROJECT_NAME"
  --env-file "$ENV_FILE"
  -f "$ROOT_DIR/docker-compose.release.yml"
)

"${compose[@]}" config --quiet
echo 'Release configuration is valid.'

if "$CHECK_ONLY"; then
  exit 0
fi

# --------------------------------------------------
# SQL evolution decision
# --------------------------------------------------

if [[ -z "$EVOLUTION_CHOICE" ]]; then
  if [[ ! -t 0 ]]; then
    echo 'Non-interactive deployment requires --apply-evolutions or --skip-evolutions.' >&2
    exit 2
  fi

  while [[ "$EVOLUTION_CHOICE" != y && "$EVOLUTION_CHOICE" != n ]]; do
    read -r -p 'Apply pending SQL evolutions? [y/n] ' EVOLUTION_CHOICE
    EVOLUTION_CHOICE="$(
      printf '%s' "$EVOLUTION_CHOICE" | tr '[:upper:]' '[:lower:]'
    )"
  done
fi

docker info >/dev/null

trap 'on_deploy_error "$LINENO"' ERR

# --------------------------------------------------
# Build and deploy
# --------------------------------------------------

echo 'Building release images. Running containers stay up during the build.'
"${compose[@]}" build --pull

echo 'Starting database and cache...'
"${compose[@]}" up -d --wait --wait-timeout 180 db valkey

if [[ "$EVOLUTION_CHOICE" == y ]]; then
  "$ROOT_DIR/evolve.sh" \
    --project-name "$PROJECT_NAME" \
    --env-file "$ENV_FILE" \
    -f "$ROOT_DIR/docker-compose.release.yml"
else
  "$ROOT_DIR/evolve.sh" \
    --project-name "$PROJECT_NAME" \
    --env-file "$ENV_FILE" \
    -f "$ROOT_DIR/docker-compose.release.yml" \
    -- --check
fi

echo 'Starting release and waiting for healthy services...'
"${compose[@]}" up -d --wait --wait-timeout 180 --remove-orphans

"${compose[@]}" ps

slack_notify ":white_check_mark: Playzo release deployed SUCCESSFULLY. Project: ${PROJECT_NAME}. Services are healthy."

echo 'Release is running. Configure your HTTPS reverse proxy for the frontend and API ports.'
