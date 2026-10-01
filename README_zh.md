<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset=".github/assets/inkforum-wordmark-light.png">
  <img src=".github/assets/inkforum-wordmark-dark.png" alt="InkForum" width="360">
</picture>

### 现代、轻量的社区软件，一切都能在浏览器中完成管理

专为游戏服务器、角色扮演社区、品牌和兴趣小组打造：
一条命令即可安装，在廉价 VPS 上也能流畅运行，一键即可自动更新。

[![最新版本](https://img.shields.io/github/v/release/vokartz/inkforum?label=release&color=7b61ff)](https://github.com/vokartz/inkforum/releases)
[![Docker](https://img.shields.io/badge/docker-ghcr.io%2Fvokartz%2Finkforum-2496ed?logo=docker&logoColor=white)](https://github.com/vokartz/inkforum/pkgs/container/inkforum)
[![平台](https://img.shields.io/badge/platform-amd64%20%7C%20arm64-555)](#系统要求)
[![License: AGPL-3.0](https://img.shields.io/badge/license-AGPL--3.0-blue)](LICENSE)
[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-ffdd00?logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/vokartz)

[English](README.md) · [Türkçe](README_tr.md) · [Deutsch](README_de.md) · **简体中文** · [Español](README_es.md) · [Français](README_fr.md) · [Русский](README_ru.md) · [Português](README_pt.md)

[快速开始](#-快速开始) · [功能特性](#-功能特性) · [更新](#-更新) · [备份](#-备份与恢复) · [导入](#-从其他论坛导入) · [常见问题](#-常见问题) · [支持项目](#-支持本项目)

</div>

---

## 为什么选择 InkForum？

| | |
|---|---|
| **几分钟即可上线** | 一行命令的安装脚本会准备好 Docker，为你的域名申请免费的 HTTPS 证书，然后交给友好的安装向导。 |
| **廉价硬件也能跑得飞快** | 单进程运行，默认使用 SQLite——无需 Redis、无需搜索服务器、无需独立的数据库服务器。一台 1 GB 内存的 VPS 就绰绰有余。 |
| **无需写代码，掌控一切** | 主题、配色、菜单、首页、权限、邮件模板、插件……全部都在管理面板中完成。 |
| **一键更新** | 新版本会连同更新说明一起显示在面板中。更新前会先自动备份，一旦出现问题，会自动恢复到上一个版本。 |
| **默认即安全** | 内置 Web 应用防火墙（WAF）、双因素认证、管理操作二次验证、严格的内容安全策略（CSP）。 |
| **多语言** | 支持英语、土耳其语、德语、中文、西班牙语、法语、俄语和葡萄牙语——每位成员都可以自选语言。 |

## 🚀 快速开始

在 Ubuntu、Debian、Rocky、Alma 或任何可以运行 Docker 的 Linux 服务器上执行：

```bash
curl -fsSL https://raw.githubusercontent.com/vokartz/inkforum/main/install.sh | sudo bash
```

该脚本会：

1. 在缺少 Docker 时（征得你同意后）自动安装，
2. 创建 `/opt/inkforum` 目录以及包含高强度随机密钥的 `.env` 文件，
3. 如果你填写了域名，则启用 **自动 HTTPS**（通过 Caddy 使用 Let's Encrypt），
4. 启动 InkForum 并输出你的 **安装地址**。

在浏览器中打开 `https://your-domain.com/install`。向导会检查你的服务器环境，并依次询问论坛名称、
主题、管理员账号、注册模式、插件以及（可选的）邮件设置。就这么简单。

> **请立即完成安装。** 没有安装码：第一个完成安装向导的人将成为管理员，
> 因此请在 InkForum 启动后立即打开 `/install`。网站地址会从你的浏览器自动识别并保存。

### 手动安装（Docker Compose）

```bash
mkdir -p /opt/inkforum && cd /opt/inkforum
curl -fsSLO https://raw.githubusercontent.com/vokartz/inkforum/main/docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/vokartz/inkforum/main/.env.example -o .env
# 可选：APP_URL、APP_SECRET 和 UPDATER_TOKEN 会自动识别或生成
docker compose up -d
```

### Coolify、Dokploy、Portainer

直接将 `docker-compose.yml`（或 `ghcr.io/vokartz/inkforum` 镜像）添加到你的平台，无需设置任何变量：
网站地址取自平台（Coolify）或在安装向导中自动识别，密钥会自动生成
并保存在 `storage` 卷中。如果平台自带反向代理，请保留 `TRUST_PROXY=uniquelocal`，并且不要启用 `https`（Caddy）配置文件。

### 系统要求

| | 最低配置 | 推荐配置 |
|---|---|---|
| CPU | 1 vCPU（amd64 或 arm64） | 2 vCPU |
| 内存 | 1 GB | 2 GB |
| 磁盘 | 5 GB | 20 GB + 上传文件 |
| 软件 | Docker 24+ 及 Compose 插件 | — |

无法使用 Docker（cPanel/Passenger、Plesk、纯 Node.js）？每个版本还会提供 **服务器安装包**——参见
[不使用 Docker 安装](#不使用-docker-安装)。

## ✨ 功能特性

<details open>
<summary><b>论坛</b></summary>

- 分类、嵌套版块、链接版块、版块封面和版规页面
- 主题前缀、标签、投票、置顶、精选、锁定、移动与合并
- 富文本编辑器：标题、表格、剧透折叠、代码、颜色、图片上传、草稿自动保存
- 支持 24 个平台的自动嵌入，包括 YouTube、Twitch、Kick、Spotify、X、Instagram、TikTok 和 Discord 邀请链接
- 引用、@提及、表情回应、声望、未读追踪、主题订阅
- 高级搜索、相似主题、审核队列、编辑历史
</details>

<details>
<summary><b>成员与社区</b></summary>

- 五种注册模式（即时注册、邮箱验证、管理员审核、两者兼有、关闭注册），并带有防机器人保护
- 用户组、按发帖数晋升的等级、限时会员资格、用户组加入申请
- 个人资料支持封面图、自定义字段、成就、签名和隐私设置
- 私信会话（一对一和群聊）、站内通知和邮件通知
- 支持使用 Discord、Google 和 GitHub 登录
</details>

<details>
<summary><b>外观设计</b></summary>

- 四款主题：**Modern**、**Community**（大横幅）、**Nova**（专业论坛布局：彩色页头、标签式菜单、区块标题栏）和 **Elegant**（纸张色调、衬线标题、居中刊头）
- 浅色/深色模式、强调色、9 种字体、圆角大小、横幅、Logo 和背景
- 拖放式菜单编辑器和首页区块
- **Studio**：全屏拖放式页面构建器——落地页、图库、服务器卡片、倒计时、价格表、常见问题……
- 一键将外观恢复为默认设置
- 完全响应式；可添加到主屏幕（PWA manifest）
</details>

<details>
<summary><b>插件</b></summary>

| 插件 | 功能 |
|---|---|
| **落地页** | 将 Studio 页面设为首页；论坛会自动移至 `/forum` |
| **Wiki** | 无限层级嵌套页面、目录、搜索、页面历史 |
| **申请表** | 管理团队与角色申请，支持 8 种题型、申请条件、审核流程和自动分配用户组 |
| **工单支持** | 按分类指定负责团队、状态、优先级、内部备注 |
</details>

<details>
<summary><b>搜索引擎与分享</b></summary>

- 动态 `robots.txt` 以及自动生成、分区的 `sitemap.xml`（仅包含公开内容）
- Open Graph 与 X 卡片、规范 URL、结构化数据（JSON-LD）
- 为主题自动生成 **分享图片**（标题、版块、作者、统计数据）
- 支持 oEmbed，并可在其他网站嵌入主题卡片
- Google、Bing 和 Yandex 站点验证；可选屏蔽 AI 爬虫
</details>

<details>
<summary><b>安全</b></summary>

- 内置 **防火墙**：攻击特征拦截、速率限制、恶意机器人拦截、IP/IP 段规则
- 遭受攻击时启用验证页面：内置工作量证明（proof-of-work）、Cloudflare Turnstile 或 hCaptcha
- argon2id 密码哈希、双因素认证、会话管理、管理操作二次验证
- 严格的 CSP、CSRF 防护、防 SSRF 的 Webhook
- 支持封禁 IP、邮箱、域名和成员；警告积分可自动触发处罚
</details>

<details>
<summary><b>集成</b></summary>

- OAuth 2.0 提供方（“使用论坛账号登录”，支持 PKCE）、带权限范围的 REST API、API 密钥
- 签名 Webhook（新主题、注册、用户组变更……）、为游戏面板 / UCP 提供的签名成员令牌
- 自定义 HTML/CSS/JS 代码片段（通过 CSP nonce 保障安全）以及 `window.forum` JavaScript API
</details>

## 🔄 更新

InkForum 跟随本仓库的 [Releases](https://github.com/vokartz/inkforum/releases) 发布更新。

- **管理后台 → 更新** 会显示你当前的版本、最新版本及其 **更新说明**。
- **立即更新**：备份数据库 → 下载新镜像 → 重启并进行健康检查 → 如果新版本未能正常启动，则 **自动回滚**。
  整个过程会实时显示进度。
- **自动更新**：关闭、仅修复错误（1.2.x）、修复 + 新功能（1.x）或全部更新，可在你选择的夜间时段执行。
  新版本发布时，管理员会收到通知。
- **稳定版 / 测试版** 更新通道。

更喜欢命令行？

```bash
cd /opt/inkforum && docker compose pull && docker compose up -d
```

数据库变更会在启动时自动应用。

## 💾 备份与恢复

- **管理后台 → 维护与备份**：数据库快照、可移植的 **SQL 转储** 或 **完整备份**（数据库 + 上传的文件）。
- 在你指定的时间每日自动备份，并保留最新的 N 份。每次更新和每次恢复之前也会自动备份。
- **上传并恢复**：上传一个备份文件（也可以来自其他服务器），输入 `GERİ YÜKLE` 进行确认，InkForum 会在重启时完成恢复
  ——恢复前会先备份当前状态，因此你随时都可以回退。
- 所有数据（数据库、上传文件、备份）都保存在 `inkforum-storage` Docker 卷中：

```bash
docker run --rm -v inkforum_inkforum-storage:/data -v "$PWD":/backup alpine tar czf /backup/inkforum-storage.tgz -C /data .
```

## 🚚 从其他论坛导入

正在从 **SMF**、**phpBB**、**Invision Community (IPS)** 或 **MyBB** 迁移？**管理后台 → 导入** 可以从数据库转储中迁移成员、用户组
及等级图片、分类和版块、主题、帖子、投票、私信、附件和头像。
如果旧的密码哈希方案可以被验证，成员可继续使用原密码；否则可通过“忘记密码”设置新密码。

## ⚙️ 配置

所有论坛设置都在管理面板中完成。`.env` 文件只用于描述基础设施：

| 变量 | 说明 |
|---|---|
| `APP_URL` | 完整的网站地址（`https://forum.example.com`）；可选——在安装向导中自动识别 |
| `APP_SECRET` | 会话与加密密钥（32 个字符以上；修改后所有用户都会被登出）；可选——自动生成 |
| `UPDATER_TOKEN` | 与更新器容器共享的密钥；可选——自动生成 |
| `DOMAIN`, `COMPOSE_PROFILES=https` | 通过 Caddy 自动启用 HTTPS |
| `DB_DRIVER`, `DATABASE_URL` | 使用 PostgreSQL（需将 `postgres` 添加到 `COMPOSE_PROFILES`） |
| `TRUST_PROXY` | 在反向代理后获取真实客户端 IP（推荐 `uniquelocal`） |
| `INKFORUM_PORT`, `INKFORUM_BIND` | 对外发布的端口和绑定地址 |
| `UPDATES_DISABLED` | 在离线服务器上禁用更新检查 |
| `WAF_DISABLED` | 用于禁用防火墙的紧急开关 |

## 不使用 Docker 安装

每个版本都包含 `inkforum-<version>-linux-x64.tar.gz`（已内置依赖）和 `inkforum-<version>.tar.gz`。
需要 Node.js 22.13 或更高版本。

```bash
curl -fsSLO https://github.com/vokartz/inkforum/releases/latest/download/inkforum-<version>-linux-x64.tar.gz
tar xzf inkforum-*-linux-x64.tar.gz && cd inkforum
cp .env.example .env   # 可选：所有内容都会自动识别或生成
NODE_ENV=production node --env-file=.env server.mjs
```

可以使用 systemd、PM2 或 Passenger 运行。通过面板更新时，会下载安装包、使用 SHA-256 校验、完成安装
并重启进程（需要由你的进程管理器负责重启）。systemd 单元示例：

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

## ❓ 常见问题

**应该选择哪种数据库？**
SQLite 足以满足大多数社区的需求，而且维护成本最低。对于超大型社区，或者你更倾向于使用托管数据库，
也可以选择 PostgreSQL。

**我的服务器无法访问互联网，该如何更新？**
设置 `UPDATES_DISABLED=true`，手动加载新镜像，然后运行 `docker compose up -d`。

**防火墙把我自己拦在外面了。**
在 `.env` 中添加 `WAF_DISABLED=true`，运行 `docker compose up -d`，然后在面板中修正相关设置。

**我忘记了管理员密码。**
在登录页面使用“忘记密码”。如果未配置邮件，重置链接会写入 `storage/mail`：
`docker compose exec inkforum ls /app/storage/mail`

## 🐞 问题反馈与建议

发现了 Bug 或有新想法？[提交 Issue](https://github.com/vokartz/inkforum/issues/new/choose)——表单会引导你
填写我们需要的信息。在你的论坛中，**管理后台 → 系统信息 →“在 GitHub 上报告 Bug”** 会自动填入你的版本和
运行环境。安全问题请通过 [私密安全公告](https://github.com/vokartz/inkforum/security/advisories/new) 提交。

## ☕ 支持本项目

InkForum 由一个小团队开发。如果它对你的社区有所帮助，欢迎支持我们，让墨水继续流淌：

<a href="https://buymeacoffee.com/vokartz"><img src="https://img.shields.io/badge/Buy%20me%20a%20coffee-ffdd00?style=for-the-badge&logo=buymeacoffee&logoColor=black" alt="Buy Me a Coffee"></a>

### 💛 支持者

衷心感谢每一位支持 InkForum 的朋友。支持者名单经本人同意后展示于此。

<!-- SUPPORTERS:START -->
| | |
|---|---|
| *你的名字或社区也可以出现在这里* | [成为支持者](https://buymeacoffee.com/vokartz) |
<!-- SUPPORTERS:END -->

其他支持方式：⭐ 为本仓库点亮 Star、报告 Bug、提出功能建议、将 InkForum 翻译成你的语言，
或者把它推荐给其他社区站长。

## 许可证

InkForum 是基于 [GNU AGPL-3.0](LICENSE) 许可的自由开源软件。你可以使用、研究、修改和分享它；
如果你为他人运行修改后的版本（包括作为托管服务），必须以相同许可证公开你的修改。
参与贡献：[CONTRIBUTING.md](CONTRIBUTING.md)。更新日志：[CHANGELOG.md](CHANGELOG.md)。安全：[SECURITY.md](SECURITY.md)。

<div align="center"><sub>© InkForum · 在土耳其用 ♥ 打造</sub></div>
