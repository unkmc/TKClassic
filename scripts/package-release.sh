#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

version="v0.1.0"
archive="TKClassic-${version}.zip"
original_archive="TKClassic-${version}-original-nexus.zip"
temporary="dist/.TKClassic-${version}.part.zip"
original_temporary="dist/.TKClassic-${version}-original-nexus.part.zip"
limit=$((2 * 1024 * 1024 * 1024))

for tool in unzip sha256sum; do
  command -v "$tool" >/dev/null || { echo "Required command is missing: $tool" >&2; exit 1; }
done
if command -v 7z >/dev/null; then
  compressor=7z
elif command -v zip >/dev/null; then
  compressor=zip
else
  echo 'Either 7z or zip is required.' >&2
  exit 1
fi

[[ -d Release && ! -L Release ]] || { echo 'Release/ is missing or is a symlink. Run npm run classic first.' >&2; exit 1; }
mapfile -d '' files < <(find Release -mindepth 1 -maxdepth 1 -type f -iname '*.dat' -print0 | sort -z)
[[ ${#files[@]} -gt 0 ]] || { echo 'Release/ has no DAT files.' >&2; exit 1; }
other_count=$(find Release -mindepth 1 -maxdepth 1 \( ! -type f -o ! -iname '*.dat' \) | wc -l)
[[ $other_count -eq 0 ]] || { echo 'Release/ contains a directory, link, or non-DAT file.' >&2; exit 1; }
originals=()
for file in "${files[@]}"; do
  original="nexus/Data/${file#Release/}"
  [[ -f "$original" && ! -L "$original" ]] || { echo "Original Nexus file is missing: $original" >&2; exit 1; }
  originals+=("$original")
done

mkdir -p dist
trap 'rm -f "$temporary" "$original_temporary"' EXIT
rm -f "$temporary" "$original_temporary"

make_archive() {
  local target="$1"
  shift
  if [[ $compressor == 7z ]]; then
    7z a -tzip -mx=5 -mmt=on "$target" "$@" >/dev/null
    7z t "$target" >/dev/null
  else
    zip -q -X -6 "$target" "$@"
    unzip -tqq "$target"
  fi
  diff -u <(printf '%s\n' "$@") <(unzip -Z -1 "$target")
  local bytes
  bytes=$(wc -c < "$target")
  (( bytes < limit )) || { echo "Archive is too large for one GitHub Release asset: $target ($bytes bytes)" >&2; exit 1; }
  echo "Validated $target ($bytes bytes; $compressor)."
}

make_archive "$temporary" "${files[@]}"
make_archive "$original_temporary" "${originals[@]}"

mv -f "$temporary" "dist/$archive"
mv -f "$original_temporary" "dist/$original_archive"
(cd dist && sha256sum "$archive" > "${archive}.sha256" && sha256sum "$original_archive" > "${original_archive}.sha256")
echo "Packaged ${#files[@]} replacement DAT files in dist/$archive."
echo "Packaged ${#originals[@]} corresponding original Nexus DAT files in dist/$original_archive."
