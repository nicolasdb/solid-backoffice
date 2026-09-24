# Convenience targets. Only long, multi-step or easy-to-forget commands live
# here — anything a single npm script already covers stays a npm script.
#
# The build is produced LOCALLY and only dist/ ships to the VPS: nothing is
# compiled there, so there is no node toolchain to maintain on the server.
#
# ── Per-app settings: change these four and the rest follows ─────────────────
APP         := solid-kit-app
DOMAIN      := app.example.org
CONTAINER   := $(APP)-web
REMOTE      := hetzner
REMOTE_PATH := /home/nicolas/$(APP)

# What constitutes a deployment: the build, the compose file and the
# container's nginx config. Sources have no business on the VPS.
DEPLOY_PATHS := dist docker-compose.yml deploy

.DEFAULT_GOAL := help
.PHONY: help dev build check test verify audit clean vps-diff vps-push vps-deploy vps-logs vps-restart vps-ssh

help: ## Show this help
	@echo "$(APP)"
	@echo
	@grep -E '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-12s\033[0m %s\n", $$1, $$2}'
	@echo
	@echo "Deploy: $(DOMAIN) -> container $(CONTAINER) (gateway network)."
	@echo "Routing lives in hetzner-gateway; see deploy/gateway-vhost.conf.tmpl."

# ── Local ────────────────────────────────────────────────────────────────────

dev: ## Vite dev server (add --host to reach it from a phone on the LAN)
	npm run dev

build: ## Typecheck + production build into dist/
	npm run build

check: ## Typecheck only, no build
	npm run check

test: ## Unit tests
	npm test

audit: ## Design-system checks: contrast, token completeness, a11y affordances
	npm run audit

verify: ## Everything automated: typecheck + tests + audit
	npm run verify
	@echo
	@echo "Automated checks pass. Sign-in is NOT covered — see docs/manual-tests.md."

clean: ## Remove dist/
	rm -rf dist

# ── VPS ──────────────────────────────────────────────────────────────────────
# All of these run from the local machine, over SSH.

vps-diff: ## Show what a push would change on the VPS, writing nothing
	@rsync -avzn --delete $(DEPLOY_PATHS) $(REMOTE):$(REMOTE_PATH)/

vps-push: build ## Build, then rsync dist/ + compose + nginx config to the VPS
	@ssh $(REMOTE) "mkdir -p $(REMOTE_PATH)"
	rsync -avz --delete $(DEPLOY_PATHS) $(REMOTE):$(REMOTE_PATH)/
	@echo "Pushed to $(REMOTE):$(REMOTE_PATH)."

vps-deploy: vps-push ## Push, then (re)start the container
	ssh $(REMOTE) "cd $(REMOTE_PATH) && docker compose up -d"
	@echo "Deployed. Check: curl -sI https://$(DOMAIN) | head -1"

# dist/ is a bind mount, so a new build is served without a restart.
# This is only needed after changing deploy/nginx-site.conf.
vps-restart: ## Restart the container (needed after an nginx config change)
	ssh $(REMOTE) "cd $(REMOTE_PATH) && docker compose restart $(CONTAINER)"

vps-logs: ## Follow the container's logs
	ssh $(REMOTE) "docker logs $(CONTAINER) -f"

vps-ssh: ## Open an SSH session on the VPS
	ssh $(REMOTE)
