/**
 * SP-API client construction and the response shaping that carries real risk.
 *
 * The pure functions below are exported and tested directly. Each encodes a
 * documented SP-API behavior where the obvious reading of a response is wrong —
 * see the `amazon-api-domain-facts` instruction in this bag.
 */

import type { ToolContext } from "@barry-rocks/tools";

export const SP_API_SECRETS = ["SP_API_CLIENT_ID", "SP_API_CLIENT_SECRET", "SP_API_REFRESH_TOKEN"];

/**
 * One refresh token covers one region; `marketplaceIds` scopes each call.
 * Region is config, not a secret — it selects an endpoint and grants nothing.
 */
const REGION_ENDPOINTS: Record<string, string> = {
  na: "https://sellingpartnerapi-na.amazon.com",
  eu: "https://sellingpartnerapi-eu.amazon.com",
  fe: "https://sellingpartnerapi-fe.amazon.com",
};

export function endpointForRegion(region?: string): string {
  const key = (region ?? process.env.SP_API_REGION ?? "na").toLowerCase();
  return REGION_ENDPOINTS[key] ?? REGION_ENDPOINTS.na;
}

export interface SpApiCredentials {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

export function probeCredentials(context?: ToolContext): {
  credentials: SpApiCredentials | null;
  missing: string[];
} {
  const missing: string[] = [];
  const clientId = context?.secrets.SP_API_CLIENT_ID;
  const clientSecret = context?.secrets.SP_API_CLIENT_SECRET;
  const refreshToken = context?.secrets.SP_API_REFRESH_TOKEN;

  if (!clientId) missing.push("SP_API_CLIENT_ID");
  if (!clientSecret) missing.push("SP_API_CLIENT_SECRET");
  if (!refreshToken) missing.push("SP_API_REFRESH_TOKEN");
  if (missing.length > 0) return { credentials: null, missing };

  return { credentials: { clientId: clientId!, clientSecret: clientSecret!, refreshToken: refreshToken! }, missing: [] };
}

export function requireCredentials(context?: ToolContext): SpApiCredentials {
  const { credentials, missing } = probeCredentials(context);
  if (!credentials) {
    // Wording matters: packages/tools/src/register.ts matches this shape to
    // append the `barry vault set-env` remediation.
    throw new Error(
      `Missing required secrets: ${missing.join(", ")}. Add them to the active barry's secrets.`,
    );
  }
  return credentials;
}

/**
 * Attach auto-refreshing LWA auth to a generated API client.
 *
 * The SDK's own `enableAutoRetrievalAccessToken` owns the refresh flow, which
 * is the fiddliest part of SP-API and not worth reimplementing.
 */
export function authorize(apiClient: any, creds: SpApiCredentials): void {
  apiClient.enableAutoRetrievalAccessToken(creds.clientId, creds.clientSecret, creds.refreshToken, null);
}

/**
 * `getOrder` wraps its payload: `{"order": {...}}`. `searchOrders` does not.
 * Unwrapping unconditionally would corrupt a response that is already an order,
 * so this only unwraps when the envelope is actually present.
 */
export function unwrapOrder(response: unknown): Record<string, any> | null {
  if (typeof response !== "object" || response === null) return null;
  const r = response as Record<string, any>;
  return r.order && typeof r.order === "object" ? r.order : r;
}

/**
 * SP-API money is `{amount, currencyCode}` with **amount as a STRING**.
 *
 * Parsing to a float invites binary rounding on money; the string is the
 * authoritative value, so it is preserved and a number offered alongside for
 * comparison only.
 */
export function parseMoney(
  money: unknown,
): { amount: string; currencyCode: string | null; asNumber: number } | null {
  if (typeof money !== "object" || money === null) return null;
  const m = money as Record<string, any>;
  if (m.amount === undefined || m.amount === null) return null;
  const amount = String(m.amount);
  const asNumber = Number(amount);
  return {
    amount,
    currencyCode: m.currencyCode ?? null,
    asNumber: Number.isFinite(asNumber) ? asNumber : NaN,
  };
}

/**
 * Without the Direct-to-Consumer Shipping (Restricted) role, buyer PII comes
 * back ABSENT rather than as an error. Code must degrade to null, never raise —
 * an ungranted field is a permissions state, not a failure.
 */
export function optionalField<T>(value: T | undefined | null): T | null {
  return value === undefined || value === null ? null : value;
}

/**
 * Orders become actionable at UNSHIPPED. PENDING orders lack prices and
 * addresses and frequently die cancelled, so creating downstream records from
 * one is a known source of phantom work.
 */
export const ACTIONABLE_STATUSES = ["UNSHIPPED", "PARTIALLY_SHIPPED"] as const;

export function isActionable(status: unknown): boolean {
  return (ACTIONABLE_STATUSES as readonly string[]).includes(String(status));
}
