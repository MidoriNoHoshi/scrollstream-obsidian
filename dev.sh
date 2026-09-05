#!/usr/bin/env bash
set -euo pipefail

VAULT_PLUGINS_BASE="${OBSIDIAN_VAULT_PLUGINS:-$HOME/Aki Tatsuyama/.obsidian/plugins}"

if [ -f "manifest.json" ] && grep -q '"id"' manifest.json; then
	PLUGIN_ID=$(grep '"id"' manifest.json | head -1 | sed -E 's/.*"id"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')
else
	PLUGIN_ID=$(basename "$(pwd)")
fi

if [ -f "manifest.json" ] && grep -q '"version"' manifest.json; then
	PLUGIN_VERSION=$(grep '"version"' manifest.json | head -1 | sed -E 's/.*"version"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')
else
	PLUGIN_VERSION="1.0.0"
fi

if git remote get-url origin 2>/dev/null | grep -q 'github.com'; then
	REPO_URL=$(git remote get-url origin | sed -E 's/.*github\.com[:\/](.+?)(\.git)?$/https:\/\/github.com\/\1/')
	REPO_OWNER=$(git remote get-url origin | sed -E 's/.*github\.com[:\/](.+?)\/.+?(\.git)?$/\1/')
else
	REPO_URL="https://github.com/<username>/<repo>"
	REPO_OWNER="<your-github-username>"
fi

VAULT_PLUGIN_DIR="${VAULT_PLUGINS_BASE}/${PLUGIN_ID}"

ensure_deps() {
	if [ ! -d "node_modules" ]; then
		if [ -f "package.json" ]; then
			echo "==> node_modules missing. Installing dependencies..."
			npm install
		else
			echo "==> Error: No package.json found in current directory."
			exit 1
		fi
	fi
}

cmd_link() {
	mkdir -p "${VAULT_PLUGINS_BASE}"

	if [ -L "${VAULT_PLUGIN_DIR}" ]; then
		local current_target
		current_target=$(readlink "${VAULT_PLUGIN_DIR}")
		if [ "${current_target}" = "$(pwd)" ]; then
			return 0
		fi
		rm "${VAULT_PLUGIN_DIR}"
	fi

	if [ -d "${VAULT_PLUGIN_DIR}" ]; then
		local backup="${VAULT_PLUGIN_DIR}.bak-$(date +%s)"
		echo "==> Existing directory found. Moving to ${backup}"
		mv "${VAULT_PLUGIN_DIR}" "${backup}"
	fi

	ln -s "$(pwd)" "${VAULT_PLUGIN_DIR}"
	echo "==> Symlink active: ${VAULT_PLUGIN_DIR} -> $(pwd)"
}

cmd_setup() {
	echo "==> Initializing environment for '${PLUGIN_ID}'..."
	ensure_deps
	cmd_link
	echo "==> Setup complete."
}

cmd_dev() {
	ensure_deps
	cmd_link
	echo "==> Starting build watcher for '${PLUGIN_ID}'..."
	touch .hotreload 2>/dev/null || true
	exec npm run dev
}

cmd_build() {
	ensure_deps
	cmd_link
	echo "==> Running production build for '${PLUGIN_ID}'..."
	npm run build
}

cmd_check() {
	ensure_deps
	if [ -f "tsconfig.json" ]; then
		echo "==> Running TypeScript compiler check..."
		npx tsc --noEmit
	fi

	if npm run | grep -qE '^[[:space:]]*lint$'; then
		echo "==> Running linter..."
		npm run lint
	elif [ -f "eslint.config.mjs" ] || [ -f "eslint.config.js" ] || [ -f ".eslintrc.json" ] || [ -f ".eslintrc.js" ]; then
		echo "==> Running ESLint..."
		npx eslint .
	fi

	cmd_build
	echo "==> All checks passed."
}

cmd_release() {
	cmd_check
	echo "==> Packaging into ./dist..."
	rm -rf dist
	mkdir -p dist

	if [ -f "styles.css" ]; then
		cp styles.css dist/styles.css
	elif [ -f "src/styles.css" ]; then
		cp src/styles.css dist/styles.css
	fi

	cp main.js manifest.json dist/
	echo "==> Distribution artifacts staged:"
	ls -lh dist/
}

cmd_git_help() {
	cat <<EOF
======================================================================
                  OBSIDIAN PLUGIN RELEASE WORKFLOW
======================================================================
Plugin:  ${PLUGIN_ID}
Version: ${PLUGIN_VERSION}
Repo:    ${REPO_URL}

----------------------------------------------------------------------
1. RELEASE ASSETS & VERSION TAGGING
----------------------------------------------------------------------
Build & stage binaries:
   ./dev.sh release

Commit, push, and create tag:
   git push origin main
   git tag -a "${PLUGIN_VERSION}" -m "Release ${PLUGIN_VERSION}"
   git push origin "${PLUGIN_VERSION}"

Publish GitHub Release:
   Web: ${REPO_URL}/releases/new?tag=${PLUGIN_VERSION}
   Upload ONLY the 3 compiled assets from ./dist/:
     - dist/manifest.json
     - dist/main.js
     - dist/styles.css (if present)

----------------------------------------------------------------------
2. COMMUNITY PLUGINS SUBMISSION (SHALLOW CLONE)
----------------------------------------------------------------------
Fork the official repository on GitHub:
   https://github.com/obsidianmd/obsidian-releases (Click "Fork")

Shallow clone your fork locally:
   git clone --depth 1 https://github.com/${REPO_OWNER}/obsidian-releases.git
   cd obsidian-releases
   git checkout -b add-${PLUGIN_ID}

Edit community-plugins.json (must maintain strict alphabetical order by id):
   Find where "id": "${PLUGIN_ID}" fits alphabetically and insert:

   {
     "id": "${PLUGIN_ID}",
     "name": "$(grep '"name"' manifest.json | head -1 | sed -E 's/.*"name"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')",
     "author": "$(grep '"author"' manifest.json | head -1 | sed -E 's/.*"author"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')",
     "description": "$(grep '"description"' manifest.json | head -1 | sed -E 's/.*"description"[[:space:]]*:[[:space:]]*"([^"]+)".*/\1/')",
     "repo": "${REPO_OWNER}/${PLUGIN_ID}"
   },

Run the official validation suite:
   npm install
   npm test

Commit, push, and open PR:
   git add community-plugins.json
   git commit -m "Add ${PLUGIN_ID}"
   git push origin add-${PLUGIN_ID}
======================================================================
EOF
}

cmd_help() {
	cat <<EOF
Usage: ./dev.sh [command]

Detected Plugin : ${PLUGIN_ID} (v${PLUGIN_VERSION})
Vault Target    : ${VAULT_PLUGIN_DIR}

Commands:
  setup     Run npm install and establish vault symlink without starting build
  dev       Verify dependencies, establish symlink, and start npm run dev (watch)
  build     Verify dependencies, establish symlink, and run production build
  link      Create/verify symlink from this repository to your vault
  check     Run tsc, ESLint (if configured), and production build
  release   Run full check suite and copy release assets into ./dist/
  git       Print Git tag and GitHub release commands
  help      Display this message
EOF
}

case "${1:-help}" in
setup) cmd_setup ;;
dev) cmd_dev ;;
build) cmd_build ;;
link) cmd_link ;;
check) cmd_check ;;
release) cmd_release ;;
git) cmd_git_help ;;
help | -h | --help) cmd_help ;;
*)
	echo "Unknown command: $1"
	echo ""
	cmd_help
	exit 1
	;;
esac
