.DEFAULT_GOAL := help

ifneq (,$(wildcard .env))
  include .env
  export
endif

PULUMI_YES := $(if $(CI),--yes,)

.PHONY: help
help:
	@grep -E '^[a-zA-Z_/-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "  \033[36m%-24s\033[0m %s\n", $$1, $$2}'

.PHONY: dev
dev: ## Run the site locally at http://localhost:4321
	docker compose up dev

.PHONY: test
test: ## Run the test suite
	docker compose run --rm node sh -c "npm install && npm test"

.PHONY: build
build: ## Type-check and build for production
	docker compose run --rm node sh -c "npm install && npm run build"

.PHONY: cli
cli: ## Run the console tool against a YAML config: make cli FILE=path/to/config.yml (path can be anywhere on the host, e.g. ../cashflow/config/whatever.yml)
	@test -n "$(FILE)" || { echo "❌  FILE not set -- e.g. make cli FILE=../cashflow/config/luke_early_retire.yml"; exit 1; }
	docker compose run --rm \
		-v "$$(cd "$$(dirname "$(FILE)")" && pwd):/host-config:ro" \
		node sh -c "npm install && npm run cli -- /host-config/$$(basename "$(FILE)")"

.PHONY: plan-check
plan-check: ## Check a budget and get told what to fix first: make plan-check FILE=path/to/plan.yml
	@test -n "$(FILE)" || { echo "❌  FILE not set -- e.g. make plan-check FILE=tests/fixtures/needs-balancing.yml"; exit 1; }
	docker compose run --rm \
		-v "$$(cd "$$(dirname "$(FILE)")" && pwd):/host-config:ro" \
		node sh -c "npm install && npm run cli -- check /host-config/$$(basename "$(FILE)")"

.PHONY: eval-link
eval-link: ## Regenerate the share link for the eval plan (see evals/README.md)
	docker compose run --rm node sh -c "npm install && npm run build:lib && node --input-type=module -e \"\
		import { encodeShareUrl } from './dist/envelopes.mjs'; \
		import { readFileSync, writeFileSync } from 'node:fs'; \
		const clean = readFileSync('tests/fixtures/needs-balancing.yml','utf-8').split(String.fromCharCode(10)).filter(l => !l.startsWith('#')).join(String.fromCharCode(10)).replace(/^\n+/, ''); \
		const url = await encodeShareUrl(clean); \
		writeFileSync('evals/needs-balancing.link', url + '\n'); \
		console.log('wrote evals/needs-balancing.link (' + url.length + ' chars)');\""

.PHONY: set-secret
set-secret: ## One-time: push PULUMI_ACCESS_TOKEN from .env to the GitHub repo secret
	@test -n "$(PULUMI_ACCESS_TOKEN)" || { echo "❌  PULUMI_ACCESS_TOKEN not set -- fill in .env first"; exit 1; }
	@gh secret set PULUMI_ACCESS_TOKEN --repo lukerohde/envelopes --body "$(PULUMI_ACCESS_TOKEN)"
	@echo "✅  PULUMI_ACCESS_TOKEN set on lukerohde/envelopes"

.PHONY: infra-preview
infra-preview: ## Preview infra changes (needs AWS keys in .env -- not there by default, see .env.example)
	docker compose build pulumi
	docker compose run --rm pulumi preview

.PHONY: infra-up
infra-up: ## Apply infra changes -- CI does this on push to main; local needs AWS keys added to .env
	docker compose build pulumi
	docker compose run --rm pulumi up $(PULUMI_YES)

.PHONY: infra-destroy
infra-destroy: ## Destroy infra ⚠️  careful
	docker compose run --rm pulumi destroy $(PULUMI_YES)

.PHONY: infra-outputs
infra-outputs: ## Show stack outputs
	docker compose run --rm pulumi stack output

.PHONY: deploy
deploy: build ## Build, sync dist/ to S3, invalidate CloudFront -- CI runs this on every push; needs AWS keys locally
	@BUCKET=$${BUCKET:-$$(docker compose run --rm -T pulumi stack output bucket 2>/dev/null | tail -1)}; \
	CFID=$${CF_DISTRIBUTION_ID:-$$(docker compose run --rm -T pulumi stack output distribution_id 2>/dev/null | tail -1)}; \
	test -n "$$BUCKET" || { echo "❌  Run 'make infra-up' first"; exit 1; }; \
	echo "→ Deploying to $$BUCKET"; \
	docker compose run --rm awscli s3 sync /app/dist s3://$$BUCKET --delete; \
	docker compose run --rm awscli cloudfront create-invalidation \
		--distribution-id $$CFID --paths '/*'

# The eval always runs the artefact people actually download. Round 1 shipped
# a bundle whose CLI understood no arguments at all, and every test passed --
# because every test ran the source.
.PHONY: bundle-check
bundle-check: ## Smoke-test the *published* CLI bundle, not the source tree
	docker compose run --rm node sh -c '\
		npm install --silent && npm run build:lib >/dev/null && \
		node dist/envelopes-cli.mjs --help | head -1 && \
		node dist/envelopes-cli.mjs check --json src/example.yaml | head -1 && \
		node dist/envelopes-cli.mjs --json --start=2027-01-01 src/example.yaml | head -3 | tail -1 && \
		LINK=$$(node dist/envelopes-cli.mjs link src/example.yaml) && \
		node dist/envelopes-cli.mjs decode "$$LINK" | head -1 && \
		node dist/envelopes-cli.mjs decode "$${LINK%??????????}" 2>&1 | head -1'
