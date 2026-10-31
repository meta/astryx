#!/usr/bin/env bash
# Copyright (c) Meta Platforms, Inc. and affiliates.

# scripts/prune-branches.sh — Delete remote branches with merged/closed PRs
#
# Usage:
#   ./scripts/prune-branches.sh          # dry run (default)
#   ./scripts/prune-branches.sh --delete  # actually delete
#
# Requires: gh CLI (authenticated), git
# Works on macOS (zsh default) and Linux

set -euo pipefail

REPO="meta/astryx"
MODE="${1:-dry-run}"
PARALLEL=15
STALE_DAYS=60  # branches with no PR older than this are also flagged

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
DIM='\033[0;90m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BOLD}🌿 XDS Branch Pruner${NC}"
echo ""

# Fetch + prune stale tracking refs
echo -e "${DIM}Fetching and pruning remote refs...${NC}"
git fetch origin --prune --quiet 2>/dev/null

# Active release branches are protected by their checked-in marker. A release/*
# branch without a readable matching marker is uncertainty, not permission to
# delete: stop the entire cleanup before producing a kill list.
release_branches=()
while IFS= read -r b; do
  [ -n "$b" ] || continue
  if ! marker=$(node scripts/release/active-release.mjs inspect-ref --ref "origin/$b"); then
    echo "Refusing branch cleanup: $b lacks a valid release marker." >&2
    exit 1
  fi
  state=$(node -e 'console.log(JSON.parse(process.argv[1]).state)' "$marker")
  [ "$state" = active ] && release_branches+=("$b")
done < <(git branch -r | sed 's|^[[:space:]]*origin/||' | grep '^release/v' || true)

is_protected_branch() {
  case "$1" in main|gh-pages) return 0 ;; esac
  local protected
  for protected in "${release_branches[@]}"; do
    [ "$1" = "$protected" ] && return 0
  done
  return 1
}

# Get all remote branches, excluding protected
branches=()
while IFS= read -r b; do
  is_protected_branch "$b" || branches+=("$b")
done < <(git branch -r | grep -v HEAD | sed 's|  origin/||')
total=${#branches[@]}
echo -e "Found ${BOLD}$total${NC} remote branches (active release branches protected)"
echo ""

# Temp dirs — one file per branch avoids concurrent write corruption
tmp_dir=$(mktemp -d)
mkdir -p "$tmp_dir/delete" "$tmp_dir/keep" "$tmp_dir/stale"
trap "rm -rf $tmp_dir" EXIT

# Stale cutoff (epoch seconds)
if date -v-1d >/dev/null 2>&1; then
  # macOS date
  stale_cutoff=$(date -v-${STALE_DAYS}d +%s)
else
  # GNU date
  stale_cutoff=$(date -d "$STALE_DAYS days ago" +%s)
fi

# Progress tracking
echo -e "${DIM}Checking PR status ($PARALLEL parallel)...${NC}"

# Use a wrapper script file instead of export -f (works on zsh + bash)
cat > "$tmp_dir/checker.sh" << 'CHECKER'
#!/usr/bin/env bash
branch="$1"
tmp_dir="$2"
stale_cutoff="$3"
repo="$4"
safe_name=$(echo "$branch" | tr '/' '_')

state=$(gh pr list --repo "$repo" --head "$branch" --state all --json state --jq '.[0].state // "none"' 2>/dev/null || echo "error")

if [ "$state" = "MERGED" ] || [ "$state" = "CLOSED" ]; then
  echo "$branch" > "$tmp_dir/delete/$safe_name"
elif [ "$state" = "none" ] || [ "$state" = "error" ]; then
  commit_epoch=$(git log -1 --format='%ct' "origin/$branch" 2>/dev/null || echo "0")
  if [ "$commit_epoch" -lt "$stale_cutoff" ]; then
    echo "$branch" > "$tmp_dir/stale/$safe_name"
  else
    echo "$branch" > "$tmp_dir/keep/$safe_name"
  fi
else
  echo "$branch" > "$tmp_dir/keep/$safe_name"
fi

# Progress (count files in all dirs)
done_count=$(find "$tmp_dir/delete" "$tmp_dir/keep" "$tmp_dir/stale" -type f 2>/dev/null | wc -l | tr -d ' ')
printf "\r  %s/%s checked" "$done_count" "$5" >&2
CHECKER
chmod +x "$tmp_dir/checker.sh"

printf '%s\n' "${branches[@]}" | xargs -P "$PARALLEL" -I {} \
  bash "$tmp_dir/checker.sh" {} "$tmp_dir" "$stale_cutoff" "$REPO" "$total"

echo "" # newline after progress

# Collect results
delete_branches=()
while IFS= read -r f; do
  [ -f "$f" ] && delete_branches+=("$(cat "$f")")
done < <(find "$tmp_dir/delete" -type f 2>/dev/null)

stale_branches=()
while IFS= read -r f; do
  [ -f "$f" ] && stale_branches+=("$(cat "$f")")
done < <(find "$tmp_dir/stale" -type f 2>/dev/null)

keep_count=$(find "$tmp_dir/keep" -type f 2>/dev/null | wc -l | tr -d ' ')
delete_count=${#delete_branches[@]}
stale_count=${#stale_branches[@]}

echo ""
echo -e "${RED}✗ Delete:${NC}  $delete_count branches (merged/closed PR)"
echo -e "${YELLOW}⚠ Stale:${NC}   $stale_count branches (no PR, >${STALE_DAYS} days old)"
echo -e "${GREEN}✓ Keep:${NC}    $keep_count branches (open PR or recent)"

# Combine delete + stale for the kill list
all_delete=("${delete_branches[@]}" "${stale_branches[@]}")
total_delete=${#all_delete[@]}

if [ "$total_delete" -eq 0 ]; then
  echo ""
  echo -e "${GREEN}Nothing to prune. 🎉${NC}"
  exit 0
fi

if [ "$MODE" = "--delete" ]; then
  echo ""
  echo -e "${BOLD}Deleting $total_delete branches ($PARALLEL parallel)...${NC}"

  # Parallel deletion
  printf '%s\n' "${all_delete[@]}" > "$tmp_dir/kill-list.txt"
  mkdir -p "$tmp_dir/results"

  cat > "$tmp_dir/deleter.sh" << 'DELETER'
#!/usr/bin/env bash
branch="$1"
tmp_dir="$2"
safe_name=$(echo "$branch" | tr '/' '_')
if git push origin --delete "$branch" 2>/dev/null; then
  echo "ok" > "$tmp_dir/results/$safe_name"
else
  echo "fail" > "$tmp_dir/results/$safe_name"
fi
done_count=$(ls "$tmp_dir/results" 2>/dev/null | wc -l | tr -d ' ')
printf "\r  %s/%s deleted" "$done_count" "$3" >&2
DELETER
  chmod +x "$tmp_dir/deleter.sh"

  cat "$tmp_dir/kill-list.txt" | xargs -P "$PARALLEL" -I {} \
    bash "$tmp_dir/deleter.sh" {} "$tmp_dir" "$total_delete"

  echo "" # newline after progress

  # grep exits 1 when a class is empty, and under `set -e` + `pipefail` that
  # aborts the script — on the all-succeeded path, which is the normal one.
  deleted=$(grep -rl "ok" "$tmp_dir/results" 2>/dev/null | wc -l | tr -d ' ' || true)
  failed=$(grep -rl "fail" "$tmp_dir/results" 2>/dev/null | wc -l | tr -d ' ' || true)

  echo ""
  echo -e "${BOLD}Results:${NC}"
  echo -e "  ${GREEN}Deleted:${NC}   $deleted"
  # `[ … ] && echo` would return 1 here when nothing failed, which `set -e`
  # reads as the script failing.
  if [ "$failed" -gt 0 ]; then
    echo -e "  ${RED}Failed:${NC}    $failed"
  fi
  echo -e "  ${YELLOW}Remaining:${NC} $keep_count + protected"
else
  echo ""
  echo -e "${YELLOW}Dry run — pass ${BOLD}--delete${NC}${YELLOW} to actually delete.${NC}"

  if [ "$delete_count" -gt 0 ]; then
    echo ""
    echo -e "${DIM}Merged/closed PR (will delete):${NC}"
    printf '%s\n' "${delete_branches[@]}" | sort | sed 's/^/  /'
  fi

  if [ "$stale_count" -gt 0 ]; then
    echo ""
    echo -e "${DIM}No PR + >${STALE_DAYS} days stale (will delete):${NC}"
    printf '%s\n' "${stale_branches[@]}" | sort | sed 's/^/  /'
  fi
fi
