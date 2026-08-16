# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is Thomas Verrill's personal website, built with [Astro](https://astro.build) (v7) and deployed to GitHub Pages at `thomasverrill.com`. It's a static, content-light personal site — no client-side JS framework, no CMS, no tests.

## Commands

```bash
npm run dev      # start local dev server
npm run build    # build static site to dist/
npm run preview  # preview the production build locally
```

There is no lint or test command configured.

## Deployment

Pushes to `main` trigger `.github/workflows/deploy.yml`, which runs `npm ci && npm run build` and deploys `dist/` to GitHub Pages via `actions/deploy-pages`. The `dist/` directory is gitignored — never hand-edit or commit built output.

## Architecture

- **Pages** (`src/pages/*.astro`) are one file per route (`music.astro` → `/music`, etc.), each wrapping content in `BaseLayout`.
- **`BaseLayout`** (`src/layouts/BaseLayout.astro`) sets up `<head>` (title/description), imports global styles, and conditionally renders `SiteHeader` via a `showHeader` prop. The homepage (`index.astro`) uses the header nav; every other page sets `showHeader={false}` and instead renders `PageNav` (a lightweight in-page/back-to-home nav) as the first thing inside the layout.
- **`SiteHeader`** (site-wide nav, shown only on `/`) and **`PageNav`** (per-page nav, shown on subpages) are separate components with distinct styling (`.site-nav` vs `.page-nav` in global.css) — don't conflate them.
- Subpages follow a consistent pattern: a `sections` array (e.g. `["books", "music", "tv shows", "movies"]` in `recommendations.astro`) is mapped into `<section id=... aria-labelledby=...>` blocks, several of which are currently empty placeholders (`.empty-section` / empty `.archive-list`) awaiting content. When adding content to a page, follow this existing section/id/heading structure rather than introducing a new pattern.
- All styling currently lives in a single global stylesheet, `src/styles/global.css`, using CSS custom properties defined on `:root` (colors, `--max-width`, etc.) — no CSS modules, no Tailwind. This isn't a hard rule; reuse existing utility classes (`.archive-list`, `.empty-section`, `.section-note`) where they fit, but a component-scoped `<style>` block is fine for something genuinely one-off.
- New `--custom-properties` (colors, spacing, etc.) can be added to `:root` freely as pages need them — no need to ask first, just keep naming consistent with the existing set (`--background`, `--text`, `--text-strong`, `--text-soft`, `--rule`, `--link`, `--link-hover`, `--focus`).
- The site is light-mode only by design (`color-scheme: light` in global.css) — don't add dark mode support or design components with a dark variant in mind.
- The `.empty-section` / empty `.archive-list` blocks are placeholders for unwritten content, not a permanent design element. When adding real content to one of these sections, delete the placeholder div and populate the section with real markup (e.g. `<li>` entries in `.archive-list`) — there's no other list-ordering convention to preserve.
- `astro.config.mjs` sets `site: "https://thomasverrill.com"`; the custom domain is also pinned via `public/CNAME` (copied to `dist/CNAME` on build).

## Content & tone conventions

- **Lowercase everything**: page titles (h1), section headings (h2), nav labels, the `<title>` tag, meta descriptions, and body copy/prose should all be written lowercase. This is an authoring convention, not CSS-enforced (h2 happens to also have `text-transform: lowercase` in global.css, but don't rely on that — type lowercase in the source). Note this is a deliberate departure from the current `index.astro` intro paragraph and `<title>`/description casing (e.g. "Music / Thomas Verrill") — treat those as due for a lowercase pass, not as the pattern to copy.
- **Minimalist, non-verbose copy**: keep any description, blurb, or meta text to 1–2 sentences max. Prefer stating the fact plainly over explaining or hyping it — no marketing adjectives, no filler throat-clearing.
- **No unrequested bells and whistles**: don't introduce new UI components/patterns (cards, carousels, modals, tabs, etc.) beyond the existing section/list/nav vocabulary already in the codebase, and don't add animations or transitions beyond what's already in global.css — unless the user explicitly asks for it. When in doubt, reuse an existing pattern rather than designing a new one.

Add all claude-specific related files to the git ignore.