# amazon bag

Amazon SP-API integration knowledge — the contract facts that shape an
inventory-and-orders integration, and the runbooks for proving them. No tools,
servers, or credentials; prose and procedures.

Everything reaches an agent through Barry's own primitives, so there is nothing
to read out of this directory by hand:

- **Instructions** (`search_instructions` / `get_instructions`) —
  `amazon-api-domain-facts` is the load-bearing one, and it opens with a
  grounding rule: never answer SP-API questions from memory, because the API
  changes without version bumps and most tutorials are stale (many still
  describe SigV4, dead since 2023). Alongside it:
  `amazon-notifications-upgrade` (polling → SQS),
  `amazon-live-validation-checklist`, and `amazon-mcp-and-tooling`.
- **Actions** (`find_actions` / `use_action`) — `sp-api-integration` for
  building and debugging, `live-validation` for closing the gate documentation
  cannot, and `amazon-mcp-setup` for wiring up Amazon's official SP-API MCP.

The facts were verified against the OpenAPI models and Amazon's doc pages in
2026-09. Follow the grounding rule rather than trusting them blindly: the
models at `amzn/selling-partner-api-models` are the authority when a doc page
disagrees.
