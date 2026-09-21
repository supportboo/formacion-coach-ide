#!/bin/bash
# Deploy SkillUp from git, on the VPS as root:
#   bash /var/www/brandooers/platform/deploy/deploy.sh <branch|tag|sha>
# Gate: typecheck + unit tests + fresh DB backup before migrating; rolls back code if anything fails.
# Refuses to run over server-side edits to tracked files (that is how prod drifted from git before).
set -euo pipefail
ref=${1:?usage: deploy.sh <branch|tag|sha>}
cd /var/www/brandooers
if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  echo "ABORT: tracked files were edited on the server. Commit them to git first:"
  git status --short --untracked-files=no
  exit 1
fi
prev=$(git rev-parse HEAD)
git fetch --quiet origin
git checkout --quiet --detach "origin/$ref" 2>/dev/null || git checkout --quiet --detach "$ref"
echo "deploying $(git log --oneline -1) (was ${prev:0:7})"

rollback() {
  echo "FAILED - rolling back code to ${prev:0:7}"
  cd /var/www/brandooers && git checkout --quiet --detach "$prev"
  (cd platform && npm ci --silent)
  systemctl restart skillup.service brandooers-aff.service
  exit 1
}

cd platform
npm ci --silent || rollback
npx tsc --noEmit || rollback
npx vitest run || rollback
/usr/local/bin/skillup-backup.sh || rollback
npm run db:migrate || rollback
systemctl restart skillup.service brandooers-aff.service
for _ in $(seq 1 20); do
  sleep 1
  if curl -sf -o /dev/null http://127.0.0.1:8080/health; then echo "OK $(git rev-parse --short HEAD)"; exit 0; fi
done
rollback
