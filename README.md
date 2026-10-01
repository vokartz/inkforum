<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/inkforum-wordmark-light.png">
  <img src=".github/assets/inkforum-wordmark-dark.png" alt="InkForum" width="360">
</picture>

### Modern, lightweight community software you can manage entirely from your browser

Built for game servers, role-play communities, brands and hobby groups:
installs with one command, runs happily on a cheap VPS and updates itself with one click.

[![Latest release](https://img.shields.io/github/v/release/vokartz/inkforum?label=release&color=7b61ff)](https://github.com/vokartz/inkforum/releases)
[![Docker](https://img.shields.io/badge/docker-ghcr.io%2Fvokartz%2Finkforum-2496ed?logo=docker&logoColor=white)](https://github.com/vokartz/inkforum/pkgs/container/inkforum)
[![Platform](https://img.shields.io/badge/platform-amd64%20%7C%20arm64-555)](#requirements)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-ffdd00?logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/vokartz)

**English** · [Türkçe](README_tr.md) · [Deutsch](README_de.md) · [简体中文](README_zh.md) · [Español](README_es.md) · [Français](README_fr.md) · [Русский](README_ru.md) · [Português](README_pt.md)

[Quick start](#-quick-start) · [Features](#-features) · [Updates](#-updates) · [Backups](#-backups--restore) · [Import](#-import-from-another-forum) · [FAQ](#-faq) · [Support](#-support-the-project)

</div>

---

## Why InkForum?

| | |
|---|---|
| **Online in minutes** | A one-line installer prepares Docker, gets a free HTTPS certificate for your domain and hands you over to a friendly setup wizard. |
| **Fast on cheap hardware** | A single process with SQLite by default — no Redis, no search server, no separate database server. A 1 GB RAM VPS is plenty. |
| **Full control without code** | Themes, colours, menus, home page, permissions, e-mail templates, plugins… everything lives in the admin panel. |
| **One-click updates** | New releases appear in the panel with release notes. A backup is taken first and the previous version is restored automatically if anything goes wrong. |
| **Secure by default** | Built-in web application firewall (WAF), two-factor authentication, re-authentication for admin actions, strict Content Security Policy. |
| **Multilingual** | English, Turkish, German, Chinese, Spanish, French, Russian and Portuguese — members pick their own language. |

## 🚀 Quick start

On Ubuntu, Debian, Rocky, Alma or any Linux server that can run Docker:

```bash
curl -fsSL https://raw.githubusercontent.com/vokartz/inkforum/main/install.sh | sudo bash
```

The script:

1. installs Docker if it's missing (after asking you),
2. creates `/opt/inkforum` and an `.env` file with strong random secrets,
3. enables **automatic HTTPS** (Let's Encrypt via Caddy) if you enter a domain,
4. starts InkForum and prints your **setup URL**.

Open `https://your-domain.com/install` in your browser. The wizard checks your server and asks for the forum name,
theme, administrator account, registration mode, plugins and (optionally) e-mail settings. That's it.

> **Finish setup right away.** There is no setup code: the first person to complete the wizard becomes the administrator,
> so open `/install` as soon as InkForum is running. The site address is detected from your browser and saved.

### Manual installation (Docker Compose)

```bash
mkdir -p /opt/inkforum && cd /opt/inkforum
curl -fsSLO https://raw.githubusercontent.com/vokartz/inkforum/main/docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/vokartz/inkforum/main/.env.example -o .env
# optional: APP_URL, APP_SECRET and UPDATER_TOKEN are detected or generated automatically
docker compose up -d
```

### Coolify, Dokploy, Portainer

Add `docker-compose.yml` (or the `ghcr.io/vokartz/inkforum` image) to your platform directly — no variables are required:
the site address is taken from the platform (Coolify) or detected in the setup wizard, and the secret keys are generated
and stored in the `storage` volume. If the platform provides its own reverse proxy, keep `TRUST_PROXY=uniquelocal` and don't enable the `https` (Caddy) profile.

### Requirements

| | Minimum | Recommended |
|---|---|---|
| CPU | 1 vCPU (amd64 or arm64) | 2 vCPU |
| Memory | 1 GB | 2 GB |
| Disk | 5 GB | 20 GB + uploads |
| Software | Docker 24+ with the Compose plugin | — |

Can't use Docker (cPanel/Passenger, Plesk, plain Node.js)? Every release also ships a **server package** — see
[Installation without Docker](#installation-without-docker).

## ✨ Features

<details open>
<summary><b>Forum</b></summary>

- Categories, nested boards, link boards, board covers and rule pages
- Topic prefixes, tags, polls, pinning, featuring, locking, moving and merging
- Rich text editor: headings, tables, spoilers, code, colours, image uploads, auto-saved drafts
- Automatic embeds from 24 providers including YouTube, Twitch, Kick, Spotify, X, Instagram, TikTok and Discord invites
- Quotes, @mentions, emoji reactions, reputation, unread tracking, topic subscriptions
- Advanced search, similar topics, approval queue, edit history
</details>

<details>
<summary><b>Members & community</b></summary>

- Five registration modes (instant, e-mail verification, admin approval, both, closed) with bot protection
- Groups, post-count ranks, time-limited memberships, group join requests
- Profiles with cover photos, custom fields, achievements, signatures and privacy settings
- Private conversations (1:1 and group), notifications and e-mail notifications
- Sign in with Discord, Google and GitHub
</details>

<details>
<summary><b>Design</b></summary>

- Three themes: **Modern**, **Community** (big banner) and **Classic** (SMF-inspired, with modern touches)
- Light/dark mode, accent colour, 9 fonts, corner radius, banner, logo and backgrounds
- Drag & drop menu editor and home page blocks
- **Studio**: a full-screen drag & drop page builder — landing pages, galleries, server cards, countdowns, pricing tables, FAQs…
- Reset the appearance to defaults with one click
- Fully responsive; can be installed to the home screen (PWA manifest)
</details>

<details>
<summary><b>Plugins</b></summary>

| Plugin | What it does |
|---|---|
| **Landing page** | A Studio page becomes your home page; the forum moves to `/forum` automatically |
| **Wiki** | Unlimited nested pages, table of contents, search, page history |
| **Applications** | Staff and role applications with 8 question types, requirements, reviews and automatic group assignment |
| **Support tickets** | Per-category responsible teams, statuses, priorities, internal notes |
</details>

<details>
<summary><b>Search engines & sharing</b></summary>

- Dynamic `robots.txt` and an automatic, sectioned `sitemap.xml` (public content only)
- Open Graph and X cards, canonical URLs, structured data (JSON-LD)
- Auto-generated **share images** for topics (title, board, author, stats)
- oEmbed and embeddable topic cards for other websites
- Google, Bing and Yandex verification; optional blocking of AI crawlers
</details>

<details>
<summary><b>Security</b></summary>

- Built-in **firewall**: attack-pattern blocking, rate limiting, bad-bot blocking, IP/range rules
- Challenge page under attack: built-in proof-of-work, Cloudflare Turnstile or hCaptcha
- argon2id passwords, 2FA, session management, re-authentication for admin actions
- Strict CSP, CSRF protection, SSRF-safe webhooks
- IP, e-mail, domain and member bans; warning points with automatic sanctions
</details>

<details>
<summary><b>Integrations</b></summary>

- OAuth 2.0 provider ("Sign in with your forum account", PKCE), scoped REST API, API keys
- Signed webhooks (new topic, registration, group change…), signed member tokens for game panels / UCPs
- Custom HTML/CSS/JS snippets (safe via CSP nonces) and a `window.forum` JavaScript API
</details>

## 🔄 Updates

InkForum follows the [releases](https://github.com/vokartz/inkforum/releases) of this repository.

- **Admin → Updates** shows your version, the latest version and its **release notes**.
- **Update now**: database backup → new image download → restart with health check → **automatic rollback** if the
  new version doesn't come up. Progress is shown live.
- **Automatic updates**: off, bug fixes only (1.2.x), fixes + features (1.x) or everything, at a night hour you choose.
  Administrators get a notification when a new version is published.
- **Stable / Beta** channels.

Prefer the command line?

```bash
cd /opt/inkforum && docker compose pull && docker compose up -d
```

Database changes are applied automatically on start.

## 💾 Backups & restore

- **Admin → Maintenance & backups**: database snapshot, portable **SQL dump** or **full backup** (database + uploaded files).
- Daily automatic backups at the hour you choose; the newest N are kept. A backup is also taken before every update and every restore.
- **Upload & restore**: upload a backup (also from another server), type `GERİ YÜKLE` to confirm and InkForum restores it
  while restarting — the current state is backed up first, so you can always go back.
- Everything (database, uploads, backups) lives in the `inkforum-storage` Docker volume:

```bash
docker run --rm -v inkforum_inkforum-storage:/data -v "$PWD":/backup alpine tar czf /backup/inkforum-storage.tgz -C /data .
```

## 🚚 Import from another forum

Moving from **SMF 2.x**, **phpBB 3.x**, **Invision Community 4/5** or **MyBB 1.8**? Upload the old forum's MySQL dump
(`.sql` / `.sql.gz`) in **Admin → Forum migration**. The platform, version and table prefix are detected automatically, and
broken characters from double-encoded databases can be repaired with a live preview.

- Members, groups (with colours), ranks and **rank images**, categories and boards, **board access** and moderators
- Topics, posts (with quotes and mentions), polls, private messages, attachments, avatars and bans
- Members sign in with their **old passwords**; the hash is upgraded to argon2id on first login
- Old links (`viewtopic.php?t=…`, `index.php?topic=…`, `showthread.php?tid=…`, `/topic/12-…`) redirect to the new pages
- An automatic backup is taken before the import starts

## ⚙️ Configuration

Every forum setting lives in the admin panel. The `.env` file only describes the infrastructure:

| Variable | Description |
|---|---|
| `APP_URL` | Full site address (`https://forum.example.com`); optional — detected in the setup wizard |
| `APP_SECRET` | Session & encryption key (32+ characters; changing it signs everyone out); optional — generated automatically |
| `UPDATER_TOKEN` | Shared key with the updater container; optional — generated automatically |
| `DOMAIN`, `COMPOSE_PROFILES=https` | Automatic HTTPS with Caddy |
| `DB_DRIVER`, `DATABASE_URL` | Use PostgreSQL (add `postgres` to `COMPOSE_PROFILES`) |
| `TRUST_PROXY` | Real client IPs behind a reverse proxy (`uniquelocal` recommended) |
| `INKFORUM_PORT`, `INKFORUM_BIND` | Published port and bind address |
| `UPDATES_DISABLED` | Disable update checks on offline servers |
| `WAF_DISABLED` | Emergency switch to disable the firewall |

## Installation without Docker

Every release contains `inkforum-<version>-linux-x64.tar.gz` (dependencies included) and `inkforum-<version>.tar.gz`.
Node.js 22.13 or newer is required.

```bash
curl -fsSLO https://github.com/vokartz/inkforum/releases/latest/download/inkforum-<version>-linux-x64.tar.gz
tar xzf inkforum-*-linux-x64.tar.gz && cd inkforum
cp .env.example .env   # optional: everything is detected or generated automatically
NODE_ENV=production node --env-file=.env server.mjs
```

Run it with systemd, PM2 or Passenger. Updates from the panel download the package, verify it with SHA-256, install it
and restart the process (your process manager must restart it). Example systemd unit:

```ini
[Unit]
Description=InkForum
After=network.target

[Service]
WorkingDirectory=/opt/inkforum
Environment=NODE_ENV=production
ExecStart=/usr/bin/node --env-file=.env server.mjs
Restart=always
User=inkforum

[Install]
WantedBy=multi-user.target
```

## ❓ FAQ

**Which database should I choose?**
SQLite is enough for most communities and needs the least maintenance. PostgreSQL is supported for very large
communities or if you prefer a managed database.

**My server has no internet access — what about updates?**
Set `UPDATES_DISABLED=true`, load the new image manually and run `docker compose up -d`.

**The firewall locked me out.**
Add `WAF_DISABLED=true` to `.env`, run `docker compose up -d`, then fix the settings in the panel.

**I forgot the admin password.**
Use "Forgot password" on the login page. Without e-mail settings the link is written to `storage/mail`:
`docker compose exec inkforum ls /app/storage/mail`

## 🐞 Bug reports & ideas

Found a bug or have an idea? [Open an issue](https://github.com/vokartz/inkforum/issues/new/choose) — the forms guide you
through the details we need. In your forum, **Admin → System info → "Report a bug on GitHub"** pre-fills your version and
environment. Security problems: please use [private advisories](https://github.com/vokartz/inkforum/security/advisories/new).

## ☕ Support the project

InkForum is developed by a small team. If it helps your community, you can keep the ink flowing:

<a href="https://buymeacoffee.com/vokartz"><img src="https://img.shields.io/badge/Buy%20me%20a%20coffee-ffdd00?style=for-the-badge&logo=buymeacoffee&logoColor=black" alt="Buy Me a Coffee"></a>

### 💛 Supporters

A big thank-you to everyone who supports InkForum. Supporters are listed here with their permission.

<!-- SUPPORTERS:START -->
| | |
|---|---|
| *Your name or community could be here* | [Become a supporter](https://buymeacoffee.com/vokartz) |
<!-- SUPPORTERS:END -->

Other ways to help: ⭐ star this repository, report bugs, suggest features, translate InkForum into your language,
or tell other community owners about it.

## License

InkForum is free and open-source software licensed under the [GNU AGPL-3.0](LICENSE). You may use, study, modify and share it;
if you run a modified version for others (including as a hosted service), you must publish your changes under the same license.
Want to contribute? See [CONTRIBUTING.md](CONTRIBUTING.md). Changes: [CHANGELOG.md](CHANGELOG.md). Security: [SECURITY.md](SECURITY.md).

<div align="center"><sub>© InkForum · made with ♥ in Türkiye</sub></div>
