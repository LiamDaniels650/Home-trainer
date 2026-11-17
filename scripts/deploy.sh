#!/usr/bin/env bash
# Construit l'app et publie le dossier dist/ sur la branche gh-pages (GitHub Pages : « Deploy from a branch »).
set -euo pipefail
cd "$(dirname "$0")/.."
npm test
npm run build
rev=$(git rev-parse --short HEAD)
url=$(git remote get-url origin)
tmp=$(mktemp -d)
cp -r dist/. "$tmp"
touch "$tmp/.nojekyll"
cd "$tmp"
git init -q -b gh-pages
git add -A
git -c user.name="$(git -C "$OLDPWD" log -1 --format=%an)" -c user.email="$(git -C "$OLDPWD" log -1 --format=%ae)" \
  commit -qm "Publication de l'app (build de $rev)"
git push -f "$url" gh-pages
rm -rf "$tmp"
echo "Publié : https://liamdaniels650.github.io/Home-trainer/"
