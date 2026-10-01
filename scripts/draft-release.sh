#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

tag="v0.1.0"
archive="TKClassic-${tag}.zip"
original_archive="TKClassic-${tag}-original-nexus.zip"

command -v gh >/dev/null || { echo 'GitHub CLI (gh) is required.' >&2; exit 1; }
[[ -z $(git status --porcelain --untracked-files=normal) ]] || { echo 'Commit the source and documentation changes before drafting a release.' >&2; exit 1; }
git rev-parse --verify "refs/tags/$tag^{commit}" >/dev/null 2>&1 || { echo "Create and push tag $tag first." >&2; exit 1; }
[[ $(git rev-parse HEAD) == $(git rev-list -n 1 "$tag") ]] || { echo "Tag $tag must point to the current commit." >&2; exit 1; }
npm run verify-release
npm run package-release
for file in "$archive" "$original_archive"; do
  [[ -f "dist/$file" && -f "dist/${file}.sha256" ]] || { echo "Missing $file or its checksum. Run npm run package-release first." >&2; exit 1; }
  (cd dist && sha256sum -c "${file}.sha256")
done

gh release create "$tag" "dist/$archive" "dist/${archive}.sha256" \
  "dist/$original_archive" "dist/${original_archive}.sha256" \
  --verify-tag --draft --title "TKClassic $tag" --notes-file scripts/release-notes-v0.1.0.md
