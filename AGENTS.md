<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.

## What Lovable manages

Rules outside this block are the project's own. Change the pieces below in
Lovable, not by hand. With the [Lovable MCP](https://mcp.lovable.dev)
connected, `send_message` asks Lovable to do it; otherwise ask the user to
use the editor.

- **Database.** Do not add or edit `supabase/migrations/` or `drizzle/`.
  Ask Lovable to change the schema.
- **Generated files.** Do not edit a file whose header says it is automatically
  generated.
- **AI gateway.** Keep model calls on Lovable's gateway, and keep
  `LOVABLE_API_KEY` out of browser code.
- **Connectors.** Lovable provides native connectors. `list_connectors` shows
  which are enabled; `add_connector` only returns the dashboard link. When a
  connector is enabled, calls go through the connector gateway and need
  `LOVABLE_API_KEY`. When Lovable does not provide one, users can bring their
  own key and store it in Secrets.
- **Secrets.** Lovable manages them. Do not put secret values in the repo.
<!-- LOVABLE:END -->

## Application architecture

- Keep TanStack Start file-based routes and Tailwind v4 CSS-first semantic tokens; this preserves the template's supported build and runtime.
- Place internal pages under the authenticated pathless layout and keep login, password recovery and token evaluation public; business endpoints must independently verify identity and permissions.
- Store protected roles in user_roles, never editable profiles or metadata; grant roles and account allocations only through authorized provisioning, not automatic sign-in.
- Use shared Atlas brand, navigation, empty-section and authentication components to keep the staged pages consistent.
- Keep occurrence transitions and business-calendar calculations in PostgreSQL RPCs; server functions authenticate each call and the UI renders available transitions without duplicating gates.
- Capture resolution deadlines and milestones per SLA cycle in the database; reopening resets only the resolution cycle and preserves first response and past breaches.
- Keep customer contestations separate from SLA state; server-only submission and role-checked transactional review prevent automatic or unauthorized reopening.
- Use database-backed Node-environment tests for concrete business rules and isolated fictitious auth users for permission checks; never alter a real user's permissions or password for tests.
- Send app emails only from feature-specific server handlers through the managed template helper; managed delivery owns retries and suppression, so no email queues or generic send endpoints are created.
- Keep customer evaluation writes in a token-validated, row-locked database operation; public handlers project only the customer summary and persist rate limits without exposing token hashes.
- Store evidence in a private bucket with account-scoped object policies; validate upload size and format server-side and enforce attachment counts under an occurrence row lock.
