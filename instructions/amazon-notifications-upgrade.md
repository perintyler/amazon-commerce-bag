---
name: amazon-notifications-upgrade
description: >-
  The SP-API polling-to-SQS migration — what to subscribe to, setup, consumer
  rules. Read when push beats polling.
mode: on-demand
---

# The polling → SQS notifications upgrade

Polling-first is a legitimate launch architecture: `searchOrders` at
~1 call/3 minutes sustains a 5-minute cadence, and a deferred read-back
covers write confirmation. Move to notifications when order latency
matters, when seller count multiplies the polling spend, or when the
read-back ladder's API cost outgrows a push signal.

## What to subscribe to

- **ORDER_CHANGE** (payload v1.0) — order lifecycle. Its Summary carries
  the order's items (`OrderItemId`, `SellerSKU`, quantities) so no follow-up
  item fetch is needed, plus ship-by dates and `FulfillmentType`. No PII —
  an address still needs an API read. `ORDER_STATUS_CHANGE` is dead
  (removed July 2026); don't build on it.
- **LISTINGS_ITEM_MFN_QUANTITY_CHANGE** — the closed loop that replaces
  read-back polling: patch → await the notification carrying the new
  quantity → confirmed. Note its payload omits MarketplaceId.
- **LISTINGS_ITEM_ISSUES_CHANGE** (2023-12-13 version) — how you learn a
  listing was suppressed (`EnforcementActions`: SEARCH_SUPPRESSED,
  LISTING_SUPPRESSED, ATTRIBUTE_SUPPRESSED, CATALOG_ITEM_REMOVED).

## Setup shape

1. Grant SP-API's principal (`arn:aws:iam::437568002678:root`) write access
   to your SQS queue — **standard queue only, FIFO is unsupported** (+ KMS
   GenerateDataKey/Decrypt if SSE).
2. `createDestination` — grantless, app-level, once.
3. `createSubscription` — per seller, needs the seller's authorization.
   **Use `processingDirective.eventFilter` at subscription time**
   (`eventFilterType: ORDER_CHANGE`, `orderChangeTypes: [OrderStatusChange,
   BuyerRequestedChange]`) — server-side filtering that cuts volume before
   it reaches the queue. `eventFilter` and the newer CEL `filterExpression`
   are mutually exclusive; `marketplaceIds` is NOT a supported ORDER_CHANGE
   filter, so filter marketplace client-side.

## Consumer rules (all officially documented)

- Delivery is at-least-once AND out-of-order: dedupe on
  `NotificationMetadata.NotificationId`, gate every state write on a stored
  last-updated timestamp, make handlers idempotent.
- Expect enum values the Orders API doesn't have (e.g. `UpComing`) — handle
  unknowns without raising.
- **Keep the reconciliation poll.** Notifications drop and subscriptions
  break silently; a widened-interval `lastUpdatedAfter` sweep (with an
  overlap window) remains the safety net, not an either/or.
