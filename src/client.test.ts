/**
 * Tests for the SP-API semantics that are wrong by default.
 *
 * LWA has no sandbox at all, so nothing here talks to Amazon. That is the
 * point: the risk is not "did the call succeed" but "did we read the response
 * correctly", and a recorded shape pins exactly that.
 */

import { describe, it, expect } from "vitest";
import {
  endpointForRegion,
  isActionable,
  optionalField,
  parseMoney,
  unwrapOrder,
} from "./client.js";

describe("unwrapOrder", () => {
  // getOrder wraps; searchOrders does not.
  it("unwraps the getOrder envelope", () => {
    const wrapped = { order: { amazonOrderId: "111-222", orderStatus: "UNSHIPPED" } };
    expect(unwrapOrder(wrapped)?.amazonOrderId).toBe("111-222");
  });

  it("leaves an already-unwrapped order alone", () => {
    const bare = { amazonOrderId: "333-444", orderStatus: "SHIPPED" };
    expect(unwrapOrder(bare)?.amazonOrderId).toBe("333-444");
  });

  // Unwrapping unconditionally would return undefined for a bare order —
  // the failure this asymmetry exists to prevent.
  it("does not lose fields when there is no envelope", () => {
    expect(unwrapOrder({ amazonOrderId: "x" })).not.toBeUndefined();
  });

  it("handles non-objects", () => {
    expect(unwrapOrder(null)).toBeNull();
    expect(unwrapOrder("nope")).toBeNull();
  });
});

describe("parseMoney", () => {
  // The amount is a STRING on the wire. Preserving it is the whole point.
  it("preserves the exact string amount", () => {
    const m = parseMoney({ amount: "19.99", currencyCode: "USD" });
    expect(m?.amount).toBe("19.99");
    expect(typeof m?.amount).toBe("string");
    expect(m?.currencyCode).toBe("USD");
  });

  it("keeps precision a float would lose", () => {
    // 0.1 + 0.2 !== 0.3 in binary floating point; the string is authoritative.
    const m = parseMoney({ amount: "1234567.89", currencyCode: "JPY" });
    expect(m?.amount).toBe("1234567.89");
  });

  it("offers a number for comparison only", () => {
    expect(parseMoney({ amount: "5.00", currencyCode: "USD" })?.asNumber).toBe(5);
  });

  it("returns null rather than zero when money is absent", () => {
    expect(parseMoney({})).toBeNull();
    expect(parseMoney(null)).toBeNull();
    expect(parseMoney({ currencyCode: "USD" })).toBeNull();
  });
});

describe("isActionable", () => {
  // Creating downstream records from a PENDING order is a known source of
  // phantom work: they lack prices and addresses and often die cancelled.
  it("treats UNSHIPPED and PARTIALLY_SHIPPED as actionable", () => {
    expect(isActionable("UNSHIPPED")).toBe(true);
    expect(isActionable("PARTIALLY_SHIPPED")).toBe(true);
  });

  it("does NOT treat PENDING as actionable", () => {
    expect(isActionable("PENDING")).toBe(false);
    expect(isActionable("PENDING_AVAILABILITY")).toBe(false);
  });

  it("does not treat terminal statuses as actionable", () => {
    expect(isActionable("SHIPPED")).toBe(false);
    expect(isActionable("CANCELLED")).toBe(false);
    expect(isActionable(undefined)).toBe(false);
  });
});

describe("optionalField", () => {
  it("passes real values through, including falsy ones", () => {
    expect(optionalField("a@b.com")).toBe("a@b.com");
    expect(optionalField(0)).toBe(0);
  });

  // Role-gated PII arrives absent, not as an error.
  it("normalizes absent to null", () => {
    expect(optionalField(undefined)).toBeNull();
    expect(optionalField(null)).toBeNull();
  });
});

describe("endpointForRegion", () => {
  it("maps the three SP-API regions", () => {
    expect(endpointForRegion("na")).toContain("sellingpartnerapi-na");
    expect(endpointForRegion("eu")).toContain("sellingpartnerapi-eu");
    expect(endpointForRegion("fe")).toContain("sellingpartnerapi-fe");
  });

  it("is case-insensitive and defaults to na", () => {
    expect(endpointForRegion("EU")).toContain("sellingpartnerapi-eu");
    expect(endpointForRegion("nonsense")).toContain("sellingpartnerapi-na");
  });
});
