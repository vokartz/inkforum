# Changelog

**English** · [Türkçe](CHANGELOG_tr.md)

All notable changes to InkForum are documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and versions follow [Semantic Versioning](https://semver.org/).
Each version section becomes the GitHub release note and the update note in the admin panel.

## [Unreleased]

## [1.1.0] - 2026-10-01

### Added

- **Topic templates:** each board can ask questions when a topic is created (short/long answer, number, link,
  dropdown, single and multiple choice, required fields). The topic body is built from the answers, and the title
  can be generated automatically (e.g. `{user} — Staff application`).
- **Approval queue** (`/mod/queue`): topics and replies waiting for approval in one place, with approve / reject
  buttons and a counter in the user menu for moderators.
- **Hidden topics:** moderators can hide a topic so only its author and staff can see it; a board can be set to
  "topics are private" (applications, complaints, support). Staff can add other members to a hidden topic; they
  can see and reply to it, are subscribed and get a notification.
- **Share cards for every page:** boards, profiles, wiki and custom pages, tags and static pages get their own
  preview image on Discord, X, WhatsApp and others; `og:image` size, the correct `og:locale` and the accent color
  (embed stripe) are set.

### Fixed

- Share images showed boxes instead of text on Docker installs (no fonts in the image); fonts now ship with the app.
- Mention, quote and reply notifications from hidden topics are only sent to members who can see the topic.
- Turkish text no longer leaks into other languages: footer links, the quote header ("… wrote:"), backup labels,
  notification settings, group names, support categories, the wiki description, plugin status, permission profiles,
  reactions, achievements, policies, the admin sidebar and e-mail templates follow the visitor's language.
- Sample content created in the install language (boards, categories) is shown in each visitor's language.
- Quotes in existing posts, messages and pages are updated automatically so their header follows the reader's language.
- Forums installed automatically with `ADMIN_PASSWORD` get their sample content in the default language.
- Button text on light accent colors (e.g. the default grey) is now dark and readable.
- Messages page: a single clear start screen when there are no conversations; better height on large screens.
- Profile page: actions moved next to the name; secondary actions are in a "⋯" menu instead of covering the cover photo.
- Cookies page redesigned (summary, clear table, sticky "clear cookies" card).
- Removed the extra empty space at the top of some cards.

### Changed

- German translation completed and corrected (about 1,400 strings were Turkish or English); French, Russian,
  Portuguese, Spanish and Chinese completed. Any text that is still missing falls back to English instead of Turkish.

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
