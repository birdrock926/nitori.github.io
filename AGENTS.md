# Project Operations & Knowledge Base (AUTO-GENERATED)

> **MANDATORY WORKFLOW RULE**  
> Whenever you modify any file in this repository, you **must** review this knowledge base and append any new discoveries, fixes, regressions, or behavioural changes to this `AGENTS.md`. Treat it as the single source of truth for future agents and humans. Always keep entries chronologically ordered and exhaustive.

## Repository Snapshot (October 2025 migration aftermath)

This monorepo powers the birdrock926 publishing stack after the migration from Remark42 to the VirtusLab Comments plugin for Strapi.

- **`cms/`** – Strapi v5.26 application with numerous customisations:
  - VirtusLab `strapi-plugin-comments@3.1.0` (patched to make `author.email` optional and to canonicalise abuse reports).
  - Local patches applied through `patch-package` (notably `styled-components@6.1.19` to keep the default export callable; see `cms/patches/`).
  - Post content type enriched with:
    - `commentDefaultAuthor` fallback handling and lifecycle hooks that trim/normalise names.
    - Dynamic zone `blocks` with custom populate logic, typography scaling metadata, rich gallery handling, per-block font scales.
  - Bootstrap scripts enforce Public/Authenticated role permissions for comment read/create/report, migrate legacy comment relations to Strapi document IDs, and run styled-components harmonisation checks (`cms/scripts/*.mjs`).
  - Custom **Typography Scale** plugin under `cms/src/plugins/typography-scale/` registering a slider-based custom field for adjusting rich-text block font sizes. Depends on `@strapi/design-system` components and local helpers.
  - Extended Strapi comment extension (`cms/src/extensions/comments/strapi-server.js`) normalises report payloads, populates relations, and patches VirtusLab behaviours.
  - Environment enforcement via `cms/scripts/ensure-env.mjs` and sample config in `cms/.env.sample` (includes VirtusLab comments credentials, mailer settings, etc.).

- **`web/`** – Astro-based front-end:
  - Comments UI completely rewritten in React (`web/src/components/comments/CommentsApp.tsx` + associated lib files) with pagination, moderation badges, abuse reporting, optional email notifications, collapsible long comments, and comment guidelines.
  - Post template pulls Strapi data through `web/src/lib/strapi.ts`, supporting document IDs, gallery hydration, markdown image sanitisation, typography scale classes, and fallback author display names.
  - Rich text rendered through `RichTextContent.tsx` to avoid direct `set:html` compiler crashes.
  - Styling centralised in `web/src/styles/global.css` (large addition for comments skin, guidelines, typography variants, gallery grid, etc.).
  - `.env.sample` documents required endpoints for Strapi, VirtusLab comments, and front-end toggles.

- **`infrastructure/`** – Deployment artefacts (Caddy, docker compose) updated to remove the old Remark42 stack.

- **Documentation** – `README.md` & `SETUP_BEGINNER_GUIDE.md` rewritten to describe VirtusLab workflow, permissions bootstrap, moderation runbooks, gallery behaviour, typography scale usage, and troubleshooting notes.

## Current Critical Issues (UNRESOLVED as of last update)

1. **Strapi Admin blank screen / 500s**
   - Runtime logs show repeating `Invalid nested population query detected. When using 'populate' within polymorphic structures, its value must be '*' ...` errors emitted by Strapi v5 when querying `post.blocks` dynamic zone.  
   - Numerous attempts were made to adjust populate maps in `cms/src/api/post/controllers/post.js`, but the error persists in user environment. The admin UI therefore fails to load and the front-end readiness probe (`web/scripts/wait-for-strapi`) reports repeated HTTP 500 responses.
   - Pending remediation tasks:
     - Audit all code paths (including custom controllers, extensions, comments bootstrap, and any lifecycle hooks) to ensure **every** populate argument for polymorphic components uses the Strapi v5 fragment syntax (`populate: { blocks: { on: '*' } }`) or equivalent `'*'` wildcard without nested field selections.
     - Verify no third-party plugin (VirtusLab comments, typography-scale, etc.) is issuing conflicting populate queries via cron jobs, bootstrap, or admin widgets.
     - Reproduce locally with a clean Node environment (same version as user: Node 22.15.0, npm 11.6.1) to confirm the fix.

2. **Styled-components compatibility**
   - The project pins `styled-components@6.1.19` with a custom patch to keep the callable default export Strapi expects. The postinstall process runs `patch-package`. Any upgrade must revalidate this behaviour via `cms/scripts/verify-styled-exports.mjs`.

3. **VirtusLab comments reliability**
   - Guest comment submissions, reporting, and moderation rely on bootstrap permission sync and patched plugin logic. Failing to execute bootstrap (e.g. due to admin not starting) will break comment submission/reporting.

4. **Front-end build fragility**
   - Astro compiler previously crashed on certain Markdown blocks until RichText rendering shifted to React. Any regression to raw `set:html` usage may reintroduce `panic: html: bad parser state` errors.

## Mandatory Operations Checklist (keep updated)

- `npm install --prefix cms --no-progress`
- `npm install --prefix web --no-progress`
- `CI=true npm run build --prefix cms`
- `npm run build --prefix web`
- `npm run develop --prefix cms` (verify Strapi boots without populate errors)
- `npm run dev --prefix web` (ensure CommentsApp renders, submissions/reporting succeed)
- `npm test` / `npm run lint` where applicable (currently failing due to legacy config; document if unresolved).
- Always execute `node cms/scripts/verify-styled-exports.mjs` after dependency changes.

## Pending Follow-ups (transfer to future agents)

- Resolve Strapi populate errors definitively and document the root cause plus remediation steps here.
- Validate VirtusLab comments moderation UI inside Strapi once admin loads correctly; ensure Discover threads show submissions and abuse reports.
- Confirm typography-scale plugin renders correctly in the admin once Strapi boots, and document any required manual setup.
- Re-run linting tasks after upgrading ESLint configs.
- Capture front-end screenshots post UI changes once installation succeeds (previous attempts blocked by tooling issues).

---
_Last updated: 2025-10-09T13:03:04Z_
