/**
 * `shapeOrder` against a recorded Orders v2026-01-01 response.
 *
 * This is the function where the v2026 field renames, the string-money parsing
 * and the absent-PII degradation all land, so it is the one most worth pinning.
 * The fixture deliberately includes a PENDING order and an order with no buyer
 * PII, because those are the two shapes that break naive code.
 */

import { describe, it, expect } from "vitest";
import { shapeOrder } from "./tools.js";

/** An UNSHIPPED order with full PII — the happy path. */
const ORDER_WITH_PII = {
  amazonOrderId: "111-2223334-4445556",
  createdTime: "2026-09-01T10:00:00Z",
  lastUpdatedTime: "2026-09-02T11:30:00Z",
  orderStatus: "UNSHIPPED",
  salesChannel: "Amazon.com",
  buyerInfo: { buyerEmail: "buyer@marketplace.amazon.com" },
  shippingAddress: { city: "Seattle", stateOrRegion: "WA" },
  orderTotal: { amount: "42.99", currencyCode: "USD" },
  orderItems: [
    {
      orderItemId: "78921234567890",
      product: { sellerSku: "SKU-ABC", price: { unitPrice: { amount: "21.50", currencyCode: "USD" } } },
      quantityOrdered: 2,
    },
  ],
};

/** Same shape, minus every role-gated field — what an unapproved keyset sees. */
const ORDER_WITHOUT_PII = {
  amazonOrderId: "999-8887776-6665554",
  createdTime: "2026-09-03T09:00:00Z",
  lastUpdatedTime: "2026-09-03T09:05:00Z",
  orderStatus: "PENDING",
  orderItems: [],
};

describe("shapeOrder", () => {
  it("reads the v2026 timestamp fields", () => {
    const o = shapeOrder(ORDER_WITH_PII);
    expect(o.createdTime).toBe("2026-09-01T10:00:00Z");
    expect(o.lastUpdatedTime).toBe("2026-09-02T11:30:00Z");
  });

  // v0 called these purchaseDate/lastUpdatedDate. A decorator written against
  // v0 silently yields undefined on v2026 rather than failing loudly.
  it("does not silently accept the v0 field names", () => {
    const v0Shaped = shapeOrder({
      amazonOrderId: "1",
      purchaseDate: "2026-01-01T00:00:00Z",
      lastUpdatedDate: "2026-01-02T00:00:00Z",
      orderStatus: "UNSHIPPED",
    });
    expect(v0Shaped.createdTime).toBeUndefined();
    expect(v0Shaped.lastUpdatedTime).toBeUndefined();
  });

  it("keeps money as a string and reports its currency", () => {
    const o = shapeOrder(ORDER_WITH_PII);
    expect(o.orderTotal?.amount).toBe("42.99");
    expect(typeof o.orderTotal?.amount).toBe("string");
    expect(o.orderTotal?.currencyCode).toBe("USD");
  });

  it("reads v2026 item fields: quantityOrdered and a genuinely per-unit price", () => {
    const [item] = shapeOrder(ORDER_WITH_PII).items;
    expect(item.quantityOrdered).toBe(2);
    expect(item.sellerSku).toBe("SKU-ABC");
    // Per unit, not the whole line — v0's ItemPrice was the line total.
    expect(item.unitPrice?.amount).toBe("21.50");
  });

  it("marks UNSHIPPED actionable and PENDING not", () => {
    expect(shapeOrder(ORDER_WITH_PII).actionable).toBe(true);
    expect(shapeOrder(ORDER_WITHOUT_PII).actionable).toBe(false);
  });

  // The failure this prevents: raising on an ungranted field, which reads as a
  // broken integration when it is really a permissions state.
  it("degrades absent PII to null instead of throwing", () => {
    expect(() => shapeOrder(ORDER_WITHOUT_PII)).not.toThrow();
    const o = shapeOrder(ORDER_WITHOUT_PII);
    expect(o.buyerEmail).toBeNull();
    expect(o.shipToCity).toBeNull();
    expect(o.orderTotal).toBeNull();
  });

  it("still reports identity and status when PII is absent", () => {
    const o = shapeOrder(ORDER_WITHOUT_PII);
    expect(o.orderId).toBe("999-8887776-6665554");
    expect(o.orderStatus).toBe("PENDING");
  });

  it("handles an order with no items", () => {
    expect(shapeOrder(ORDER_WITHOUT_PII).items).toEqual([]);
  });
});
