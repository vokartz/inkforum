<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/inkforum-wordmark-light.png">
  <img src=".github/assets/inkforum-wordmark-dark.png" alt="InkForum" width="360">
</picture>

### Software de comunidade moderno e leve, que você gerencia inteiramente pelo navegador

Feito para servidores de jogos, comunidades de roleplay, marcas e grupos de hobby:
instala com um único comando, roda tranquilamente em uma VPS barata e se atualiza com um clique.

[![Versão mais recente](https://img.shields.io/github/v/release/vokartz/inkforum?label=release&color=7b61ff)](https://github.com/vokartz/inkforum/releases)
[![Docker](https://img.shields.io/badge/docker-ghcr.io%2Fvokartz%2Finkforum-2496ed?logo=docker&logoColor=white)](https://github.com/vokartz/inkforum/pkgs/container/inkforum)
[![Plataforma](https://img.shields.io/badge/platform-amd64%20%7C%20arm64-555)](#requisitos)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-ffdd00?logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/vokartz)

[English](README.md) · [Türkçe](README_tr.md) · [Deutsch](README_de.md) · [简体中文](README_zh.md) · [Español](README_es.md) · [Français](README_fr.md) · [Русский](README_ru.md) · **Português**

[Início rápido](#-início-rápido) · [Recursos](#-recursos) · [Atualizações](#-atualizações) · [Backups](#-backups-e-restauração) · [Importação](#-importar-de-outro-fórum) · [Perguntas frequentes](#-perguntas-frequentes) · [Apoie](#-apoie-o-projeto)

</div>

---

## Por que InkForum?

| | |
|---|---|
| **No ar em minutos** | Um instalador de uma linha prepara o Docker, obtém um certificado HTTPS gratuito para o seu domínio e entrega você a um assistente de configuração simples e amigável. |
| **Rápido em hardware barato** | Um único processo, com SQLite por padrão — sem Redis, sem servidor de busca, sem servidor de banco de dados separado. Uma VPS com 1 GB de RAM é mais do que suficiente. |
| **Controle total sem código** | Temas, cores, menus, página inicial, permissões, modelos de e-mail, plugins… tudo fica no painel de administração. |
| **Atualizações com um clique** | Novas versões aparecem no painel com as notas de versão. Um backup é feito antes e, se algo der errado, a versão anterior é restaurada automaticamente. |
| **Seguro por padrão** | Firewall de aplicação web (WAF) integrado, autenticação em dois fatores, reautenticação para ações administrativas e Content Security Policy rigorosa. |
| **Multilíngue** | Inglês, turco, alemão, chinês, espanhol, francês, russo e português — cada membro escolhe o próprio idioma. |

## 🚀 Início rápido

No Ubuntu, Debian, Rocky, Alma ou em qualquer servidor Linux capaz de rodar Docker:

```bash
curl -fsSL https://raw.githubusercontent.com/vokartz/inkforum/main/install.sh | sudo bash
```

O script:

1. instala o Docker, caso ele não esteja presente (depois de perguntar a você),
2. cria `/opt/inkforum` e um arquivo `.env` com segredos aleatórios fortes,
3. ativa o **HTTPS automático** (Let's Encrypt via Caddy) se você informar um domínio,
4. inicia o InkForum e exibe sua **URL de instalação**.

Abra `https://your-domain.com/install` no navegador. O assistente verifica seu servidor e pede o nome do fórum,
o tema, a conta de administrador, o modo de cadastro, os plugins e (opcionalmente) as configurações de e-mail. Pronto.

> **Conclua a instalação imediatamente.** Não há código de instalação: a primeira pessoa que concluir o assistente se torna administradora,
> então abra `/install` assim que o InkForum estiver no ar. O endereço do site é detectado pelo seu navegador e salvo.

### Instalação manual (Docker Compose)

```bash
mkdir -p /opt/inkforum && cd /opt/inkforum
curl -fsSLO https://raw.githubusercontent.com/vokartz/inkforum/main/docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/vokartz/inkforum/main/.env.example -o .env
# opcional: APP_URL, APP_SECRET e UPDATER_TOKEN são detectados ou gerados automaticamente
docker compose up -d
```

### Coolify, Dokploy, Portainer

Adicione o `docker-compose.yml` (ou a imagem `ghcr.io/vokartz/inkforum`) diretamente à sua plataforma; nenhuma variável é obrigatória:
o endereço vem da plataforma (Coolify) ou é detectado no assistente de instalação, e as chaves secretas são geradas
e guardadas no volume `storage`. Se a plataforma tiver seu próprio proxy reverso, mantenha `TRUST_PROXY=uniquelocal` e não ative o perfil `https` (Caddy).

### Requisitos

| | Mínimo | Recomendado |
|---|---|---|
| CPU | 1 vCPU (amd64 ou arm64) | 2 vCPU |
| Memória | 1 GB | 2 GB |
| Disco | 5 GB | 20 GB + uploads |
| Software | Docker 24+ com o plugin Compose | — |

Não pode usar Docker (cPanel/Passenger, Plesk, Node.js puro)? Toda versão também inclui um **pacote de servidor** — veja
[Instalação sem Docker](#instalação-sem-docker).

## ✨ Recursos

<details open>
<summary><b>Fórum</b></summary>

- Categorias, subfóruns aninhados, fóruns de link, capas de fórum e páginas de regras
- Prefixos de tópico, tags, enquetes, fixar, destacar, trancar, mover e mesclar tópicos
- Editor de texto rico: títulos, tabelas, spoilers, código, cores, upload de imagens, rascunhos salvos automaticamente
- Incorporação automática de 24 provedores, incluindo YouTube, Twitch, Kick, Spotify, X, Instagram, TikTok e convites do Discord
- Citações, @menções, reações com emoji, reputação, controle de não lidos, inscrição em tópicos
- Busca avançada, tópicos semelhantes, fila de aprovação, histórico de edições
</details>

<details>
<summary><b>Membros e comunidade</b></summary>

- Cinco modos de cadastro (imediato, verificação por e-mail, aprovação do administrador, ambos, fechado) com proteção contra bots
- Grupos, ranks por número de posts, assinaturas por tempo limitado, pedidos de entrada em grupos
- Perfis com foto de capa, campos personalizados, conquistas, assinaturas e configurações de privacidade
- Conversas privadas (1:1 e em grupo), notificações e notificações por e-mail
- Login com Discord, Google e GitHub
</details>

<details>
<summary><b>Design</b></summary>

- Três temas: **Modern**, **Community** (banner grande) e **Classic** (inspirado no SMF, com toques modernos)
- Modo claro/escuro, cor de destaque, 9 fontes, arredondamento de cantos, banner, logo e planos de fundo
- Editor de menus e blocos da página inicial com arrastar e soltar
- **Studio**: um construtor de páginas em tela cheia com arrastar e soltar — landing pages, galerias, cards de servidor, contagens regressivas, tabelas de preços, FAQs…
- Restaure a aparência para o padrão com um clique
- Totalmente responsivo; pode ser instalado na tela inicial (manifesto PWA)
</details>

<details>
<summary><b>Plugins</b></summary>

| Plugin | O que faz |
|---|---|
| **Landing page** | Uma página do Studio vira sua página inicial; o fórum é movido automaticamente para `/forum` |
| **Wiki** | Páginas aninhadas ilimitadas, sumário, busca, histórico de páginas |
| **Candidaturas** | Candidaturas para a equipe e para cargos com 8 tipos de pergunta, requisitos, avaliações e atribuição automática de grupo |
| **Tickets de suporte** | Equipes responsáveis por categoria, status, prioridades, notas internas |
</details>

<details>
<summary><b>Mecanismos de busca e compartilhamento</b></summary>

- `robots.txt` dinâmico e um `sitemap.xml` automático dividido em seções (somente conteúdo público)
- Cards Open Graph e do X, URLs canônicas, dados estruturados (JSON-LD)
- **Imagens de compartilhamento** geradas automaticamente para tópicos (título, fórum, autor, estatísticas)
- oEmbed e cards de tópico incorporáveis em outros sites
- Verificação do Google, Bing e Yandex; bloqueio opcional de crawlers de IA
</details>

<details>
<summary><b>Segurança</b></summary>

- **Firewall** integrado: bloqueio de padrões de ataque, limitação de requisições, bloqueio de bots maliciosos, regras por IP/faixa
- Página de desafio durante ataques: proof-of-work integrado, Cloudflare Turnstile ou hCaptcha
- Senhas com argon2id, 2FA, gerenciamento de sessões, reautenticação para ações administrativas
- CSP rigorosa, proteção contra CSRF, webhooks protegidos contra SSRF
- Banimentos por IP, e-mail, domínio e membro; pontos de advertência com punições automáticas
</details>

<details>
<summary><b>Integrações</b></summary>

- Provedor OAuth 2.0 ("Entrar com sua conta do fórum", PKCE), API REST com escopos, chaves de API
- Webhooks assinados (novo tópico, cadastro, mudança de grupo…), tokens de membro assinados para painéis de jogo / UCPs
- Snippets HTML/CSS/JS personalizados (seguros via nonces de CSP) e uma API JavaScript `window.forum`
</details>

## 🔄 Atualizações

O InkForum acompanha as [releases](https://github.com/vokartz/inkforum/releases) deste repositório.

- **Admin → Atualizações** mostra sua versão, a versão mais recente e as respectivas **notas de versão**.
- **Atualizar agora**: backup do banco de dados → download da nova imagem → reinício com verificação de integridade → **rollback automático** se a
  nova versão não subir. O progresso é exibido em tempo real.
- **Atualizações automáticas**: desativadas, somente correções (1.2.x), correções + recursos (1.x) ou tudo, em um horário noturno à sua escolha.
  Os administradores recebem uma notificação quando uma nova versão é publicada.
- Canais **Estável / Beta**.

Prefere a linha de comando?

```bash
cd /opt/inkforum && docker compose pull && docker compose up -d
```

As alterações no banco de dados são aplicadas automaticamente na inicialização.

## 💾 Backups e restauração

- **Admin → Manutenção e backups**: snapshot do banco de dados, **dump SQL** portátil ou **backup completo** (banco de dados + arquivos enviados).
- Backups automáticos diários no horário que você escolher; os N mais recentes são mantidos. Um backup também é feito antes de cada atualização e de cada restauração.
- **Enviar e restaurar**: envie um backup (inclusive de outro servidor), digite `GERİ YÜKLE` para confirmar e o InkForum o restaura
  durante o reinício — o estado atual é salvo antes, então você sempre pode voltar atrás.
- Tudo (banco de dados, uploads, backups) fica no volume Docker `inkforum-storage`:

```bash
docker run --rm -v inkforum_inkforum-storage:/data -v "$PWD":/backup alpine tar czf /backup/inkforum-storage.tgz -C /data .
```

## 🚚 Importar de outro fórum

Está vindo do **SMF**, **phpBB**, **Invision Community (IPS)** ou **MyBB**? **Admin → Importar** traz, a partir de um dump do banco de dados, membros, grupos
e imagens de rank, categorias e fóruns, tópicos, posts, enquetes, mensagens privadas, anexos e avatares.
Os membros mantêm suas senhas quando o antigo esquema de hash pode ser verificado; caso contrário, definem uma nova em "Esqueci minha senha".

## ⚙️ Configuração

Todas as configurações do fórum ficam no painel de administração. O arquivo `.env` descreve apenas a infraestrutura:

| Variável | Descrição |
|---|---|
| `APP_URL` | Endereço completo do site (`https://forum.example.com`); opcional — detectado no assistente de instalação |
| `APP_SECRET` | Chave de sessão e criptografia (32+ caracteres; alterá-la desconecta todo mundo); opcional — gerada automaticamente |
| `UPDATER_TOKEN` | Chave compartilhada com o contêiner de atualização; opcional — gerada automaticamente |
| `DOMAIN`, `COMPOSE_PROFILES=https` | HTTPS automático com Caddy |
| `DB_DRIVER`, `DATABASE_URL` | Usar PostgreSQL (adicione `postgres` a `COMPOSE_PROFILES`) |
| `TRUST_PROXY` | IPs reais dos clientes atrás de um proxy reverso (`uniquelocal` recomendado) |
| `INKFORUM_PORT`, `INKFORUM_BIND` | Porta publicada e endereço de bind |
| `UPDATES_DISABLED` | Desativa a verificação de atualizações em servidores offline |
| `WAF_DISABLED` | Chave de emergência para desativar o firewall |

## Instalação sem Docker

Toda versão contém `inkforum-<version>-linux-x64.tar.gz` (dependências incluídas) e `inkforum-<version>.tar.gz`.
É necessário Node.js 22.13 ou mais recente.

```bash
curl -fsSLO https://github.com/vokartz/inkforum/releases/latest/download/inkforum-<version>-linux-x64.tar.gz
tar xzf inkforum-*-linux-x64.tar.gz && cd inkforum
cp .env.example .env   # opcional: tudo é detectado ou gerado automaticamente
NODE_ENV=production node --env-file=.env server.mjs
```

Execute com systemd, PM2 ou Passenger. As atualizações pelo painel baixam o pacote, verificam-no com SHA-256, instalam-no
e reiniciam o processo (seu gerenciador de processos precisa reiniciá-lo). Exemplo de unit do systemd:

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

## ❓ Perguntas frequentes

**Qual banco de dados devo escolher?**
O SQLite atende à maioria das comunidades e é o que exige menos manutenção. O PostgreSQL é suportado para comunidades muito grandes
ou se você preferir um banco de dados gerenciado.

**Meu servidor não tem acesso à internet — e as atualizações?**
Defina `UPDATES_DISABLED=true`, carregue a nova imagem manualmente e execute `docker compose up -d`.

**O firewall me bloqueou.**
Adicione `WAF_DISABLED=true` ao `.env`, execute `docker compose up -d` e depois corrija as configurações no painel.

**Esqueci a senha de administrador.**
Use "Esqueci minha senha" na página de login. Sem configurações de e-mail, o link é gravado em `storage/mail`:
`docker compose exec inkforum ls /app/storage/mail`

## 🐞 Relatos de bugs e ideias

Encontrou um bug ou tem uma ideia? [Abra uma issue](https://github.com/vokartz/inkforum/issues/new/choose) — os formulários guiam você
pelos detalhes de que precisamos. No seu fórum, **Admin → Informações do sistema → "Relatar um bug no GitHub"** já preenche sua versão e
seu ambiente. Problemas de segurança: use os [avisos privados](https://github.com/vokartz/inkforum/security/advisories/new).

## ☕ Apoie o projeto

O InkForum é desenvolvido por uma equipe pequena. Se ele ajuda a sua comunidade, você pode manter a tinta fluindo:

<a href="https://buymeacoffee.com/vokartz"><img src="https://img.shields.io/badge/Buy%20me%20a%20coffee-ffdd00?style=for-the-badge&logo=buymeacoffee&logoColor=black" alt="Buy Me a Coffee"></a>

### 💛 Apoiadores

Um enorme obrigado a todos que apoiam o InkForum. Os apoiadores são listados aqui com a sua permissão.

<!-- SUPPORTERS:START -->
| | |
|---|---|
| *Seu nome ou sua comunidade poderia estar aqui* | [Seja um apoiador](https://buymeacoffee.com/vokartz) |
<!-- SUPPORTERS:END -->

Outras formas de ajudar: ⭐ dê uma estrela a este repositório, relate bugs, sugira recursos, traduza o InkForum para o seu idioma
ou conte sobre ele para outros donos de comunidades.

## Licença

O InkForum é software livre e de código aberto sob a [GNU AGPL-3.0](LICENSE). Você pode usar, estudar, modificar e compartilhar;
se executar uma versão modificada para outras pessoas (inclusive como serviço hospedado), deve publicar suas alterações sob a mesma licença.
Para contribuir: [CONTRIBUTING.md](CONTRIBUTING.md). Alterações: [CHANGELOG.md](CHANGELOG.md). Segurança: [SECURITY.md](SECURITY.md).

<div align="center"><sub>© InkForum · feito com ♥ na Turquia</sub></div>
