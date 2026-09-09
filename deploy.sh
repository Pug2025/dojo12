#!/bin/sh
# Dojo 12 deploy: stamp the build into the service worker, commit, push.
# GitHub Pages serves the repository root of Pug2025/dojo12.
set -e
cd "$(dirname "$0")"
BUILD=$(date +%Y%m%d-%H%M%S)
node tests-node.mjs > /dev/null
sed -i '' "s/^const BUILD = '.*';/const BUILD = '$BUILD';/" sw.js
git add -A
git commit -q -m "${1:-build $BUILD}"
git push -q
echo "$BUILD"
