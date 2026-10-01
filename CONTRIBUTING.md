<div align="center">

<img src="apps/web/static/brand/inkforum-icon-192.png" alt="" width="72">

# Contributing to InkForum

**Modern, lightweight, fully admin-managed community software**

SvelteKit + NestJS · TypeScript end to end · SQLite or PostgreSQL · single process

**English** · [Türkçe](CONTRIBUTING_tr.md) · [User guide & installation](README.md)

[Product](#product) · [Architecture](#architecture) · [Development](#development) · [Testing](#testing--quality) · [Releasing](RELEASING.md) · [Changelog](CHANGELOG.md)

</div>

---

> InkForum is open source under the [GNU AGPL-3.0](LICENSE). Issues and pull requests are welcome — please read this guide,
> run `pnpm lint`, `pnpm typecheck` and `pnpm test` before opening a pull request, and keep changes focused.

## Product

InkForum is SMF / IPS-class forum software for game servers, role-play communities, brands and hobby groups. It is
designed to run on cheap servers: **a single Node process**, **SQLite** by default, no Redis / S3 / search service.

| Area | Highlights |
|---|---|
| **Forum** | Nested boards, prefixes, tags, polls, reactions & reputation, quotes / mentions, unread tracking, advanced search, 24-provider auto embeds |
| **Membership** | 5 registration modes, groups and ranks (SMF model), permission matrix and board permission profiles, 2FA, custom fields, private messages, achievements, warnings, bans |
| **Design** | Modern / Community / Classic (SMF) themes, light-dark mode, accent colour, 9 fonts, menu and home editors, appearance reset, fully responsive |
| **Studio** | Full-screen drag & drop page builder (25 blocks, templates, custom CSS/HTML), landing page |
| **Plugins** | Landing page, Wiki, Applications, Support tickets — toggled in Admin → Plugins |
| **SEO & sharing** | Dynamic robots.txt, sectioned sitemap, Open Graph / X cards, JSON-LD, generated share images, oEmbed and embeddable topic cards, PWA manifest |
| **Security** | Built-in WAF (patterns, rate limits, bad bots, Turnstile / hCaptcha / proof-of-work), argon2id, CSP nonces, CSRF, SSRF-safe webhooks, admin re-authentication |
| **Operations** | Setup wizard, GitHub-based update checks and one-click / automatic updates, backups (DB / SQL / full) with upload & restore, system health, maintenance tools |
| **i18n** | 8 UI languages, per-member language, admin default language |
| **Import** | SMF, phpBB, IPS and MyBB importers (members, groups, ranks, boards, topics, posts, polls, PMs, attachments) |

## Architecture

```
apps/
  server/          NestJS API; in production also serves the SvelteKit UI on the same port
    src/install/     setup wizard (setup code, environment checks)
    src/updates/     GitHub release checks, package / Docker updates
    src/updater/     Docker updater sidecar (no Nest, single file)
    src/maintenance/ backups, restore, system info
    src/seo/         robots, sitemap, oEmbed, share images
    src/importer/    SMF / phpBB / IPS / MyBB importers
  web/             SvelteKit UI (Svelte 5 runes, Tailwind v4, shadcn-svelte, Phosphor)
packages/
  shared/          shared types, zod schemas, permission / setting / plugin registries, BBCode, Markdown, i18n catalogs
  db/              Kysely schema, SQLite (node:sqlite) / PostgreSQL drivers, migrations
docker/            runtime image (contains the compiled package only)
scripts/release/   release package, version bump, release notes
storage/           database, uploads, backups, mail logs (git-ignored)
```

## Development

Requirements: **Node.js 22.13+** (24 LTS recommended) and **pnpm 10**.

```bash
pnpm install
cp .env.dev.example .env
pnpm dev
```

- UI http://localhost:5173 (Vite proxies `/api`) · API http://localhost:3000/api
- On an empty database the **setup wizard** (`/install`) opens; the setup code is printed to the console and to
  `storage/INSTALL_CODE.txt`. Setting `ADMIN_PASSWORD` in `.env` performs a headless install.
- E-mails are written to `storage/mail/*.eml` in development.
- Sample members and topics: `pnpm db:seed:dev` (see [CONTRIBUTING_tr.md](CONTRIBUTING_tr.md) for the dev credentials).

| Command | Description |
|---|---|
| `pnpm dev` | Packages, API and UI in watch mode |
| `pnpm build` | Build everything (`INKFORUM_RELEASE=1` also minifies server code) |
| `pnpm test` | All tests (SQLite) |
| `pnpm --filter @forum/server test:pg` | Server tests on PostgreSQL (PGlite) |
| `pnpm typecheck` / `pnpm lint` | Type checking / ESLint |
| `pnpm i18n:extract` | Update translation catalogs from source |
| `pnpm release:version <kind>` | Bump version, prepare CHANGELOG |
| `pnpm release:build` | Produce `release/inkforum` and archives |

## Testing & quality

- Server: Vitest + supertest end-to-end suites (auth, forum, permissions, WAF, installer, updates, backups & restore,
  SEO, plugins, importers…), each on its own database; CI runs SQLite and PGlite and boots on real PostgreSQL.
- Shared package: BBCode safety (XSS cases), embeds, version comparison, Markdown, i18n.
- UI: `svelte-check` and ESLint.

## License

GNU AGPL-3.0 — see [LICENSE](LICENSE). By contributing you agree that your contributions are licensed under the same terms.
