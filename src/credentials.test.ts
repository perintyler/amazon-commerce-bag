/**
 * Credential detection.
 *
 * Needs no real keys — these functions only inspect the ToolContext. The error
 * WORDING is load-bearing: Barry's tool runtime (packages/tools/src/register.ts)
 * regex-matches "Missing required secrets:" to append the `barry vault set-env`
 * remediation. Reword it and the agent gets a dead end instead of a fix.
 */

import { describe, it, expect } from "vitest";
import { probeCredentials, requireCredentials } from "./client.js";

const FULL = {
  secrets: {
    SP_API_CLIENT_ID: "client-id",
    SP_API_CLIENT_SECRET: "client-secret",
    SP_API_REFRESH_TOKEN: "refresh-token",
  },
};

describe("probeCredentials", () => {
  it("reports every missing secret at once, not just the first", () => {
    const { credentials, missing } = probeCredentials({ secrets: {} });
    expect(credentials).toBeNull();
    expect(missing).toEqual([
      "SP_API_CLIENT_ID",
      "SP_API_CLIENT_SECRET",
      "SP_API_REFRESH_TOKEN",
    ]);
  });

  it("names only what is actually absent", () => {
    const { missing } = probeCredentials({ secrets: { SP_API_CLIENT_ID: "x" } });
    expect(missing).toEqual(["SP_API_CLIENT_SECRET", "SP_API_REFRESH_TOKEN"]);
  });

  it("returns the credentials when all three are present", () => {
    const { credentials, missing } = probeCredentials(FULL);
    expect(missing).toEqual([]);
    expect(credentials?.clientId).toBe("client-id");
    expect(credentials?.refreshToken).toBe("refresh-token");
  });

  it("treats a missing context as missing everything, without throwing", () => {
    expect(() => probeCredentials(undefined)).not.toThrow();
    expect(probeCredentials(undefined).missing).toHaveLength(3);
  });
});

describe("requireCredentials", () => {
  it("throws with the exact wording Barry matches for remediation", () => {
    expect(() => requireCredentials({ secrets: {} })).toThrow(/^Missing required secrets: /);
  });

  it("names the missing secrets in the message", () => {
    expect(() => requireCredentials({ secrets: { SP_API_CLIENT_ID: "x" } })).toThrow(
      /SP_API_CLIENT_SECRET, SP_API_REFRESH_TOKEN/,
    );
  });

  it("returns credentials rather than throwing when configured", () => {
    expect(requireCredentials(FULL).clientSecret).toBe("client-secret");
  });

  // A secret must never be echoed into an error an agent may relay onward.
  it("does not leak a secret value into the error message", () => {
    try {
      requireCredentials({ secrets: { SP_API_CLIENT_ID: "super-secret-value" } });
    } catch (e) {
      expect(String(e)).not.toContain("super-secret-value");
    }
  });
});
