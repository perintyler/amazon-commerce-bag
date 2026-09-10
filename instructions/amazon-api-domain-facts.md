---
name: amazon-api-domain-facts
description: >-
  Verified Amazon SP-API contract facts, opening with a grounding rule (never
  answer from memory). Read before writing or debugging SP-API code.
mode: on-demand
---

# Amazon SP-API domain facts

Hard-won, verified facts about Amazon's Selling Partner API. Each was
confirmed against the official OpenAPI models
(`github.com/amzn/selling-partner-api-models`) or Amazon's doc pages while
building a production inventory-and-orders integration (2026-09). Cite this
file instead of re-researching.

## Grounding rule (read first)

Never answer SP-API questions from memory. The API changes without version
bumps and most third-party tutorials are stale (many still describe SigV4 or
Orders v0). Ground every contract claim in:

- `https://developer-docs.amazon/sp-api/llms.txt` — Amazon's agent-oriented
  index of every doc page. Append `.md` to any doc URL for clean markdown.
  Note the host: `developer-docs.amazon.com` 301s to `developer-docs.amazon`;
  fetchers that don't follow cross-host redirects fail on the `.com` form.
- The OpenAPI models at `raw.githubusercontent.com/amzn/selling-partner-api-models/main/models/...`
  — the authority when doc pages and models disagree, and the only source for
  exact field paths and enums.

## Auth: LWA only (the gating stale-advice trap)

**SigV4 and AWS IAM are dead** (removed Oct 2023). Any tutorial demanding an
IAM role ARN or request signing is stale. The whole stack is:

- Client id + client secret + per-seller refresh token → POST
  `https://api.amazon.com/auth/o2/token` → 1-hour access token, sent in the
  `x-amz-access-token` header. That's it. LWA has no sandbox.
- Refresh tokens are long-lived, carry no expiry, and are **not rotated** on
  refresh. They die only by revocation: **`invalid_grant` on refresh is the
  one and only disconnect signal** — there is no revocation webhook. Treat it
  as "the merchant must reconnect"; treat every other token-endpoint failure
  as loud-but-not-a-disconnect.
- SP-API answers **403** (not just 401) for a bad/expired access token — and
  403 is also what a missing role returns. Refresh-and-retry-once on both
  codes; a second rejection after a successful refresh is a real error.
- Consent URL: `{sellerCentral}/apps/authorize/consent?application_id=…&state=…`
  (+`&version=beta` while the app is a Draft). The redirect back carries
  `spapi_oauth_code` (**expires in ~5 minutes — exchange immediately**) and
  `selling_partner_id` (the seller's identity, and the `{sellerId}` path
  segment for Listings calls).
- One refresh token covers one **region** (NA/EU/FE); `marketplaceIds` scopes
  each call. A seller in two regions needs two authorizations.
- **Unlisted public apps cap at 25 seller authorizations.** The Selling
  Partner Appstore listing lifts it; publication takes 3–4 weeks after
  approval. Plan it before merchant #20.
- OAuth security is on you: sign and expire the `state`, bind it to the
  initiating browser session, make it single-use, and refuse a reconnect that
  names a different `selling_partner_id` than the one already bound.

## PII and restricted roles

On Orders v2026 there is **no Restricted Data Token** — buyer PII is
role-gated and server-redacted. Without the **Direct-to-Consumer Shipping
(Restricted)** role, `searchOrders` succeeds but buyer name/street
address/postal code come back **absent** (not errors). Code must degrade to
nil, never raise. The restricted role costs: Amazon's data-security
assessment, an architecture review, annual re-approval, and the Data
Protection Policy — including **purging order PII ≤30 days after delivery**
(sweep every local copy: the source payload, API transcripts you persisted,
and any mirror rows — not just the obvious one).

## Orders API v2026-01-01 (verified contract)

v0's read operations are deprecated (removed March 2027). Build reads on
v2026; the field names differ from v0 in ways that silently break decorators:

- Timestamps: **`createdTime` / `lastUpdatedTime`** (not
  purchaseDate/lastUpdatedDate).
- Items are embedded (no per-order item fetch). Each item:
  **`quantityOrdered`** (not quantity), **`product.sellerSku`** (not
  product.sku), unit price at **`product.price.unitPrice`** — genuinely per
  unit, unlike v0's whole-line ItemPrice.
- **`getOrder` wraps its body: `{"order": {...}}`.** Unwrap it.
- Money is `{amount, currencyCode}` with **amount as a string** — parse as
  decimal, not float.
- Proceeds breakdown types: ITEM / SHIPPING / TAX / DELIVERY_TIP /
  **PROMOTION** (there is no DISCOUNT type). TAX and PAYMENT `includedData`
  sets were added post-launch — easy to miss.
- Status vocabulary: PENDING_AVAILABILITY, PENDING, UNSHIPPED,
  PARTIALLY_SHIPPED, SHIPPED, CANCELLED, UNFULFILLABLE.
  **INVOICE_UNCONFIRMED does not exist on v2026** (v0-only). CANCELLED is
  double-L. Orders become actionable at **UNSHIPPED** — Pending orders lack
  prices and addresses and frequently die cancelled; never create downstream
  records from them.
- `searchOrders`: exactly ONE of `createdAfter`/`lastUpdatedAfter` is
  **required** (not merely mutually exclusive). `fulfilledBy` and
  `includedData` are csv-format arrays. Rate: **0.0056 rps** (~1 call per 3
  minutes, burst 20) — a 5-minute poll cadence fits; anything chattier needs
  notifications. The pagination token **expires after 24h**; never persist it.
- **`confirmShipment` stays on v0** (POST
  `/orders/v0/orders/{id}/shipmentConfirmation`, 204 No Content, 2 rps). It
  is not deprecated; v2026 has no write operations. Re-posting the same
  `packageReferenceId` **edits** the package — that's how tracking corrections
  work. Requires carrierCode + trackingNumber + shipDate + per-item
  quantities; `carrierName` required when carrierCode is `Other` (unmapped
  carriers earn the seller no Valid Tracking Rate credit — map the common
  ones). Known live-behavior reports of `packageReferenceId` rejections:
  amzn/selling-partner-api-models issues #5094 and #4329.

## Listings Items (the quantity write path)

- One write shape: `PATCH /listings/2021-08-01/items/{sellerId}/{sku}` with
  `{productType: "PRODUCT", patches: [{op: "merge", path:
  "/attributes/fulfillment_availability", value: [{fulfillment_channel_code:
  "DEFAULT", quantity: N}]}]}`. All verified: `merge` is a real op enum,
  `PRODUCT` is the documented generic productType for offer-only patches (no
  Product Type Definitions call needed), and `merge` protects the seller's
  handling-time/restock siblings where `replace` would drop them.
- **PATCH-only, never PUT**: `putListingsItem` drops attributes omitted from
  the submission. Price lives in a separate top-level attribute
  (`purchasable_offer`) that a fulfillment_availability patch cannot touch —
  the safe architecture makes price unreachable by construction.
- **ACCEPTED is a receipt, not a confirmation.** Processing is async
  (minutes to hours, no SLA, no submission-status API). Silent failure modes
  — suppressed listings, missing compliance attributes, FBA conversion — all
  present as "ACCEPTED, then nothing". A deferred read-back
  (`getListingsItem` with `includedData=fulfillmentAvailability,issues`,
  retry ladder, escalation when the number never appears) is mandatory, and
  concurrent pushes need a generation token so an older confirmation can't
  clobber a newer push's pending state.
- **FBA hazard**: patching the DEFAULT channel on an FBA SKU is ACCEPTED and
  silently does nothing (or manufactures a dual-channel listing). Hard-gate
  FBA SKUs out of the write path; classify FBA as "fulfillment channel is
  non-empty and not DEFAULT" (the AMAZON_NA/EU/JP suffixes are
  region-dependent folklore, not a documented enum).
- Rate limits are per-operation token buckets, ~5 rps per seller-app pair
  for Listings ops. 429 = QuotaExceeded, retryable; the
  `x-amzn-RateLimit-Limit` header is unreliable on 429 — self-contained
  backoff only. **Retryable errors must reach the retry policy** — swallowing
  a 429 into a "rejected" result turns one transient rate limit into a
  permanently blocked row.

## Reports (the only full listing enumeration)

- `searchListingsItems` hard-caps at **1,000 SKUs total** — it cannot
  enumerate a catalog. `GET_MERCHANT_LISTINGS_ALL_DATA` via the Reports API
  is the only complete path: createReport → poll `processingStatus`
  (IN_QUEUE/IN_PROGRESS/DONE/CANCELLED/FATAL) → getReportDocument →
  download the presigned URL (no auth headers; gunzip when
  `compressionAlgorithm` says GZIP — the key is *absent*, not null, when
  uncompressed).
- The file is tab-delimited UTF-8 **with a 3-byte BOM** — strip it or the
  first header parses as `﻿item-name`. **Parse by header name, never by
  position**: several legacy columns return the literal string
  "Deprecated column".
- **Headers are localized per store**, and a cached report can come back in
  a different locale than requested. Guard for it: data rows under an
  unrecognized header row must ALERT, never silently parse to zero rows —
  and a zero-row parse against a populated mirror must never drive a
  reconcile (it reads as "every listing vanished" and mass-deletes).
- One marketplace per report — extra `marketplaceIds` are **silently
  truncated** to the first, not rejected. `createReport` refills at ~1/min
  per seller: one report per import run, stagger full syncs.

## Sandbox reality

The hosted static sandbox pattern-matches canned request/responses — Orders
is static-only — and cannot prove behavior. LWA has no sandbox at all. For
schema-accurate local validation use the **Local AI Sandbox** from
`amzn/selling-partner-api-samples` (see the `amazon-mcp-and-tooling`
instruction); for the things only production can answer, work through
`amazon-live-validation-checklist` with a real dev seller account.

## SDKs

Amazon's official SDK ships **no Ruby** — hand-rolled clients are the norm
there. `lineofflight/peddler` is the de-facto Ruby reference: auto-generated
nightly from the OpenAPI models, with per-operation rate-limit metadata baked
in. See the `amazon-mcp-and-tooling` instruction.
