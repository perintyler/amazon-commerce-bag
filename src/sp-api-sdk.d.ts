/**
 * Amazon's SDK ships per-module `.d.ts` files but no types for its root entry
 * (`package.json` has `main` and no `types`), so `strict` cannot resolve the
 * package. Declaring it here keeps `strict: true` for our own code instead of
 * disabling checks globally.
 *
 * The generated client surface is large and auto-generated from Swagger; typing
 * it by hand would drift from the SDK on every release. The response shaping
 * that actually matters is validated in `client.test.ts` against recorded
 * shapes, which is the check worth having either way.
 */
declare module "@amazon-sp-api-release/amazon-sp-api-sdk-js" {
  // Named exports, matching the SDK's `export * as <Name>SpApi from ...` root.
  // Only the namespaces this bag imports are declared — an undeclared one is a
  // type error, which is the right outcome: it means checking the SDK's actual
  // export name rather than guessing.
  export const Orders_v2026SpApi: any;
  export const SellersSpApi: any;
  export const ListingsitemsSpApi: any;
}
