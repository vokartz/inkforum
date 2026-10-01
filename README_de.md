<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/inkforum-wordmark-light.png">
  <img src=".github/assets/inkforum-wordmark-dark.png" alt="InkForum" width="360">
</picture>

### Moderne, schlanke Community-Software, die du komplett im Browser verwaltest

Gemacht für Gameserver, Rollenspiel-Communities, Marken und Hobbygruppen:
mit einem Befehl installiert, läuft entspannt auf einem günstigen VPS und aktualisiert sich mit einem Klick.

[![Neueste Version](https://img.shields.io/github/v/release/vokartz/inkforum?label=release&color=7b61ff)](https://github.com/vokartz/inkforum/releases)
[![Docker](https://img.shields.io/badge/docker-ghcr.io%2Fvokartz%2Finkforum-2496ed?logo=docker&logoColor=white)](https://github.com/vokartz/inkforum/pkgs/container/inkforum)
[![Plattform](https://img.shields.io/badge/platform-amd64%20%7C%20arm64-555)](#systemanforderungen)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-ffdd00?logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/vokartz)

[English](README.md) · [Türkçe](README_tr.md) · **Deutsch** · [简体中文](README_zh.md) · [Español](README_es.md) · [Français](README_fr.md) · [Русский](README_ru.md) · [Português](README_pt.md)

[Schnellstart](#-schnellstart) · [Funktionen](#-funktionen) · [Updates](#-updates) · [Backups](#-backup-und-wiederherstellung) · [Import](#-import-aus-einem-anderen-forum) · [FAQ](#-faq) · [Unterstützen](#-das-projekt-unterstützen)

</div>

---

## Warum InkForum?

| | |
|---|---|
| **In Minuten online** | Ein einzeiliger Installer richtet Docker ein, besorgt ein kostenloses HTTPS-Zertifikat für deine Domain und übergibt dich an einen freundlichen Einrichtungsassistenten. |
| **Schnell auf günstiger Hardware** | Ein einziger Prozess, standardmäßig mit SQLite – kein Redis, kein Suchserver, kein separater Datenbankserver. Ein VPS mit 1 GB RAM reicht völlig aus. |
| **Volle Kontrolle ohne Code** | Themes, Farben, Menüs, Startseite, Berechtigungen, E-Mail-Vorlagen, Plugins … alles steuerst du im Admin-Panel. |
| **Updates mit einem Klick** | Neue Versionen erscheinen samt Release Notes im Panel. Vorher wird ein Backup erstellt, und falls etwas schiefgeht, wird die vorherige Version automatisch wiederhergestellt. |
| **Sicher ab Werk** | Integrierte Web Application Firewall (WAF), Zwei-Faktor-Authentifizierung, erneute Anmeldung bei Admin-Aktionen, strikte Content Security Policy. |
| **Mehrsprachig** | Englisch, Türkisch, Deutsch, Chinesisch, Spanisch, Französisch, Russisch und Portugiesisch – jedes Mitglied wählt seine eigene Sprache. |

## 🚀 Schnellstart

Auf Ubuntu, Debian, Rocky, Alma oder jedem anderen Linux-Server, auf dem Docker läuft:

```bash
curl -fsSL https://raw.githubusercontent.com/vokartz/inkforum/main/install.sh | sudo bash
```

Das Skript:

1. installiert Docker, falls es fehlt (nach Rückfrage),
2. legt `/opt/inkforum` und eine `.env`-Datei mit starken, zufälligen Secrets an,
3. aktiviert **automatisches HTTPS** (Let's Encrypt über Caddy), wenn du eine Domain angibst,
4. startet InkForum und gibt deine **Einrichtungs-URL und deinen Einrichtungscode** aus.

Öffne `https://your-domain.com/install` im Browser. Der Assistent prüft deinen Server und fragt nach Forenname,
Theme, Administratorkonto, Registrierungsmodus, Plugins und (optional) E-Mail-Einstellungen. Das war's.

> **Warum ein Einrichtungscode?** Er verhindert, dass jemand anderes einen frisch installierten, öffentlich erreichbaren Server für sich beansprucht.
> Der Code wird nur im Server-Log ausgegeben: `docker compose -f /opt/inkforum/docker-compose.yml logs inkforum | grep "Setup code"`

### Manuelle Installation (Docker Compose)

```bash
mkdir -p /opt/inkforum && cd /opt/inkforum
curl -fsSLO https://raw.githubusercontent.com/vokartz/inkforum/main/docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/vokartz/inkforum/main/.env.example -o .env
# fill in APP_URL, APP_SECRET and UPDATER_TOKEN in .env
docker compose up -d
```

### Coolify, Dokploy, Portainer

Füge `docker-compose.yml` direkt in deiner Plattform hinzu und definiere `APP_URL`, `APP_SECRET` (mindestens 32 Zeichen) und
`UPDATER_TOKEN` (mindestens 16 Zeichen). Bringt die Plattform einen eigenen Reverse Proxy mit, belasse `TRUST_PROXY=uniquelocal`
und aktiviere das `https`-Profil (Caddy) nicht.

### Systemanforderungen

| | Minimum | Empfohlen |
|---|---|---|
| CPU | 1 vCPU (amd64 oder arm64) | 2 vCPU |
| Arbeitsspeicher | 1 GB | 2 GB |
| Speicherplatz | 5 GB | 20 GB + Uploads |
| Software | Docker 24+ mit dem Compose-Plugin | — |

Du kannst kein Docker nutzen (cPanel/Passenger, Plesk, reines Node.js)? Jede Version enthält zusätzlich ein **Serverpaket** – siehe
[Installation ohne Docker](#installation-ohne-docker).

## ✨ Funktionen

<details open>
<summary><b>Forum</b></summary>

- Kategorien, verschachtelte Boards, Link-Boards, Board-Cover und Regelseiten
- Themen-Präfixe, Tags, Umfragen, Anpinnen, Hervorheben, Schließen, Verschieben und Zusammenführen
- Rich-Text-Editor: Überschriften, Tabellen, Spoiler, Code, Farben, Bild-Uploads, automatisch gespeicherte Entwürfe
- Automatische Einbettungen von 24 Anbietern, darunter YouTube, Twitch, Kick, Spotify, X, Instagram, TikTok und Discord-Einladungen
- Zitate, @Erwähnungen, Emoji-Reaktionen, Reputation, Ungelesen-Markierung, Themen-Abonnements
- Erweiterte Suche, ähnliche Themen, Freigabewarteschlange, Bearbeitungsverlauf
</details>

<details>
<summary><b>Mitglieder & Community</b></summary>

- Fünf Registrierungsmodi (sofort, E-Mail-Bestätigung, Admin-Freigabe, beides, geschlossen) mit Bot-Schutz
- Gruppen, Ränge nach Beitragszahl, zeitlich begrenzte Mitgliedschaften, Beitrittsanfragen für Gruppen
- Profile mit Titelbild, benutzerdefinierten Feldern, Erfolgen, Signaturen und Privatsphäre-Einstellungen
- Private Unterhaltungen (1:1 und Gruppe), Benachrichtigungen und E-Mail-Benachrichtigungen
- Anmeldung mit Discord, Google und GitHub
</details>

<details>
<summary><b>Design</b></summary>

- Drei Themes: **Modern**, **Community** (großes Banner) und **Classic** (von SMF inspiriert, mit modernem Feinschliff)
- Hell-/Dunkelmodus, Akzentfarbe, 9 Schriftarten, Eckenradius, Banner, Logo und Hintergründe
- Menü-Editor und Startseiten-Blöcke per Drag & Drop
- **Studio**: ein Vollbild-Seitenbaukasten per Drag & Drop – Landingpages, Galerien, Serverkarten, Countdowns, Preistabellen, FAQs …
- Darstellung mit einem Klick auf die Standardwerte zurücksetzen
- Vollständig responsiv; lässt sich auf dem Startbildschirm installieren (PWA-Manifest)
</details>

<details>
<summary><b>Plugins</b></summary>

| Plugin | Funktion |
|---|---|
| **Landingpage** | Eine Studio-Seite wird zu deiner Startseite; das Forum zieht automatisch nach `/forum` um |
| **Wiki** | Unbegrenzt verschachtelte Seiten, Inhaltsverzeichnis, Suche, Seitenverlauf |
| **Bewerbungen** | Team- und Rollenbewerbungen mit 8 Fragetypen, Voraussetzungen, Prüfungen und automatischer Gruppenzuweisung |
| **Support-Tickets** | Zuständige Teams pro Kategorie, Status, Prioritäten, interne Notizen |
</details>

<details>
<summary><b>Suchmaschinen & Teilen</b></summary>

- Dynamische `robots.txt` und eine automatische, in Abschnitte gegliederte `sitemap.xml` (nur öffentliche Inhalte)
- Open-Graph- und X-Cards, kanonische URLs, strukturierte Daten (JSON-LD)
- Automatisch generierte **Vorschaubilder** für Themen (Titel, Board, Autor, Statistiken)
- oEmbed und einbettbare Themenkarten für andere Websites
- Verifizierung für Google, Bing und Yandex; optionales Blockieren von KI-Crawlern
</details>

<details>
<summary><b>Sicherheit</b></summary>

- Integrierte **Firewall**: Blockieren von Angriffsmustern, Rate Limiting, Blockieren schädlicher Bots, IP-/Bereichsregeln
- Challenge-Seite bei Angriffen: integriertes Proof-of-Work, Cloudflare Turnstile oder hCaptcha
- Passwörter mit argon2id, 2FA, Sitzungsverwaltung, erneute Anmeldung bei Admin-Aktionen
- Strikte CSP, CSRF-Schutz, SSRF-sichere Webhooks
- Sperren nach IP, E-Mail, Domain und Mitglied; Verwarnungspunkte mit automatischen Sanktionen
</details>

<details>
<summary><b>Integrationen</b></summary>

- OAuth-2.0-Provider („Mit deinem Forenkonto anmelden“, PKCE), REST-API mit Scopes, API-Schlüssel
- Signierte Webhooks (neues Thema, Registrierung, Gruppenwechsel …), signierte Mitglieder-Tokens für Game-Panels / UCPs
- Eigene HTML/CSS/JS-Snippets (abgesichert über CSP-Nonces) und eine `window.forum`-JavaScript-API
</details>

## 🔄 Updates

InkForum folgt den [Releases](https://github.com/vokartz/inkforum/releases) dieses Repositorys.

- **Admin → Updates** zeigt deine Version, die neueste Version und deren **Release Notes**.
- **Jetzt aktualisieren**: Datenbank-Backup → Download des neuen Images → Neustart mit Health Check → **automatisches Rollback**, falls
  die neue Version nicht hochfährt. Der Fortschritt wird live angezeigt.
- **Automatische Updates**: aus, nur Fehlerbehebungen (1.2.x), Fehlerbehebungen + Funktionen (1.x) oder alles – zu einer Nachtstunde deiner Wahl.
  Administratoren werden benachrichtigt, sobald eine neue Version veröffentlicht wird.
- Kanäle **Stable / Beta**.

Lieber auf der Kommandozeile?

```bash
cd /opt/inkforum && docker compose pull && docker compose up -d
```

Datenbankänderungen werden beim Start automatisch angewendet.

## 💾 Backup und Wiederherstellung

- **Admin → Wartung & Backups**: Datenbank-Snapshot, portabler **SQL-Dump** oder **Vollbackup** (Datenbank + hochgeladene Dateien).
- Tägliche automatische Backups zur gewünschten Uhrzeit; die neuesten N werden aufbewahrt. Außerdem wird vor jedem Update und jeder Wiederherstellung ein Backup erstellt.
- **Hochladen & wiederherstellen**: Lade ein Backup hoch (auch von einem anderen Server), bestätige mit der Eingabe `GERİ YÜKLE`, und InkForum stellt es
  beim Neustart wieder her – der aktuelle Stand wird vorher gesichert, sodass du jederzeit zurückkannst.
- Alles (Datenbank, Uploads, Backups) liegt im Docker-Volume `inkforum-storage`:

```bash
docker run --rm -v inkforum_inkforum-storage:/data -v "$PWD":/backup alpine tar czf /backup/inkforum-storage.tgz -C /data .
```

## 🚚 Import aus einem anderen Forum

Du wechselst von **SMF**, **phpBB**, **Invision Community (IPS)** oder **MyBB**? **Admin → Import** übernimmt aus einem Datenbank-Dump Mitglieder, Gruppen
und Rangbilder, Kategorien und Boards, Themen, Beiträge, Umfragen, private Nachrichten, Anhänge und Avatare.
Mitglieder behalten ihre Passwörter, sofern sich das alte Hash-Verfahren prüfen lässt; andernfalls vergeben sie über „Passwort vergessen“ ein neues.

## ⚙️ Konfiguration

Alle Foreneinstellungen findest du im Admin-Panel. Die `.env`-Datei beschreibt nur die Infrastruktur:

| Variable | Beschreibung |
|---|---|
| `APP_URL` | Vollständige Adresse der Website (`https://forum.example.com`) |
| `APP_SECRET` | Sitzungs- und Verschlüsselungsschlüssel (32+ Zeichen; eine Änderung meldet alle ab) |
| `UPDATER_TOKEN` | Gemeinsamer Schlüssel mit dem Updater-Container |
| `DOMAIN`, `COMPOSE_PROFILES=https` | Automatisches HTTPS mit Caddy |
| `DB_DRIVER`, `DATABASE_URL` | PostgreSQL verwenden (`postgres` zu `COMPOSE_PROFILES` hinzufügen) |
| `TRUST_PROXY` | Echte Client-IPs hinter einem Reverse Proxy (`uniquelocal` empfohlen) |
| `INKFORUM_PORT`, `INKFORUM_BIND` | Veröffentlichter Port und Bind-Adresse |
| `UPDATES_DISABLED` | Update-Prüfung auf Offline-Servern deaktivieren |
| `WAF_DISABLED` | Notschalter zum Deaktivieren der Firewall |

## Installation ohne Docker

Jede Version enthält `inkforum-<version>-linux-x64.tar.gz` (inklusive Abhängigkeiten) und `inkforum-<version>.tar.gz`.
Erforderlich ist Node.js 22.13 oder neuer.

```bash
curl -fsSLO https://github.com/vokartz/inkforum/releases/latest/download/inkforum-<version>-linux-x64.tar.gz
tar xzf inkforum-*-linux-x64.tar.gz && cd inkforum
cp .env.example .env   # fill in APP_URL and APP_SECRET
NODE_ENV=production node --env-file=.env server.mjs
```

Betreibe es mit systemd, PM2 oder Passenger. Updates aus dem Panel laden das Paket herunter, prüfen es per SHA-256, installieren es
und starten den Prozess neu (dein Prozessmanager muss ihn neu starten). Beispiel für eine systemd-Unit:

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

**Welche Datenbank sollte ich wählen?**
SQLite genügt für die meisten Communities und braucht die wenigste Pflege. PostgreSQL wird für sehr große
Communities unterstützt oder wenn du eine verwaltete Datenbank bevorzugst.

**Mein Server hat keinen Internetzugang – was ist mit Updates?**
Setze `UPDATES_DISABLED=true`, lade das neue Image manuell und führe `docker compose up -d` aus.

**Die Firewall hat mich ausgesperrt.**
Füge `WAF_DISABLED=true` zur `.env` hinzu, führe `docker compose up -d` aus und korrigiere dann die Einstellungen im Panel.

**Ich habe das Admin-Passwort vergessen.**
Nutze „Passwort vergessen“ auf der Anmeldeseite. Ohne E-Mail-Einstellungen wird der Link nach `storage/mail` geschrieben:
`docker compose exec inkforum ls /app/storage/mail`

## 🐞 Fehlerberichte & Ideen

Einen Fehler gefunden oder eine Idee? [Erstelle ein Issue](https://github.com/vokartz/inkforum/issues/new/choose) – die Formulare führen dich
durch alle Angaben, die wir brauchen. In deinem Forum füllt **Admin → Systeminfo → „Fehler auf GitHub melden“** deine Version und
Umgebung automatisch aus. Sicherheitsprobleme meldest du bitte über [private Advisories](https://github.com/vokartz/inkforum/security/advisories/new).

## ☕ Das Projekt unterstützen

InkForum wird von einem kleinen Team entwickelt. Wenn es deiner Community hilft, kannst du dafür sorgen, dass die Tinte weiter fließt:

<a href="https://buymeacoffee.com/vokartz"><img src="https://img.shields.io/badge/Buy%20me%20a%20coffee-ffdd00?style=for-the-badge&logo=buymeacoffee&logoColor=black" alt="Buy Me a Coffee"></a>

### 💛 Unterstützer

Ein großes Dankeschön an alle, die InkForum unterstützen. Unterstützer werden hier mit ihrer Zustimmung aufgeführt.

<!-- SUPPORTERS:START -->
| | |
|---|---|
| *Hier könnte dein Name oder deine Community stehen* | [Unterstützer werden](https://buymeacoffee.com/vokartz) |
<!-- SUPPORTERS:END -->

Weitere Möglichkeiten zu helfen: ⭐ dieses Repository mit einem Stern versehen, Fehler melden, Funktionen vorschlagen, InkForum in deine Sprache übersetzen
oder anderen Community-Betreibern davon erzählen.

## Lizenz

InkForum ist freie Open-Source-Software unter der [GNU AGPL-3.0](LICENSE). Du darfst sie nutzen, untersuchen, ändern und weitergeben;
wenn du eine veränderte Version für andere betreibst (auch als gehosteten Dienst), musst du deine Änderungen unter derselben Lizenz veröffentlichen.
Mitwirken: [CONTRIBUTING.md](CONTRIBUTING.md). Änderungen: [CHANGELOG.md](CHANGELOG.md). Sicherheit: [SECURITY.md](SECURITY.md).

<div align="center"><sub>© InkForum · mit ♥ gemacht in der Türkei</sub></div>
