---
name: amazon-mcp-and-tooling
description: >-
  SP-API tooling — Amazon's official sp-api-dev-mcp, the Local AI Sandbox,
  peddler. Read when choosing SP-API tooling.
mode: on-demand
---

# SP-API development tooling

What exists, what it's for, and when to reach for it (surveyed September
2026).

## Amazon's official MCP server — useful, and sharper than it looks

`@amazon-sp-api-release/sp-api-dev-mcp` — v1.0.5 (2026-08-18), Apache-2.0,
Node 20+, maintained by @amazon.com accounts. Runs locally via `npx`; plugs
into Claude Code / Cursor / VS Code. Three binaries: a dispatcher plus two
servers.

- **sp-api-dev-assistant-mcp-server** — natural-language search over the
  authoritative docs, endpoint exploration, code generation, **API version
  migration assistance**, and a "well-architected review" grading an
  integration across 9 pillars. Needs no credentials. This half is safe and is
  where most of the value is.
- **sp-api-workflow-mcp-server** — multi-step workflows on an Amazon States
  Language engine. Its `sp_api_execute` tool makes **live SP-API calls**.

**Read this before enabling `sp_api_execute`.** It targets
`sellingpartnerapi-{na,eu,fe}.amazon.com` — **production, hardcoded** — and
takes an arbitrary HTTP `method` plus body, so POST/PUT/PATCH/DELETE are all
reachable. It ships **no `destructiveHint`/`readOnlyHint` annotations, no
confirmation gate, and no dry-run**, and authenticates with long-lived static
LWA secrets in plaintext env vars. An agent that decides to "just fix" a
listing can PATCH a real seller's catalog with nothing standing in the way.
Treat it as a loaded production credential, not a sandbox.

That risk is compounded by the tool being **undocumented**: it appears nowhere
in `llms.txt`'s 1,062 pages and in none of 2026's changelog entries. Amazon
shipped it as an example, not a supported product — so the highest-risk tool
in the ecosystem is also the least documented one. There is no hosted variant.

Reach for the dev assistant when the question is "what does the contract say /
is my client shaped right". Reach for `sp_api_execute` only for **reads** you
have deliberately scoped, and prefer a script for anything that writes.

## Local AI Sandbox — the closest thing to a usable sandbox

In `amzn/selling-partner-api-samples/local-ai-sandbox`. Runs locally on
`localhost:9001`, validates requests against SP-API schemas, and covers ~60
operations across Catalog Items, Listings, Orders, Product Pricing, FBA
Inventory, Reports, Notifications, Data Kiosk and External Fulfillment.

**v2 (commit `94eb5ec3`, 2026-09-03) removed the LLM from response
generation** — a deliberate reversal worth knowing, because the name and much
of the surrounding documentation still imply otherwise. Its README now says it
*"serves responses from deterministic, local operation handlers backed by an
in-process database"* and that *"SP-API endpoints are served locally and do
not call Bedrock."* Amazon's stated reasons: latency, inference cost, and
non-determinism. Bedrock survives only behind `POST /chat`, the Data Generator
that turns a natural-language prompt into test data.

That makes it *better* for validation, not worse: deterministic responses are
what a test suite needs. Requires Node 22+; AWS credentials with Bedrock
access are needed **only** for the Data Generator. Amazon's own docs page for
the sandbox still describes the v1 AI-agent behavior — trust the repo README
over the docs site here.

Use it to burn down contract-shape risk before touching a live account. It
still cannot prove real-world behavior: for that, see the
`amazon-live-validation-checklist` instruction.

## peddler — the Ruby benchmark

`lineofflight/peddler` (v5.5.0, June 2026; 1.5M+ downloads). Auto-generated
nightly from the OpenAPI models, so it tracks contract changes without
human lag. Already ships `orders_2026_01_01` with `search_orders`/`get_order`
and **per-operation rate-limit metadata baked in** (e.g. search_orders
0.0056 rps), plus backoff retries and sandbox switching. Even for a
hand-rolled client, it's free validation: diff its generated models against
your payload assumptions and steal its rate table. Amazon's official SDK
ships no Ruby — peddler is the de-facto reference. (`ericcj/amz_sp_api` and
`patterninc/muffin_man` exist but trail it; skip.)

## amzn/selling-partner-api-samples

Code recipes, deployable AWS sample solutions, and Labs (Jupyter
tutorials). The notification sample solutions are the reference
implementation for SQS/ORDER_CHANGE work. Also hosts the MCP package and
the AI Sandbox above.

## Postman + the hosted sandbox — know the limits

Official Postman collections cover token generation and prod+sandbox calls
— fine for a one-off manual probe. The hosted **static** sandbox
pattern-matches exact canned parameters (Orders is static-only; you must
send the model's example values); the **dynamic** sandbox covers only ~10
APIs (FBA-side mostly). Neither proves real behavior; both are dominated by
the AI Sandbox + `sp_api_execute` for repeatable validation.

## Community MCP servers and marketplace skills — skip

Community SP-API MCP servers (jay-trivedi/amazon_sp_mcp, coaxon/amazon-mcp,
etc.) are thin seller-data-access wrappers with single-digit commit
histories. The Claude-skill marketplaces carry seller-*operations* content
(repricing, PPC, FBA fees), not integration engineering. Nothing there
replaces the `sp-api-integration` action or the official tooling above.
