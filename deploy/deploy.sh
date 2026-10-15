#!/usr/bin/env bash
set -euo pipefail

cd /srv/wedding-tasks
deploy_tag="${1:?Pass the commit SHA}"
[[ "$deploy_tag" =~ ^[a-f0-9]{40}$ ]] || { echo 'Invalid image tag'; exit 1; }
[[ -s .env.local ]] || { echo 'Configure /srv/wedding-tasks/.env.local first'; exit 1; }
docker image inspect "wedding-tasks:$deploy_tag" >/dev/null

previous_tag=''
if [[ -f .deployed-image ]]; then
  previous_tag="$(< .deployed-image)"
  [[ "$previous_tag" =~ ^[a-f0-9]{40}$ ]] || { echo 'Invalid previous image tag'; exit 1; }
fi

export DEPLOY_IMAGE_TAG="$deploy_tag"
compose=(docker compose -f compose.yaml -f compose.deploy.yaml)
"${compose[@]}" config --quiet

rollback() {
  if [[ -n "$previous_tag" && "$previous_tag" != "$deploy_tag" ]]; then
    echo "Restoring previous image: $previous_tag"
    DEPLOY_IMAGE_TAG="$previous_tag" "${compose[@]}" up -d --no-build app
  else
    echo 'No previous deployment is available for rollback'
  fi
}

if ! "${compose[@]}" up -d --no-build app; then
  rollback
  exit 1
fi

for attempt in $(seq 1 30); do
  if curl --fail --silent --output /dev/null --max-time 5 http://127.0.0.1:3100; then
    printf '%s\n' "$deploy_tag" > .deployed-image
    echo "Deployment ready: $deploy_tag"
    exit 0
  fi
  sleep 2
done

echo 'The new application did not become ready; rolling back'
rollback
exit 1
