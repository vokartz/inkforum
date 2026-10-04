# Changelog

**English** · [Türkçe](CHANGELOG_tr.md)

All notable changes to InkForum are documented in this file. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)
and versions follow [Semantic Versioning](https://semver.org/).
Each version section becomes the GitHub release note and the update note in the admin panel.

## [Unreleased]

## [1.6.1] - 2026-10-04

### Changed

- **Groups page redesigned.** Every role is shown on a single page together with its members and the permissions it
  holds, grouped by category; there is no separate member page any more (old `/groups/<id>` links jump to the group
  on the page, and the rest of a large group opens in place with *Show more*). Members can join, leave, request to
  join and pick their primary group right there.
- New *Admin → Groups → Groups page* screen: turn the page on or off (the menu link follows), choose whether members
  and permissions are shown and how many members appear at first, and pick which groups are listed and in what
  order by dragging or with the arrows.

## [1.6.0] - 2026-10-03

### Added

- **Extension system.** Extensions are installed from *Admin → Extensions* as a `.zip` / `.tgz` upload, an npm package
  name or a folder copied to `storage/extensions/<id>`. Before installing, the admin sees what the extension does
  (server code, scripts on every page, external origins, permissions, menu links). An extension can add:
  - forum pages at their own addresses, and pages that **replace forum pages** (`override: true` — home page,
    members, profiles …; admin, login and API addresses are protected),
  - admin pages (listed under *Extensions* in the admin menu) with an automatic settings form, and member settings
    pages (*Settings → Extensions*),
  - API routes under `/api/ext/<id>/…` with auth, permission, admin and rate-limit options,
  - its own database tables through migrations (SQLite and PostgreSQL), a key-value store, and connections to any
    other database or service (full Node.js),
  - HTML in page slots: after header, before footer, home page top / sidebar, board top, topic top / bottom, under
    every post, **buttons on every post** (e.g. a report system), profile cards and tabs,
  - menu links, permissions (shown in *Admin → Permissions*), event listeners, queued jobs and scheduled tasks,
    scripts and styles on every page.
  Extensions can be enabled, disabled, reloaded, updated in place (settings and data are kept, new migrations run)
  and uninstalled with or without their data. Server logs per extension are shown in the admin panel.
  `INKFORUM_SAFE_MODE=1` (or a `storage/extensions/.safemode` file) starts the forum without any extension.
- **Starter kit for extension developers**, downloaded from *Admin → Extensions → Develop* (no npm needed): a
  working example extension, type definitions for the editor and the `inkforum-ext` tool (`validate`, `pack`,
  `build`). The page also holds the full developer guide.
- **Ready-made extensions** shipped with InkForum: *Game panel* (character applications) and *Complaint center*
  (a "Report" button on every post, the member's complaints, a staff queue with internal notes, assignment and
  status tracking). Install them with one click or download them as a starting point.
- **Admin guide:** on the first visit to the admin panel a welcome screen and a step-by-step tour highlight the
  menu; after an update a "What's new" window explains the changes. Both can be reopened from the help button.

### Changed

- **Simpler admin menu:** related pages are merged into tabs (Captcha under Security, Reactions with Emojis, Jobs
  and System info under Maintenance), Policies moved to Forum, members and groups share one group, and extensions
  have their own group. The embeds page is hidden from the menu; embeds keep working with their saved settings.
- **Theme studio** opens full screen and draws the preview at a real screen width (1920 / 1440 / tablet / phone)
  scaled to fit, so page width, sidebar and density options are visible in the preview. Width options show their
  pixel size and a topic page can be previewed for the post layout option.

### Removed

- The *Custom code and integration* screen (HTML/CSS/JS snippets, custom CSS, external source allowlist and the
  signed UCP member token, `window.forum.token()`). Extensions replace it. The custom code permission is now
  "Code editing" and still controls HTML/CSS/JS in pages, themes, home blocks and the maintenance page.

### Fixed

- Saving the position of a profile cover photo did nothing.
- Pages that render a custom page on the server (for example a landing page) could fail with an internal error.

## [1.5.0] - 2026-10-02

### Added

- **Forum data in page server code:** custom pages' server code can read forum data with the visitor's permissions:
  `forum.site`, `forum.stats()`, `forum.online()`, `forum.user(id or name)`, `forum.members()`, `forum.groups()`,
  `forum.groupMembers()`, `forum.boards()`, `forum.topics()`, `forum.topic()`, `forum.userTopics()` and
  `forum.search()`. `req.user` now includes the visitor's own e-mail, group names, permissions, post count,
  reputation, achievement and warning points, so it can be sent to your own system with `fetch`. Other members'
  e-mail and IP addresses are never exposed. Documented in *Admin → Pages → Docs*, with two new ready-made examples.

### Fixed

- The custom pages documentation overflowed to the right on wide tables and code samples.

## [1.4.1] - 2026-10-02

### Changed

- **New private message page** uses the same layout as starting a topic: recipients, title and message with required
  markers and a character counter, a sticky send bar, and a side panel with the participants and tips.
- **Forum-style dialogs:** leaving a page with unsaved changes (settings, theme studio, pages, wiki, e-mail templates)
  asks in the forum's own dialog instead of the browser's box. Reasons for rejecting applications and group requests
  or revoking warnings are entered in the same dialog.
- **Printing** uses a clean light layout on every page whatever the theme: no menus, footer, buttons or reply box, the
  forum name and page address on top, and link addresses after links.
- **Policy pages** show labelled *Edit* and *Print* buttons to everyone allowed to manage policies, and printed copies
  note the version and print date.

## [1.4.0] - 2026-10-02

### Added

- **Import from XenForo 2:** members sign in with their old passwords; groups, the user title ladder, forums with their
  view permissions, threads, posts (quotes, mentions, media, spoilers, attachments), polls, conversations and bans are
  moved over. Old `/threads/…`, `/posts/…`, `/forums/…` and `/members/…` links redirect to the new pages.
- **Install on cPanel:** the server package runs under cPanel's *Setup Node.js App* (Passenger) and Plesk with the
  startup file `app.cjs`, no SSH needed. Scheduled tasks run with `node app.cjs cron`. Step by step guide in the README.

### Changed

- Notifications are grouped by day with an icon for each type and a clear unread state.
- The online page shows member and guest totals and when each member was last active.
- Topic buttons fit on phones and the post author's stats move to their own row.
- Profiles without a cover image use a shorter header.

### Fixed

- Group member counts stayed at 0 after sign-ups and rank changes.
- Gradient page backgrounds stopped at the bottom of the screen on long pages.

## [1.3.0] - 2026-10-01

### Added

- **Code-first custom pages (Admin → Pages):** write a page in HTML, CSS and JavaScript, with an optional sidebar
  (forum sidebar, your own HTML or none). A page can live at any root address you choose, for example `/ucp`, and
  can have its own server code: a sandboxed `handle(req)` function that can redirect, return data to the page or
  answer JSON requests at `/api/page-api/<page>/…`. Server code can call allowed external hosts with `fetch`, keep
  data in a per-page key-value store, read encrypted secrets that never reach the browser and get a signed token for
  the signed-in member. It runs with CPU, time and memory limits. A test runner, ready examples (UCP single sign-on,
  member panel, form, landing page, sidebar) and a detailed documentation page are included, together with a UI kit
  (`f-*` classes) and forum components such as `<forum-user>`, `<forum-recent>` and `<forum-countdown>`.
- **Maintenance page designer:** layout, icon, background, texts, countdown, progress bar, buttons, social links and
  the staff login link; admins with the custom code permission can add their own HTML and CSS.
- **Optional captcha** on register, login and forgot password: a built-in math question, Cloudflare Turnstile,
  hCaptcha or Google reCAPTCHA, chosen per form.
- **Share card designer (Admin → Share card):** design the link preview image with four layouts, a background color,
  gradient or image, logo, texts and the embed color, with a live Discord-style preview.
- **Automatic staff assignment for support tickets:** each category can hand new tickets to staff in turn, to
  whoever has the fewest open tickets, or always to one person, optionally preferring staff who are online. Only the
  assigned staff member is notified.

### Changed

- **Private messages work like topics:** a conversation has a title and its messages appear as full posts with the
  author card, quoting and the complete editor, instead of a chat layout.
- Cleaner support (tickets) and applications pages.
- YouTube and other embeds play directly inside the editor, and custom emoji show as images while writing.
- The Updates page and other admin pages open quickly even when the updater is unreachable.

### Removed

- The visual page builder. Existing builder pages keep working; opening one in the editor converts it to HTML.
- The Shoutbox and Game server status plugins.

### Fixed

- Switching between light and dark mode now applies at once instead of after a reload.

## [1.2.0] - 2026-10-01

### Added

- **Theme studio (Admin → Themes):** build a complete theme visually, without writing code. Start from a preset
  (Modern, Community, Midnight, Forest, Sunset, Paper, Neon, Clean) or copy an existing theme, then change light and
  dark colors, fonts and sizes, corners, borders and shadows, card style, header layout (top bar, banner, centered),
  menu style, page width, sidebar position, density, post layout, the forum list, the page background (gradient,
  pattern, image) and effects. A live preview shows the home page, a board or a topic on desktop, tablet and phone
  in light and dark mode. Each theme keeps its own settings; themes can be duplicated, exported and imported as JSON,
  reset and activated. Admins with the custom code permission can add CSS to a theme and HTML before or after the
  header and footer.
- **Plugins:** Shoutbox (live chat on the home page), Discord (server widget and new-topic notifications through a
  webhook) and Game server status (FiveM, Minecraft and SA-MP, with player counts). They are off by default; enabling
  one adds its block to the home page.
- **Real-time notifications and messages:** notifications, new messages and read receipts arrive instantly without
  reloading, with an optional sound and the unread count in the tab title. The messages page has a new two-column
  messenger layout.
- **Login and register page layouts:** split with an image, centered or full-page cover, with your own headline and
  text; pages without an image now look finished.

### Changed

- **Forum list redesign:** cleaner board rows with topic and post counts, the last post with its author's avatar,
  and sub-boards as chips. Themes can show the list as a table, cards or a compact list.
- Themes: the SMF theme was removed and the IPS-style theme is now called **Community**. Existing forums keep their
  look; Modern and Community are now system themes in the theme studio. Theme options (accent, mode, font, corners,
  post layout) moved from Appearance to the theme studio.
- The profile cover without an image is now a flat color.
- Link previews (Open Graph) for boards show the category and counts, and use the forum's custom domain instead of
  Coolify's generated address.

### Fixed

- Admin → Appearance did not save (validation error on the banner color).
- Saving a board with topic template errors looked like nothing happened; the error is now shown next to the field
  and as a message.

## [1.1.1] - 2026-10-01

### Added

- **Updates on Coolify:** forums added to Coolify as a single image can now update with one click — enter the
  resource's Deploy Webhook URL and an API token under Admin → Updates → Update with Coolify.
- **SQLite → PostgreSQL transfer:** `node cli.mjs transfer-db postgres://…` copies every table into an empty
  PostgreSQL database, checks the row counts and never changes the source.
- A database backup (`pre-migrate`) is taken automatically before new migrations run on start.

### Fixed

- **Forum wiped on every Coolify redeploy:** when no persistent disk is mounted at `/app/storage` (Coolify with only the
  image), each redeploy started on an empty disk and opened the setup page again. The setup wizard, the admin
  dashboard and Admin → System now detect this and show how to add Persistent Storage and keep the current data;
  Coolify updates are blocked until the disk is persistent, and the Docker updater keeps such volumes when it
  recreates the container.
- Updates failed with only "fetch failed" when the updater container was missing; the Updates page now explains the
  reason (not found / not running / no answer) and how to fix it.
- The Admin → E-mail page now warns clearly when e-mails are not being sent (Log mode, no SMTP configured), and the
  "send me a sample" button no longer claims success in that mode.
- E-mails: the logo is visible on the white background and button text is readable on light accent colors; preview
  links use the forum's own address.

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
