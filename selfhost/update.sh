#!/usr/bin/env bash
# Update and (re)deploy the self-hosted build.
#
#   selfhost/update.sh             merge new upstream commits, re-prune, build, deploy
#   selfhost/update.sh --rebuild   no merge: rebuild and redeploy the current tree
#                                  (after an env change, or to pick up base-image patches)
#   selfhost/update.sh --continue  resume after you resolved merge conflicts by hand
#   selfhost/update.sh --no-deploy stop once the new image passed its trial run
#
# Needs git, docker (with compose), curl, and node >= 20 with corepack on the
# host. Host-side node only runs our own prune script and a lockfile-only pnpm
# resolve; dependency code is installed, tested and built inside Docker.
set -euo pipefail

UPSTREAM_URL="https://github.com/swiss-knife-xyz/swiss-knife"
UPSTREAM_BRANCH="master"

repo="$(cd "$(dirname "$(readlink -f "${BASH_SOURCE[0]}")")/.." && pwd)"
cd "$repo"

mode=update deploy=1
for arg in "$@"; do
  case "$arg" in
    --rebuild) mode=rebuild ;;
    --continue) mode=continue ;;
    --no-deploy) deploy=0 ;;
    -h | --help) sed -n '2,13p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[1;31merror:\033[0m %s\n' "$*" >&2; exit 1; }

# Env file: ./.env, or one directory up (keeps secrets outside the git tree).
env_file="${ETHSH_ENV_FILE:-}"
if [[ -z "$env_file" ]]; then
  for candidate in "$repo/.env" "$repo/../.env"; do
    [[ -f "$candidate" ]] && env_file="$candidate" && break
  done
fi
compose() { docker compose --env-file "$env_file" -f "$repo/selfhost/compose.yaml" "$@"; }

owned_files() { node -e 'console.log(require("./selfhost/keep.json").owned.join("\n"))'; }

# Files the fork derives from upstream's on every update.
DERIVED=(package.json pnpm-lock.yaml)

merge_upstream() {
  [[ -z "$(git status --porcelain)" ]] || die "working tree is not clean; commit or stash first"
  git remote get-url upstream >/dev/null 2>&1 || git remote add upstream "$UPSTREAM_URL"
  say "Fetching upstream"
  git fetch --quiet upstream "$UPSTREAM_BRANCH"
  local target="upstream/$UPSTREAM_BRANCH"
  if git merge-base --is-ancestor "$target" HEAD; then
    echo "Already up to date with $target ($(git rev-parse --short "$target"))."
    return 1
  fi
  local base; base="$(git merge-base HEAD "$target")"

  say "Upstream changes to files this build keeps ($(git rev-list --count "$base..$target") commits)"
  git ls-files -z | GIT_LITERAL_PATHSPECS=1 xargs -0 git diff --stat "$base" "$target" -- | tail -n 40
  local owned=() touched
  mapfile -t owned < <(owned_files)
  touched="$(GIT_LITERAL_PATHSPECS=1 git diff --name-only "$base" "$target" -- "${owned[@]}")"
  # Upstream files the fork removed but re-implements itself (keep.json "watch").
  local watch=() watched=""
  mapfile -t watch < <(node -e 'console.log((require("./selfhost/keep.json").watch ?? []).join("\n"))')
  ((${#watch[@]})) && [[ -n "${watch[0]}" ]] &&
    watched="$(GIT_LITERAL_PATHSPECS=1 git diff --name-only "$base" "$target" -- "${watch[@]}")"

  say "Merging $target"
  git merge --no-commit --no-ff "$target" >/dev/null 2>&1 || true

  # Files the fork removed stay removed, whatever upstream did to them.
  local path
  while IFS= read -r -d '' path; do
    git cat-file -e "HEAD:$path" 2>/dev/null || git rm -q -- ":(literal)$path"
  done < <(git diff --name-only --diff-filter=U -z)
  # Fork-owned files keep the fork's version, even where git merged cleanly.
  for path in "${owned[@]}"; do
    git checkout -q HEAD -- ":(literal)$path"
  done
  # Derived files start again from upstream's copy; prune re-derives them below.
  git checkout -q "$target" -- "${DERIVED[@]}"

  if [[ -n "$touched" ]]; then
    say "Upstream changed files this fork owns (kept ours; review whether to port anything)"
    printf '  %s\n' $touched
    printf '  compare with: git diff %s %s -- <file>\n' "$(git rev-parse --short "$base")" "$target"
  fi
  if [[ -n "$watched" ]]; then
    say "Upstream changed files this fork re-implements (port the change by hand)"
    printf '  %s\n' $watched
    printf '  see: git diff %s %s -- <file>\n' "$(git rev-parse --short "$base")" "$target"
  fi
  local unmerged; unmerged="$(git diff --name-only --diff-filter=U)"
  if [[ -n "$unmerged" ]]; then
    say "Conflicts need a human"
    printf '  %s\n' $unmerged
    die "resolve them, 'git add' the files, then run: selfhost/update.sh --continue"
  fi
  return 0
}

derive() {
  say "Pruning to the kept tools"
  node selfhost/prune.mjs
  say "Resolving the lockfile (no packages are installed on the host)"
  COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm install --lockfile-only --no-frozen-lockfile \
    --ignore-scripts --reporter=silent
  node selfhost/prune.mjs --check
}

audit() {
  say "Known advisories in production dependencies (informational)"
  COREPACK_ENABLE_DOWNLOAD_PROMPT=0 corepack pnpm audit --prod 2>/dev/null | tail -n 2 || true
  echo "To force a fixed version: packages.pin / packages.overrides in selfhost/keep.json."
}

smoke() { # smoke <port>
  local port="$1" path code
  for path in / /tx /explorer /calldata/decoder; do
    code="$(curl -s -o /dev/null -w '%{http_code}' "http://127.0.0.1:$port$path" || true)"
    printf '  %-20s %s\n' "$path" "$code"
    [[ "$code" == 200 ]] || die "$path returned $code"
  done
  curl -sI "http://127.0.0.1:$port/tx" | grep -qi "^content-security-policy:.*'nonce-" ||
    die "pages are served without the nonce CSP"
}

build() {
  [[ -n "$env_file" ]] || die "no env file: copy selfhost/env.example to .env (or set ETHSH_ENV_FILE)"
  say "Building image: unit tests, typecheck, build (env: $env_file)"
  compose build --pull || die "build failed (see above)"

  # Try the new image on a spare port before it replaces the running one.
  say "Trial run of the new image"
  local name="eth-sh-trial-$$" port="" i
  docker run -d --rm --name "$name" --read-only --cap-drop ALL \
    --security-opt no-new-privileges:true --tmpfs /tmp \
    --tmpfs /app/.next/cache:uid=65532,gid=65532,mode=0700 \
    -p 127.0.0.1::3000 eth-sh-selfhost >/dev/null
  trap "docker rm -f '$name' >/dev/null 2>&1 || true" EXIT
  port="$(docker port "$name" 3000 | head -n 1 | sed 's/.*://')"
  for i in $(seq 1 30); do
    curl -s -o /dev/null "http://127.0.0.1:$port/robots.txt" && break
    sleep 1
  done
  smoke "$port"
  docker rm -f "$name" >/dev/null 2>&1 || true
  trap - EXIT
}

deploy() {
  say "Deploying"
  compose up -d --wait
  local port; port="$(compose port web 3000 | sed 's/.*://')"
  smoke "$port"
  docker image prune -f --filter label=eth-sh-selfhost=1 >/dev/null
  echo "Deployed $(git rev-parse --short HEAD) on 127.0.0.1:$port."
}

commit_merge() {
  git add -A
  if git rev-parse -q --verify MERGE_HEAD >/dev/null; then
    git commit -q -m "Merge upstream $(git rev-parse --short MERGE_HEAD) into selfhost"
  elif ! git diff --cached --quiet; then
    git commit -q -m "selfhost: re-derive after manual fixes"
  else
    return 0
  fi
  say "Committed $(git rev-parse --short HEAD). Not pushed."
}

case "$mode" in
  update)
    if merge_upstream; then
      derive
      build
      audit
      commit_merge
    else
      build
    fi
    ;;
  continue)
    [[ -z "$(git diff --name-only --diff-filter=U)" ]] || die "there are still unresolved conflicts"
    derive
    build
    audit
    commit_merge
    ;;
  rebuild) build ;;
esac

if ((deploy)); then deploy; fi
