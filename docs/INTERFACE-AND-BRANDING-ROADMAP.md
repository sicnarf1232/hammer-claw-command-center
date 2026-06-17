# Interface & Branding Roadmap

Status: PLANNING (not yet built). Captured 2026-06-17 to revisit after current
meeting/pull work. Build steps are sequenced; nothing here is implemented.

## Goal

Let the **user configure branding in the app** (logo, brand colors, app name,
maybe fonts) and have the **entire interface re-theme at runtime** to match.
Configured through the app UI and persisted, not via code or env vars. Plus a
real **Settings / admin area** to house this and future preferences.

A layout/visual design will arrive separately (a "Claude Design" prompt). This
doc is the architecture + wiring plan that design will sit on top of.

## The enabler: the token system already exists

`app/globals.css` defines every color as a CSS custom property (space-separated
RGB channels), and `tailwind.config.ts` maps Tailwind colors to them via
`rgb(var(--c-*) / <alpha-value>)`. `.dark` on `<html>` swaps the palette; fonts
are `--font-sans` / `--font-mono`.

Consequence: runtime theming = **override those `--c-*` (and font) variables**
from a stored config. Change the values, the whole app re-skins. No component
refactor. This is why this feature is low-risk and mostly additive.

Tokens available to brand against: `--c-page`, `--c-surface`, `--c-surface-2`,
`--c-fg`, `--c-muted`, `--c-border`, `--c-primary`, `--c-primary-fg`,
`--c-accent`, `--c-ring`, status colors, and workstream accents
(`--c-merit`, `--c-sloan`, `--c-personal`, `--c-shared`).

## PIVOTAL DECISION: who is "the user"?

This shapes everything below. `CLAUDE.md` currently says single-user, not
multi-tenant.

- **A. Single-user self-theming (recommended first).** Jordan configures his own
  branding in-app instead of editing code. No auth/tenant/org changes. Fits the
  current app exactly. "The user" = Jordan.
- **B. Multi-tenant white-label (productizing).** Many customers, each with their
  own branded instance. Requires real auth, a tenant model, per-tenant config +
  tenant resolution (subdomain or login), and reworking the single-user
  assumptions throughout. A large, separate effort.

Recommendation: **build A now.** The theming engine and Settings UI are the same
work either way; just key the config so it CAN later become per-tenant (e.g. a
`tenant_id` column defaulting to a single value). Defer B until there is a real
decision to productize, and treat it as its own milestone.

## Architecture (in-app theming) — for option A

1. **Theme config model** (one object):
   - `appName`, `logoUrl` (or `logoBlob`), `faviconUrl?`
   - `colors`: overrides for any subset of `--c-*` tokens (light + optional dark)
   - `font?` (sans/mono family), `radius?`/`density?` (optional later)
   - `defaultMode`: light | dark | system
2. **Storage**: a Postgres table `app_settings` (Drizzle) — single row for now
   (add `tenant_id` later for B). Postgres/Neon is already attached. DB is the
   right home per `CLAUDE.md` ("state that does not belong in version control").
3. **Logo storage**: pick one (see open questions): Vercel Blob (`@vercel/blob`,
   clean for images), base64 in the DB row (simplest, fine for small logos), or
   the vault. Blob is the most scalable; base64 is the fastest to ship.
4. **Runtime injection (no flash)**: the **root layout** (`app/layout.tsx`, a
   server component) reads `app_settings` and renders a `<style>` that sets the
   overridden `--c-*` variables on `:root` (and `.dark` for dark overrides), and
   passes `appName`/`logoUrl` to `Nav`. Because it is server-rendered, the theme
   is correct on first paint (no flash of default theme).
5. **Settings UI** (`/settings`): color pickers bound to tokens, logo upload,
   app name, default mode, with a **live preview**. Save -> write `app_settings`
   -> `revalidatePath('/', 'layout')` so every page re-themes immediately.

Because the UI is entirely token-driven, step 5 saving is all it takes for the
whole app (every page, component, chip, button) to adopt the new brand.

## Settings / admin area scope

`/settings` (Jordan's admin settings; later, per-tenant admin):
- **Branding**: logo, favicon, app name, brand colors, fonts.
- **Appearance**: default light/dark/system, density/radius (optional).
- **Integrations (read-only)**: show which secrets/env are configured (GitHub,
  Granola, Anthropic, Power Automate) WITHOUT exposing or editing values. Secrets
  stay in env per `CLAUDE.md` rule 4 — never editable in-app.
- **Account / misc**: timezone, app password reminder, etc.

## Phased build steps (recommended order)

0. Decide A vs B (above). Assume A.
1. **Settings storage**: `app_settings` Drizzle table + a `lib/settings.ts`
   read/write with the current palette as defaults (so nothing changes visually
   until edited). Graceful fallback when DB is absent (use built-in defaults).
2. **Theme engine**: token-override `<style>` injection + logo/appName in the
   root layout and `Nav`. Ship with defaults = today's look (no visible change).
3. **Settings UI v1**: app name + brand colors (primary/accent + a few) + default
   mode, live preview, save + revalidate.
4. **Logo upload**: chosen storage; `Nav` renders the uploaded logo.
5. **Polish**: fonts, density/radius, favicon, import/export a theme as JSON.
6. **(Later, if B)**: auth + tenants + per-tenant config + tenant resolution.

Each step is shippable on its own and leaves the app working.

## Open questions (resolve before/while building)

- **A vs B**: single-user self-theming, or multi-tenant white-label?
- **Logo storage**: Vercel Blob, base64-in-DB, or vault?
- **Theming depth**: just brand colors + logo, or full palette + fonts + density?
- **"Entire layout"**: does that mean structural/layout changes too, or skin/look
  only? (The incoming Claude Design prompt should clarify; structural changes are
  a bigger lift than re-skinning.)
- **Workstream accents**: brand colors are global; do they override the
  per-workstream accents (merit/sloan/...) or coexist?
- **Vercel plan**: Blob + more routes are fine on Hobby, but confirm if any of
  this needs Pro alongside the cron work already flagged in PUNCHLIST.
