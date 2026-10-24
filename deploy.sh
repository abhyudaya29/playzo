#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$ROOT_DIR/.env.release"
PROJECT_NAME="playzo-release"
CHECK_ONLY=false
EVOLUTION_CHOICE=""
SKIP_PULL=false
SWAP_STARTED=false

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
  local extra=""

  trap - ERR

  echo "Release failed near line $line_number (exit code $exit_code)." >&2

  if [[ "$SWAP_STARTED" == true ]]; then
    extra=$'\n'":warning: The container swap had already started. Old containers may be stopped and the new ones did not become healthy."
  fi

  slack_notify ":x: Playzo release FAILED. Project: ${PROJECT_NAME}. Line: ${line_number}. Exit code: ${exit_code}. Check deployment logs on the Docker host.${extra}"

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
# Container snapshot helpers
# --------------------------------------------------

# Prints one "service:container_id" line per running container.
snapshot_containers() {
  local service cid

  while IFS= read -r service; do
    [[ -n "$service" ]] || continue
    while IFS= read -r cid; do
      [[ -n "$cid" ]] || continue
      printf '%s:%s\n' "$service" "${cid:0:12}"
    done < <("${compose[@]}" ps -q "$service" 2>/dev/null || true)
  done < <("${compose[@]}" config --services)
}

# Formats snapshot lines as a Slack-friendly bullet list.
format_snapshot() {
  local snapshot="$1"
  local line

  if [[ -z "$snapshot" ]]; then
    printf '• (none)\n'
    return 0
  fi

  while IFS= read -r line; do
    [[ -n "$line" ]] || continue
    printf '• %s (%s)\n' "${line%%:*}" "${line##*:}"
  done <<<"$snapshot"
}

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

# Record what is running before this release touches anything.
old_snapshot="$(snapshot_containers)"

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

# Snapshot right before the swap: these are the containers about to be replaced.
pre_swap_snapshot="$(snapshot_containers)"

slack_notify ":octagonal_sign: Playzo release: stopping OLD containers and starting NEW ones. Project: ${PROJECT_NAME}.
Currently running (will be replaced if their image/config changed):
$(format_snapshot "$pre_swap_snapshot")"

SWAP_STARTED=true

echo 'Starting release and waiting for healthy services...'
# Compose stops and removes the old container of each changed service,
# then starts a new one in its place.
"${compose[@]}" up -d --wait --wait-timeout 180 --remove-orphans

# Compare the newly built image's routes with the actual running service.
echo 'Checking running API routes against this release...'
"${compose[@]}" run --rm --no-deps api python -m app.check_routes --url http://api:8000

SWAP_STARTED=false

"${compose[@]}" ps

new_snapshot="$(snapshot_containers)"

# Work out which containers were actually replaced.
replaced_old=""
replaced_new=""
unchanged=""

while IFS= read -r line; do
  [[ -n "$line" ]] || continue
  if grep -Fxq -- "$line" <<<"$old_snapshot"; then
    unchanged+="${line}"$'\n'
  else
    replaced_new+="${line}"$'\n'
  fi
done <<<"$new_snapshot"

while IFS= read -r line; do
  [[ -n "$line" ]] || continue
  if ! grep -Fxq -- "$line" <<<"$new_snapshot"; then
    replaced_old+="${line}"$'\n'
  fi
done <<<"$old_snapshot"

status_table="$("${compose[@]}" ps --format 'table {{.Service}}\t{{.Status}}' 2>/dev/null || true)"

success_msg=":white_check_mark: Playzo release deployed SUCCESSFULLY. Project: ${PROJECT_NAME}. All services are healthy.
:wastebasket: OLD containers stopped and removed:
$(format_snapshot "${replaced_old%$'\n'}")
:rocket: NEW containers up:
$(format_snapshot "${replaced_new%$'\n'}")
:left_right_arrow: Unchanged (kept running):
$(format_snapshot "${unchanged%$'\n'}")"

if [[ -n "$status_table" ]]; then
  success_msg+=$'\n''```'$'\n'"${status_table}"$'\n''```'
fi

slack_notify "$success_msg"

echo 'Release is running. Configure your HTTPS reverse proxy for the frontend and API ports.'