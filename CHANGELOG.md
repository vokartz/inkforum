# Changelog

**English** · [Türkçe](CHANGELOG_tr.md)

All notable changes to InkForum are documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and versions follow [Semantic Versioning](https://semver.org/).
Each version section becomes the GitHub release note and the update note in the admin panel.

## [Unreleased]

## [1.0.1] - 2026-10-01

### Changed

- The setup wizard no longer asks for a setup code; it opens directly with the system check.
- No environment variable is required anymore: without `APP_URL` the site address is taken from the platform
  (Coolify) or detected from the browser in the setup wizard and saved; `APP_SECRET` and `UPDATER_TOKEN` are generated
  and kept in the `storage` volume.
- The installer (`install.sh`) detects the system language (8 languages) and sets the forum's first language.
- The Docker image trusts reverse proxies on private networks by default (`TRUST_PROXY=uniquelocal`).

### Fixed

- Setup failed with "Request origin could not be verified" when `APP_URL` didn't match the real address (e.g. on Coolify).

## [1.0.0] - 2026-10-01

First stable release.

### Forum

- Categories, nested boards, topic prefixes, tags, polls, reactions, quotes and mentions
- Rich text editor (BBCode based) with headings, tables and embedded media
- Unread topics, subscriptions, notifications and e-mail notifications
- Private messages, profiles, ranks, achievements, warning points and bans

### Design

- Three themes: Modern, Community and Classic (SMF style) — all with light/dark mode and mobile support
- Accent color, font, corner radius, banner, logo and background are set from the admin panel
- Drag-and-drop page builder (Studio): standalone landing pages, galleries, counters, pricing tables and more
- Reset appearance to defaults

### Plugins

- Landing page, Wiki (nested pages, history), Applications (custom questions and requirements), Support tickets

### Security

- Built-in web application firewall (WAF): attack pattern blocking, rate limiting, bad bot blocking, challenge page (built-in, Turnstile, hCaptcha)
- Two-factor authentication, admin re-authentication, API keys and OAuth scopes

### Installation and maintenance

- One-command Docker installation and setup wizard
- One-click updates from the admin panel, automatic update checks and release notes
- Daily automatic backups (database, SQL dump or full backup with files), backup upload and one-click restore
- System status, maintenance tools and bug reports to GitHub with system details pre-filled

### Migration and languages

- Import from SMF, phpBB, Invision Community and MyBB: members (sign in with their old passwords), groups and rank images, board permissions, topics, posts, polls, private messages, attachments and redirects for old links
- English and Turkish interface; automatic selection from the browser language and a per-member language preference
