#!/usr/bin/env bash
set -Eeuo pipefail
ROOT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
# Pass Compose arguments before --; runner arguments after --.
# ./evolve.sh --env-file .env.release -f docker-compose.release.yml -p playzo-release
# ./evolve.sh -- --check
compose_args=()
runner_args=()
while (($#)); do
  if [[ "$1" == -- ]]; then shift; runner_args=("$@"); break; fi
  compose_args+=("$1"); shift
done
cd "$ROOT_DIR"
command=(docker compose)
if ((${#compose_args[@]})); then command+=("${compose_args[@]}"); fi
command+=(run --rm --no-deps api python -m app.evolve)
if ((${#runner_args[@]})); then command+=("${runner_args[@]}"); fi
"${command[@]}"
