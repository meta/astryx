#!/usr/bin/env bash
# scripts/add-copyright.sh — Add copyright notice to all source files
#
# Usage: ./scripts/add-copyright.sh [--check]
#   --check  Report files missing the copyright notice without modifying them.
#            Exits 0 if all files have it, 1 otherwise.

set -euo pipefail

COPYRIGHT="Copyright (c) Meta Platforms, Inc. and affiliates."

CHECK_ONLY=false
if [[ "${1:-}" == "--check" ]]; then
  CHECK_ONLY=true
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

# Collect source files, excluding:
#   - node_modules, .git, dist, .claude (worktrees), .changeset
#   - markdown, json, lock, map, image, font, svg, snap, license/readme
#   - .husky internals
SOURCE_FILES=()
while IFS= read -r -d '' file; do
  SOURCE_FILES+=("$file")
done < <(
  find . -type f \
    \( -name '*.ts' -o -name '*.tsx' \
    -o -name '*.js' -o -name '*.mjs' -o -name '*.cjs' -o -name '*.jsx' \
    -o -name '*.css' \
    -o -name '*.sh' \
    -o -name '*.py' \
    -o -name '*.yml' -o -name '*.yaml' \
    -o -name '*.html' \) \
    -not -path '*/node_modules/*' \
    -not -path '*/.git/*' \
    -not -path '*/dist/*' \
    -not -path '*/.claude/*' \
    -not -path '*/.changeset/*' \
    -not -path '*/.next/*' \
    -not -path '*/.husky/_/*' \
    -not -path '*/__snapshots__/*' \
    -not -path './internal/vibe-tests/eval/arms/*' \
    -not -name 'pnpm-lock.yaml' \
    -not -name 'next-env.d.ts' \
    -print0
)

# Comment syntax per file extension
comment_for() {
  local file="$1"
  case "$file" in
    *.css)       echo "/* $COPYRIGHT */";;
    *.html)      echo "<!-- $COPYRIGHT -->";;
    *.sh|*.py|*.yml|*.yaml)
                 echo "# $COPYRIGHT";;
    *)           echo "// $COPYRIGHT";;
  esac
}

missing=()
modified=()

for file in "${SOURCE_FILES[@]}"; do
  if grep -qF "$COPYRIGHT" "$file"; then
    continue
  fi

  missing+=("$file")

  if $CHECK_ONLY; then
    continue
  fi

  comment="$(comment_for "$file")"
  first_line="$(head -n1 "$file")"

  # Preserve shebangs — insert copyright on line 2
  if [[ "$first_line" == "#!"* ]]; then
    # Insert after shebang with a blank line separator
    tmp="$(mktemp)"
    { head -n1 "$file"; echo "$comment"; echo ""; tail -n +2 "$file"; } > "$tmp"
    mv "$tmp" "$file"
  else
    tmp="$(mktemp)"
    { echo "$comment"; echo ""; cat "$file"; } > "$tmp"
    mv "$tmp" "$file"
  fi

  modified+=("$file")
done

if $CHECK_ONLY; then
  if [[ ${#missing[@]} -gt 0 ]]; then
    echo "Files missing copyright notice (${#missing[@]}):"
    printf '  %s\n' "${missing[@]}"
    exit 1
  else
    echo "All files have the copyright notice."
    exit 0
  fi
fi

if [[ ${#modified[@]} -gt 0 ]]; then
  echo "Added copyright notice to ${#modified[@]} files:"
  printf '  %s\n' "${modified[@]}"
else
  echo "All files already have the copyright notice."
fi
