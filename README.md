# amazon-commerce bag

Selling on Amazon through the Selling Partner API — the contract facts that
shape an inventory-and-orders integration, and the runbooks for proving them.

Named for the domain rather than the vendor: this is seller-side integration
engineering, not AWS, retail, or anything else under the Amazon name.

Everything reaches an agent through Barry's own primitives, so there is nothing
to read out of this directory by hand:

- **Instructions** (`search_instructions` / `get_instructions`) —
  `amazon-api-domain-facts` is the load-bearing one, and it opens with a
  grounding rule: never answer SP-API questions from memory, because the API
  changes without version bumps and most tutorials are stale (many still
  describe SigV4, dead since 2023). Alongside it:
  `amazon-notifications-upgrade` (polling → SQS),
  `amazon-live-validation-checklist`, and `amazon-mcp-and-tooling`.
- **Tools** (namespace `amazon`) — read-only, and deliberately so. `get_orders`
  searches or fetches on **Orders v2026-01-01** (v0 is removed 2027-03-27);
  `get_listing` reads fulfillment availability and the issues that reveal a
  suppressed listing; `whoami` is the cheapest end-to-end auth proof; `status`
  reports connectivity without throwing.

  There is no write path. `ACCEPTED` is a receipt, not a confirmation, and a
  patch to the wrong fulfillment channel is accepted while doing nothing — so
  writes get their own design, with staging, read-back and explicit approval.

  Credentials (`SP_API_CLIENT_ID`, `SP_API_CLIENT_SECRET`,
  `SP_API_REFRESH_TOKEN`) resolve per-barry from the vault and never reach the
  model. `SP_API_REGION` selects na/eu/fe.

- **Actions** (`find_actions` / `use_action`) — `sp-api-integration` for
  building and debugging, `live-validation` for closing the gate documentation
  cannot, and `amazon-mcp-setup` for wiring up Amazon's official SP-API MCP.

The facts were verified against the OpenAPI models and Amazon's doc pages in
2026-09. Follow the grounding rule rather than trusting them blindly: the
models at `amzn/selling-partner-api-models` are the authority when a doc page
disagrees.
