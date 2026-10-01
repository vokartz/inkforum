<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/inkforum-wordmark-light.png">
  <img src=".github/assets/inkforum-wordmark-dark.png" alt="InkForum" width="360">
</picture>

### Un logiciel communautaire moderne et léger, entièrement administrable depuis votre navigateur

Conçu pour les serveurs de jeu, les communautés de jeu de rôle, les marques et les groupes de passionnés :
il s'installe en une commande, tourne sans peine sur un VPS bon marché et se met à jour en un clic.

[![Dernière version](https://img.shields.io/github/v/release/vokartz/inkforum?label=release&color=7b61ff)](https://github.com/vokartz/inkforum/releases)
[![Docker](https://img.shields.io/badge/docker-ghcr.io%2Fvokartz%2Finkforum-2496ed?logo=docker&logoColor=white)](https://github.com/vokartz/inkforum/pkgs/container/inkforum)
[![Plateforme](https://img.shields.io/badge/platform-amd64%20%7C%20arm64-555)](#configuration-requise)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-ffdd00?logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/vokartz)

[English](README.md) · [Türkçe](README_tr.md) · [Deutsch](README_de.md) · [简体中文](README_zh.md) · [Español](README_es.md) · **Français** · [Русский](README_ru.md) · [Português](README_pt.md)

[Démarrage rapide](#-démarrage-rapide) · [Fonctionnalités](#-fonctionnalités) · [Mises à jour](#-mises-à-jour) · [Sauvegardes](#-sauvegardes-et-restauration) · [Import](#-importer-depuis-un-autre-forum) · [FAQ](#-faq) · [Soutien](#-soutenir-le-projet)

</div>

---

## Pourquoi InkForum ?

| | |
|---|---|
| **En ligne en quelques minutes** | Un installateur en une ligne prépare Docker, obtient un certificat HTTPS gratuit pour votre domaine, puis vous confie à un assistant de configuration convivial. |
| **Rapide sur du matériel modeste** | Un seul processus, avec SQLite par défaut : ni Redis, ni serveur de recherche, ni serveur de base de données séparé. Un VPS avec 1 Go de RAM suffit largement. |
| **Contrôle total, sans code** | Thèmes, couleurs, menus, page d'accueil, permissions, modèles d'e-mail, plugins… tout se gère depuis le panneau d'administration. |
| **Mises à jour en un clic** | Les nouvelles versions apparaissent dans le panneau avec leurs notes de version. Une sauvegarde est effectuée au préalable et, en cas de problème, la version précédente est restaurée automatiquement. |
| **Sécurisé par défaut** | Pare-feu applicatif web (WAF) intégré, authentification à deux facteurs, réauthentification pour les actions d'administration, Content Security Policy stricte. |
| **Multilingue** | Anglais, turc, allemand, chinois, espagnol, français, russe et portugais : chaque membre choisit sa langue. |

## 🚀 Démarrage rapide

Sur Ubuntu, Debian, Rocky, Alma ou tout serveur Linux capable d'exécuter Docker :

```bash
curl -fsSL https://raw.githubusercontent.com/vokartz/inkforum/main/install.sh | sudo bash
```

Le script :

1. installe Docker s'il est absent (après vous l'avoir demandé),
2. crée `/opt/inkforum` et un fichier `.env` contenant des secrets aléatoires robustes,
3. active le **HTTPS automatique** (Let's Encrypt via Caddy) si vous indiquez un domaine,
4. démarre InkForum et affiche votre **URL et votre code d'installation**.

Ouvrez `https://your-domain.com/install` dans votre navigateur. L'assistant vérifie votre serveur puis vous demande le nom du forum,
le thème, le compte administrateur, le mode d'inscription, les plugins et (facultativement) les paramètres d'e-mail. C'est tout.

> **Pourquoi un code d'installation ?** Il empêche quiconque de s'approprier un serveur fraîchement installé et exposé à Internet.
> Le code est uniquement affiché dans le journal du serveur : `docker compose -f /opt/inkforum/docker-compose.yml logs inkforum | grep "Setup code"`

### Installation manuelle (Docker Compose)

```bash
mkdir -p /opt/inkforum && cd /opt/inkforum
curl -fsSLO https://raw.githubusercontent.com/vokartz/inkforum/main/docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/vokartz/inkforum/main/.env.example -o .env
# fill in APP_URL, APP_SECRET and UPDATER_TOKEN in .env
docker compose up -d
```

### Coolify, Dokploy, Portainer

Ajoutez directement `docker-compose.yml` à votre plateforme et définissez `APP_URL`, `APP_SECRET` (au moins 32 caractères) et
`UPDATER_TOKEN` (au moins 16 caractères). Si la plateforme fournit son propre reverse proxy, conservez `TRUST_PROXY=uniquelocal`
et n'activez pas le profil `https` (Caddy).

### Configuration requise

| | Minimum | Recommandé |
|---|---|---|
| CPU | 1 vCPU (amd64 ou arm64) | 2 vCPU |
| Mémoire | 1 Go | 2 Go |
| Disque | 5 Go | 20 Go + fichiers envoyés |
| Logiciel | Docker 24+ avec le plugin Compose | — |

Vous ne pouvez pas utiliser Docker (cPanel/Passenger, Plesk, Node.js seul) ? Chaque version inclut aussi un **paquet serveur** : voir
[Installation sans Docker](#installation-sans-docker).

## ✨ Fonctionnalités

<details open>
<summary><b>Forum</b></summary>

- Catégories, sous-forums imbriqués, forums-liens, couvertures de forum et pages de règles
- Préfixes de sujet, tags, sondages, épinglage, mise en avant, verrouillage, déplacement et fusion
- Éditeur de texte enrichi : titres, tableaux, spoilers, code, couleurs, envoi d'images, brouillons enregistrés automatiquement
- Intégrations automatiques de 24 plateformes, dont YouTube, Twitch, Kick, Spotify, X, Instagram, TikTok et les invitations Discord
- Citations, @mentions, réactions emoji, réputation, suivi des messages non lus, abonnements aux sujets
- Recherche avancée, sujets similaires, file de validation, historique des modifications
</details>

<details>
<summary><b>Membres et communauté</b></summary>

- Cinq modes d'inscription (immédiate, vérification par e-mail, validation par un administrateur, les deux, fermée) avec protection anti-bots
- Groupes, rangs selon le nombre de messages, adhésions à durée limitée, demandes d'adhésion aux groupes
- Profils avec photo de couverture, champs personnalisés, succès, signatures et paramètres de confidentialité
- Conversations privées (en tête-à-tête et en groupe), notifications et notifications par e-mail
- Connexion avec Discord, Google et GitHub
</details>

<details>
<summary><b>Design</b></summary>

- Trois thèmes : **Modern**, **Community** (grande bannière) et **Classic** (inspiré de SMF, avec une touche de modernité)
- Mode clair/sombre, couleur d'accentuation, 9 polices, arrondi des angles, bannière, logo et arrière-plans
- Éditeur de menus et blocs de page d'accueil en glisser-déposer
- **Studio** : un constructeur de pages plein écran en glisser-déposer — pages d'accueil, galeries, cartes de serveur, comptes à rebours, grilles tarifaires, FAQ…
- Réinitialisation de l'apparence aux valeurs par défaut en un clic
- Entièrement responsive ; installable sur l'écran d'accueil (manifeste PWA)
</details>

<details>
<summary><b>Plugins</b></summary>

| Plugin | Ce qu'il fait |
|---|---|
| **Page d'accueil** | Une page Studio devient votre page d'accueil ; le forum est automatiquement déplacé vers `/forum` |
| **Wiki** | Pages imbriquées illimitées, table des matières, recherche, historique des pages |
| **Candidatures** | Candidatures pour l'équipe et pour des rôles avec 8 types de questions, prérequis, évaluations et attribution automatique de groupe |
| **Tickets de support** | Équipes responsables par catégorie, statuts, priorités, notes internes |
</details>

<details>
<summary><b>Moteurs de recherche et partage</b></summary>

- `robots.txt` dynamique et `sitemap.xml` automatique découpé en sections (contenu public uniquement)
- Cartes Open Graph et X, URL canoniques, données structurées (JSON-LD)
- **Images de partage** générées automatiquement pour les sujets (titre, forum, auteur, statistiques)
- oEmbed et cartes de sujet intégrables sur d'autres sites
- Vérification Google, Bing et Yandex ; blocage facultatif des robots d'IA
</details>

<details>
<summary><b>Sécurité</b></summary>

- **Pare-feu** intégré : blocage des schémas d'attaque, limitation du débit, blocage des bots malveillants, règles par IP/plage
- Page de vérification en cas d'attaque : proof-of-work intégré, Cloudflare Turnstile ou hCaptcha
- Mots de passe argon2id, 2FA, gestion des sessions, réauthentification pour les actions d'administration
- CSP stricte, protection CSRF, webhooks protégés contre les attaques SSRF
- Bannissements par IP, e-mail, domaine et membre ; points d'avertissement avec sanctions automatiques
</details>

<details>
<summary><b>Intégrations</b></summary>

- Fournisseur OAuth 2.0 (« Se connecter avec votre compte du forum », PKCE), API REST à portées, clés d'API
- Webhooks signés (nouveau sujet, inscription, changement de groupe…), jetons de membre signés pour les panels de jeu / UCP
- Extraits HTML/CSS/JS personnalisés (sécurisés par des nonces CSP) et une API JavaScript `window.forum`
</details>

## 🔄 Mises à jour

InkForum suit les [versions publiées](https://github.com/vokartz/inkforum/releases) de ce dépôt.

- **Admin → Mises à jour** affiche votre version, la dernière version disponible et ses **notes de version**.
- **Mettre à jour maintenant** : sauvegarde de la base de données → téléchargement de la nouvelle image → redémarrage avec contrôle de santé → **retour arrière automatique** si la
  nouvelle version ne démarre pas. La progression s'affiche en direct.
- **Mises à jour automatiques** : désactivées, correctifs uniquement (1.2.x), correctifs + fonctionnalités (1.x) ou tout, à l'heure de la nuit de votre choix.
  Les administrateurs reçoivent une notification dès qu'une nouvelle version est publiée.
- Canaux **Stable / Bêta**.

Vous préférez la ligne de commande ?

```bash
cd /opt/inkforum && docker compose pull && docker compose up -d
```

Les modifications de la base de données sont appliquées automatiquement au démarrage.

## 💾 Sauvegardes et restauration

- **Admin → Maintenance et sauvegardes** : instantané de la base de données, **dump SQL** portable ou **sauvegarde complète** (base de données + fichiers envoyés).
- Sauvegardes automatiques quotidiennes à l'heure de votre choix ; les N plus récentes sont conservées. Une sauvegarde est également effectuée avant chaque mise à jour et chaque restauration.
- **Envoyer et restaurer** : envoyez une sauvegarde (y compris depuis un autre serveur), tapez `GERİ YÜKLE` pour confirmer et InkForum la restaure
  au redémarrage — l'état actuel est sauvegardé au préalable, vous pouvez donc toujours revenir en arrière.
- Tout (base de données, fichiers envoyés, sauvegardes) se trouve dans le volume Docker `inkforum-storage` :

```bash
docker run --rm -v inkforum_inkforum-storage:/data -v "$PWD":/backup alpine tar czf /backup/inkforum-storage.tgz -C /data .
```

## 🚚 Importer depuis un autre forum

Vous quittez **SMF**, **phpBB**, **Invision Community (IPS)** ou **MyBB** ? **Admin → Import** récupère depuis un dump de base de données les membres, les groupes
et les images de rang, les catégories et les forums, les sujets, les messages, les sondages, les messages privés, les pièces jointes et les avatars.
Les membres conservent leur mot de passe lorsque l'ancien algorithme de hachage peut être vérifié ; sinon, ils en définissent un nouveau via « Mot de passe oublié ».

## ⚙️ Configuration

Tous les paramètres du forum se trouvent dans le panneau d'administration. Le fichier `.env` ne décrit que l'infrastructure :

| Variable | Description |
|---|---|
| `APP_URL` | Adresse complète du site (`https://forum.example.com`) |
| `APP_SECRET` | Clé de session et de chiffrement (32 caractères ou plus ; la modifier déconnecte tout le monde) |
| `UPDATER_TOKEN` | Clé partagée avec le conteneur de mise à jour |
| `DOMAIN`, `COMPOSE_PROFILES=https` | HTTPS automatique avec Caddy |
| `DB_DRIVER`, `DATABASE_URL` | Utiliser PostgreSQL (ajoutez `postgres` à `COMPOSE_PROFILES`) |
| `TRUST_PROXY` | Vraies adresses IP des clients derrière un reverse proxy (`uniquelocal` recommandé) |
| `INKFORUM_PORT`, `INKFORUM_BIND` | Port publié et adresse d'écoute |
| `UPDATES_DISABLED` | Désactive la recherche de mises à jour sur les serveurs hors ligne |
| `WAF_DISABLED` | Interrupteur d'urgence pour désactiver le pare-feu |

## Installation sans Docker

Chaque version contient `inkforum-<version>-linux-x64.tar.gz` (dépendances incluses) et `inkforum-<version>.tar.gz`.
Node.js 22.13 ou une version plus récente est requis.

```bash
curl -fsSLO https://github.com/vokartz/inkforum/releases/latest/download/inkforum-<version>-linux-x64.tar.gz
tar xzf inkforum-*-linux-x64.tar.gz && cd inkforum
cp .env.example .env   # fill in APP_URL and APP_SECRET
NODE_ENV=production node --env-file=.env server.mjs
```

Exécutez-le avec systemd, PM2 ou Passenger. Les mises à jour lancées depuis le panneau téléchargent le paquet, le vérifient avec SHA-256, l'installent
puis redémarrent le processus (votre gestionnaire de processus doit se charger de le relancer). Exemple d'unité systemd :

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

**Quelle base de données choisir ?**
SQLite suffit pour la plupart des communautés et demande le moins d'entretien. PostgreSQL est pris en charge pour les très grandes
communautés ou si vous préférez une base de données managée.

**Mon serveur n'a pas accès à Internet : comment faire les mises à jour ?**
Définissez `UPDATES_DISABLED=true`, chargez manuellement la nouvelle image puis exécutez `docker compose up -d`.

**Le pare-feu m'a bloqué l'accès.**
Ajoutez `WAF_DISABLED=true` au fichier `.env`, exécutez `docker compose up -d`, puis corrigez les paramètres dans le panneau.

**J'ai oublié le mot de passe administrateur.**
Utilisez « Mot de passe oublié » sur la page de connexion. Sans paramètres d'e-mail, le lien est écrit dans `storage/mail` :
`docker compose exec inkforum ls /app/storage/mail`

## 🐞 Signaler un bug ou proposer une idée

Vous avez trouvé un bug ou vous avez une idée ? [Ouvrez une issue](https://github.com/vokartz/inkforum/issues/new/choose) : les formulaires vous guident
pour fournir toutes les informations nécessaires. Dans votre forum, **Admin → Informations système → « Signaler un bug sur GitHub »** préremplit votre version et
votre environnement. Pour les problèmes de sécurité, utilisez les [avis de sécurité privés](https://github.com/vokartz/inkforum/security/advisories/new).

## ☕ Soutenir le projet

InkForum est développé par une petite équipe. S'il est utile à votre communauté, vous pouvez aider l'encre à continuer de couler :

<a href="https://buymeacoffee.com/vokartz"><img src="https://img.shields.io/badge/Buy%20me%20a%20coffee-ffdd00?style=for-the-badge&logo=buymeacoffee&logoColor=black" alt="Buy Me a Coffee"></a>

### 💛 Soutiens

Un grand merci à toutes celles et ceux qui soutiennent InkForum. Les soutiens figurent ici avec leur accord.

<!-- SUPPORTERS:START -->
| | |
|---|---|
| *Votre nom ou votre communauté pourrait figurer ici* | [Devenir soutien](https://buymeacoffee.com/vokartz) |
<!-- SUPPORTERS:END -->

Autres façons d'aider : ⭐ ajoutez une étoile à ce dépôt, signalez des bugs, proposez des fonctionnalités, traduisez InkForum dans votre langue
ou parlez-en à d'autres responsables de communautés.

## Licence

InkForum est un logiciel libre et open source sous licence [GNU AGPL-3.0](LICENSE). Vous pouvez l’utiliser, l’étudier, le modifier et le partager ;
si vous faites fonctionner une version modifiée pour d’autres (y compris en tant que service hébergé), vous devez publier vos modifications sous la même licence.
Contribuer : [CONTRIBUTING.md](CONTRIBUTING.md). Modifications : [CHANGELOG.md](CHANGELOG.md). Sécurité : [SECURITY.md](SECURITY.md).

<div align="center"><sub>© InkForum · fait avec ♥ en Turquie</sub></div>
