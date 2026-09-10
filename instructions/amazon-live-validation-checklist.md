---
name: amazon-live-validation-checklist
description: >-
  What SP-API cannot settle without a real seller account. Backs the
  live-validation action.
mode: on-demand
---

# Live-validation checklist

What documentation cannot settle about an SP-API integration. Everything
here needs a real developer seller account (and eventually a production
canary); everything NOT here can and should be settled from the OpenAPI
models and doc pages first — see the grounding rule in the
`amazon-api-domain-facts` instruction.

## Registration and access

- [ ] Your app's roles actually grant the calls you make. A 403 is both
      "expired token" and "missing role" — a live `getMarketplaceParticipations`
      is the cheapest whoami and proves the auth stack end to end.
- [ ] The restricted-role (PII) application, if you need street addresses:
      business verification → data-security assessment → architecture
      review. Weeks to months; answer Amazon's follow-ups within 5 days or
      the case closes. Until approval, confirm empirically which PII fields
      arrive absent — then re-run the same probe after approval and diff.

## Timing that has no published SLA

- [ ] **patch ACCEPTED → visible latency** on `getListingsItem`. Amazon says
      only "minutes to hours". Measure it on your own SKUs — it calibrates
      the deferred-read-back retry ladder (first check, backoff, escalation
      ceiling).
- [ ] Report turnaround (createReport → DONE) at your catalog size.
- [ ] confirmShipment → order reads SHIPPED on getOrder.

## Contract corners the models leave open

- [ ] Whether `orderItems` is returned when `includedData` is omitted on
      v2026 searchOrders/getOrder (no ITEMS enum value exists; presumed
      always included — confirm before relying on it).
- [ ] How EasyShip / Ship+ orders present on v2026: the `programs` enum
      lists neither AMAZON_EASY_SHIP nor FBM_SHIP_PLUS, yet such orders
      exist. Until observed, a confirmShipment 400 handled gracefully is
      the working fallback for Ship+.
- [ ] Merchant-listings-report **cell** vocabularies: column names are
      documented, cell values are not (`fulfillment-channel` values,
      `status` values and their casing). Classify FBA as "non-empty and not
      DEFAULT", compare status case-insensitively, and record what your
      stores actually emit.
- [ ] `packageReferenceId` live behavior on confirmShipment — the spec
      requires it; issues #5094/#4329 (amzn/selling-partner-api-models)
      report live rejections. Watch for it on the first real confirmation.

## The production canary (before any real merchant goes live on writes)

Sandbox cannot prove an order/inventory sync. One owned seller account, one
low-value MFN listing:

- [ ] Mirror import → link → a quantity push lands AND the read-back
      confirms it on the live listing.
- [ ] A self-purchase: order appears at UNSHIPPED with the expected fields,
      flows through your pipeline, and your shipment confirmation is
      visible in Seller Central (with the buyer-notification consequences
      that implies — use a real but throwaway shipment).
- [ ] Your PII retention sweep, run against the canary order with a
      back-dated delivery window: the payload's PII paths null, every local
      copy (transcripts, mirrors) nulls with them, and the order still
      renders.
