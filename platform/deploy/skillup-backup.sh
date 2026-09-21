#!/bin/bash
# Daily backup of SkillUp Postgres + legacy JSON data. Keeps 14 days.
# ponytail: local-disk only; copy off-VPS once a second target exists.
set -euo pipefail
dir=/var/backups/skillup
mkdir -p "$dir"
chmod 700 "$dir"
stamp=$(date +%F)
runuser -u postgres -- pg_dump -Fc skillup > "$dir/skillup-$stamp.dump.tmp"
mv "$dir/skillup-$stamp.dump.tmp" "$dir/skillup-$stamp.dump"
tar -czf "$dir/aff-$stamp.tgz" -C /var/lib brandooers-aff
find "$dir" -type f \( -name 'skillup-*.dump' -o -name 'aff-*.tgz' \) -mtime +14 -delete
