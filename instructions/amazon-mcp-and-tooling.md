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

## Amazon's official MCP server — install this first

`@amazon-sp-api-release/sp-api-dev-mcp` (announced May 2026,
amzn/selling-partner-api-samples discussion #382). Node 20+, runs locally via
`npx`, plugs into Claude Code / Cursor / VS Code. Two servers in one package:

- **sp-api-dev-assistant-mcp-server** — natural-language search over the
  authoritative docs, endpoint exploration, code generation in 5 languages,
  **API version migration assistance**, and a "well-architected review" that
  grades an integration across 9 pillars including error handling and
  rate-limit optimization. Needs no credentials.
- **sp-api-workflow-mcp-server** — multi-step workflows on an Amazon State
  Language engine with OAuth token management. Its `sp_api_execute` tool
  makes **live SP-API calls** — the fast path for one-off probes that would
  otherwise be throwaway scripts.

Reach for the dev assistant when the question is "what does the contract
say / is my client shaped right"; reach for `sp_api_execute` when the
question is "what does production actually return for THIS seller".

## Local AI Sandbox — schema-accurate validation without a seller account

In `amzn/selling-partner-api-samples` (the AI-sandbox directory; the repo
root links it). Locally deployed (`localhost:9001`), validates every request
against the SP-API **OpenAPI schemas** with detailed errors, and simulates
responses via a Bedrock-backed agent that generates dynamic, corner-case
test data — far past the static sandbox's canned responses. Requires Node
22+ and AWS credentials with Bedrock access. Amazon recommends it for all
solution providers. Use it to burn down contract-shape risk before touching
a live account.

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
