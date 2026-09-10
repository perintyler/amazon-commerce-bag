/**
 * Amazon Selling Partner API read tools.
 *
 * Read-only by construction. The hazards this bag documents — an ACCEPTED
 * receipt that never applied, an FBA patch that silently does nothing — all
 * live on the write path, so there is no write path here.
 *
 * Reads are built on Orders **v2026-01-01**: v0's read operations are removed
 * 2027-03-27, after which they fail rather than warn.
 */

import { defineTool, type ToolContext } from "@barry-rocks/tools";
import { z } from "zod";
import {
  Orders_v2026SpApi,
  SellersSpApi,
  ListingsitemsSpApi,
} from "@amazon-sp-api-release/amazon-sp-api-sdk-js";
import {
  SP_API_SECRETS,
  authorize,
  endpointForRegion,
  isActionable,
  optionalField,
  parseMoney,
  probeCredentials,
  requireCredentials,
  unwrapOrder,
} from "./client.js";

/** Shape one v2026 order into the fields a channel integration actually uses. */
function shapeOrder(raw: Record<string, any>) {
  return {
    orderId: raw.amazonOrderId ?? raw.orderId,
    // v2026 renamed these from v0's purchaseDate/lastUpdatedDate.
    createdTime: raw.createdTime,
    lastUpdatedTime: raw.lastUpdatedTime,
    orderStatus: raw.orderStatus,
    actionable: isActionable(raw.orderStatus),
    salesChannel: optionalField(raw.salesChannel),
    // Absent without the restricted PII role — null, never an error.
    buyerEmail: optionalField(raw.buyerInfo?.buyerEmail),
    shipToCity: optionalField(raw.shippingAddress?.city),
    orderTotal: parseMoney(raw.orderTotal),
    items: (raw.orderItems ?? []).map((it: any) => ({
      orderItemId: it.orderItemId,
      sellerSku: optionalField(it.product?.sellerSku),
      // v2026: quantityOrdered, and unitPrice is genuinely per unit.
      quantityOrdered: it.quantityOrdered,
      unitPrice: parseMoney(it.product?.price?.unitPrice),
    })),
  };
}

export const status = defineTool({
  namespace: "amazon",
  access: "read",
  name: "status",
  description: "Check SP-API connectivity and which region endpoint is configured.",
  secrets: SP_API_SECRETS,
  schema: {},
  // Structured verdict rather than a throw: an agent must be able to tell
  // "no credentials yet" from "the API is broken".
  handler: async (_params, context?: ToolContext) => {
    const endpoint = endpointForRegion();
    const { credentials, missing } = probeCredentials(context);
    if (!credentials) return { status: "disconnected", endpoint, missing };
    try {
      const api = new SellersSpApi.SellersApi(new SellersSpApi.ApiClient(endpoint));
      authorize(api.apiClient, credentials);
      await api.getMarketplaceParticipations();
      return { status: "connected", endpoint };
    } catch (e) {
      return { status: "error", endpoint, error: e instanceof Error ? e.message : String(e) };
    }
  },
  cliFormat: (r: any) =>
    r.status === "connected"
      ? `connected (${r.endpoint})`
      : r.status === "disconnected"
        ? `disconnected (${r.endpoint}) — missing: ${r.missing.join(", ")}`
        : `error (${r.endpoint}): ${r.error}`,
});

export const whoami = defineTool({
  namespace: "amazon",
  access: "read",
  name: "whoami",
  description:
    "List the marketplaces this seller participates in. The cheapest end-to-end proof that the " +
    "auth stack works — a 403 here means either an expired token or a missing role.",
  secrets: SP_API_SECRETS,
  schema: {},
  handler: async (_params, context?: ToolContext) => {
    const creds = requireCredentials(context);
    const api = new SellersSpApi.SellersApi(new SellersSpApi.ApiClient(endpointForRegion()));
    authorize(api.apiClient, creds);
    const res: any = await api.getMarketplaceParticipations();
    const rows = (res?.payload ?? []).map((p: any) => ({
      marketplaceId: p.marketplace?.id,
      name: p.marketplace?.name,
      countryCode: p.marketplace?.countryCode,
      isParticipating: p.participation?.isParticipating,
    }));
    return { count: rows.length, marketplaces: rows };
  },
  cliFormat: (r: any) =>
    r.marketplaces.map((m: any) => `${m.marketplaceId}  ${m.countryCode}  ${m.name}`).join("\n") ||
    "no marketplaces",
});

export const getOrders = defineTool({
  namespace: "amazon",
  access: "read",
  name: "get_orders",
  description:
    "Search orders on Orders v2026-01-01, or fetch one by id. Exactly one of createdAfter or " +
    "lastUpdatedAfter is REQUIRED by the API when searching. Orders become actionable at " +
    "UNSHIPPED — PENDING ones lack prices and addresses and frequently die cancelled.",
  secrets: SP_API_SECRETS,
  schema: {
    marketplaceIds: z.array(z.string()).min(1).describe("Marketplace ids to scope the query, e.g. ATVPDKIKX0DER"),
    orderId: z.string().optional().describe("Fetch a single order by AmazonOrderId (skips the search path)"),
    createdAfter: z.string().optional().describe("ISO-8601; mutually exclusive with lastUpdatedAfter"),
    lastUpdatedAfter: z.string().optional().describe("ISO-8601; mutually exclusive with createdAfter"),
    includedData: z
      .array(z.string())
      .optional()
      .describe("Extra data sets, e.g. BUYER, RECIPIENT, PROCEEDS, TAX, PAYMENT"),
  },
  handler: async (
    { marketplaceIds, orderId, createdAfter, lastUpdatedAfter, includedData },
    context?: ToolContext,
  ) => {
    const creds = requireCredentials(context);
    const endpoint = endpointForRegion();

    if (orderId) {
      const api = new Orders_v2026SpApi.GetOrderApi(new Orders_v2026SpApi.ApiClient(endpoint));
      authorize(api.apiClient, creds);
      const res: any = await api.getOrder(orderId, includedData ? { includedData } : {});
      const order = unwrapOrder(res);
      return { count: order ? 1 : 0, orders: order ? [shapeOrder(order)] : [] };
    }

    // The API rejects a search with neither, and with both.
    if (!createdAfter && !lastUpdatedAfter) {
      throw new Error(
        "searchOrders requires exactly one of createdAfter or lastUpdatedAfter — neither was given.",
      );
    }
    if (createdAfter && lastUpdatedAfter) {
      throw new Error(
        "searchOrders accepts exactly one of createdAfter or lastUpdatedAfter — both were given.",
      );
    }

    const api = new Orders_v2026SpApi.SearchOrdersApi(new Orders_v2026SpApi.ApiClient(endpoint));
    authorize(api.apiClient, creds);
    const opts: Record<string, unknown> = { marketplaceIds };
    if (createdAfter) opts.createdAfter = createdAfter;
    if (lastUpdatedAfter) opts.lastUpdatedAfter = lastUpdatedAfter;
    if (includedData) opts.includedData = includedData;

    const res: any = await api.searchOrders(opts);
    const orders = (res?.orders ?? res?.payload?.orders ?? []).map(shapeOrder);
    return {
      count: orders.length,
      // Never persist this: the pagination token expires after 24h.
      nextToken: optionalField(res?.nextToken ?? res?.payload?.nextToken),
      orders,
    };
  },
  cliFormat: (r: any) =>
    r.orders.length === 0
      ? "no orders"
      : r.orders
          .map((o: any) => `${o.orderId}  ${o.orderStatus}${o.actionable ? " *" : ""}  ${o.items.length} item(s)`)
          .join("\n"),
});

export const getListing = defineTool({
  namespace: "amazon",
  access: "read",
  name: "get_listing",
  description:
    "Read a listing by seller SKU, including fulfillment availability and any issues. " +
    "Issues are how a suppressed listing becomes visible — a listing can be live in the API and " +
    "unbuyable on site.",
  secrets: SP_API_SECRETS,
  schema: {
    sellerId: z.string().min(1).describe("The selling partner id (from the OAuth callback)"),
    sku: z.string().min(1).describe("The seller SKU"),
    marketplaceIds: z.array(z.string()).min(1).describe("Marketplace ids to scope the read"),
  },
  handler: async ({ sellerId, sku, marketplaceIds }, context?: ToolContext) => {
    const creds = requireCredentials(context);
    const api = new ListingsitemsSpApi.ListingsApi(new ListingsitemsSpApi.ApiClient(endpointForRegion()));
    authorize(api.apiClient, creds);
    const res: any = await api.getListingsItem(sellerId, sku, marketplaceIds, {
      includedData: ["summaries", "fulfillmentAvailability", "issues"],
    });
    const fulfillment = res?.fulfillmentAvailability ?? [];
    return {
      sku,
      status: optionalField(res?.summaries?.[0]?.status),
      // Classify FBA as "channel is non-empty and not DEFAULT" — the
      // AMAZON_NA/EU/JP suffixes are region-dependent folklore, not an enum.
      fulfillment: fulfillment.map((f: any) => ({
        channel: f.fulfillmentChannelCode,
        quantity: f.quantity,
        isFba: Boolean(f.fulfillmentChannelCode) && f.fulfillmentChannelCode !== "DEFAULT",
      })),
      issues: (res?.issues ?? []).map((i: any) => ({
        code: i.code,
        message: i.message,
        severity: i.severity,
        enforcementActions: i.enforcements?.actions?.map((a: any) => a.action) ?? [],
      })),
    };
  },
  cliFormat: (r: any) => {
    const fulfil = r.fulfillment
      .map((f: any) => `${f.channel}=${f.quantity}${f.isFba ? " (FBA)" : ""}`)
      .join(" ");
    const issues = r.issues.length ? `\n  ${r.issues.length} issue(s): ${r.issues.map((i: any) => i.code).join(", ")}` : "";
    return `${r.sku}  status=${r.status ?? "n/a"}  ${fulfil}${issues}`;
  },
});
