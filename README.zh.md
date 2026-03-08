<p align="center">
  <a href="https://github.com/chekusu/shipkey/blob/main/README.md">English</a> | <strong>中文</strong> | <a href="https://github.com/chekusu/shipkey/blob/main/README.ja.md">日本語</a>
</p>

# shipkey

一条命令扫描、备份和同步项目中所有 API 密钥。支持 1Password 和 Bitwarden。

## 为什么需要

- 换电脑时 `.env` 文件丢失
- 密钥散落在 GitHub、Cloudflare 和本地文件中
- 新成员花数小时收集 API 密钥
- 没人记得 Token 需要哪些权限

shipkey 解决所有这些问题。

## 快速开始

```bash
# 安装
curl -fsSL https://shipkey.dev/install.sh | bash

# 扫描项目并启动设置向导
shipkey setup
```

> **提示：** `shipkey setup` 会自动打开一个网页配置向导，连接本地 API 服务，引导你逐步配置每个服务商的密钥并保存到密码管理器（1Password 或 Bitwarden）。

### 通过 npm 安装

也可以作为项目 devDependency 安装，锁定每个项目的版本：

```bash
# npm
npm install -D shipkey

# bun
bun add -d shipkey
```

通过 `npx` / `bunx` 运行：

```bash
npx shipkey setup
bunx shipkey pull
```

或者在 `package.json` 中添加脚本：

```json
{
  "scripts": {
    "setup": "shipkey setup",
    "keys:pull": "shipkey pull",
    "keys:push": "shipkey push"
  }
}
```

## 工作流程

```
shipkey scan     →  检测 .env 文件、工作流、wrangler 配置
                    生成 shipkey.json（含 providers 和权限推荐）

shipkey setup    →  打开浏览器向导输入 API 密钥
                    保存到密码管理器 + 本地 .env.local/.dev.vars

shipkey pull     →  从密码管理器恢复所有密钥到本地文件
                    新电脑数秒就绪

shipkey sync     →  推送密钥到 GitHub Actions、Cloudflare Workers
                    一条命令，所有平台
```

## 支持的后端

| 后端 | CLI | 读取 | 写入 | 列表 |
|------|-----|------|------|------|
| [1Password](https://1password.com/) | `op` | ✅ | ✅ | ✅ |
| [Bitwarden](https://bitwarden.com/) | `bw` | ✅ | ✅ | ✅ |

在 `shipkey.json` 中设置后端：

```json
{
  "backend": "bitwarden"
}
```

不指定时默认使用 `"1password"`（向后兼容）。

## 命令

### `shipkey setup [dir]`

启动浏览器交互式设置向导。

```bash
shipkey setup                  # 当前目录，prod 环境
shipkey setup -e dev           # dev 环境
shipkey setup --port 3000      # 指定 API 端口
shipkey setup --no-open        # 不自动打开浏览器
```

向导提供：
- 每个服务商的分步指南（Cloudflare、AWS、Stripe 等）
- 根据项目代码自动推断的权限推荐
- 一键保存到 1Password 或 Bitwarden
- CLI 状态检查（op/bw、gh、wrangler），附安装指引

### `shipkey scan [dir]`

扫描项目并生成 `shipkey.json`。

```bash
shipkey scan                   # 扫描并写入配置
shipkey scan --dry-run         # 预览，不写入文件
```

检测范围：
- `.env`、`.env.local`、`.env.example`、`.dev.vars`、`.envrc`
- GitHub Actions 工作流 secrets
- Wrangler bindings（KV、R2、D1、Queues、AI）
- `package.json` 依赖（AWS SDK、Supabase、Stripe 等）

自动推断每个服务商所需的权限。

### `shipkey push [dir]`

将本地环境变量推送到密码管理器。

```bash
shipkey push                   # 推送 dev 环境
shipkey push -e prod           # 推送 prod 环境
shipkey push --vault myteam    # 自定义保险库
```

### `shipkey pull [dir]`

从密码管理器拉取密钥并生成本地 env 文件。

```bash
shipkey pull                   # 拉取 dev 环境
shipkey pull -e prod           # 拉取 prod 环境
shipkey pull --no-envrc        # 跳过 .envrc 生成
shipkey pull --no-dev-vars     # 跳过 .dev.vars 生成
```

生成文件：
- `.envrc` — 含 `op://` 引用（1Password）或直接值（Bitwarden），配合 direnv 使用
- `.dev.vars` — 含解析后的值，用于 Cloudflare Workers

### `shipkey sync [target] [dir]`

将密钥同步到外部平台。

```bash
shipkey sync                   # 同步所有目标
shipkey sync github            # 仅 GitHub Actions
shipkey sync cloudflare        # 仅 Cloudflare Workers
```

支持的目标：
- **GitHub Actions** — 通过 `gh secret set` 设置仓库 secrets
- **Cloudflare Workers** — 通过 `wrangler secret put` 设置密钥

### `shipkey list [dir]`

列出密码管理器中存储的所有密钥。

```bash
shipkey list                   # 当前项目
shipkey list --all             # 所有项目
shipkey list -e prod           # 按环境过滤
```

## 配置

`shipkey.json` 由 `shipkey scan` 自动生成，也可以手动编辑。

```json
{
  "project": "my-app",
  "vault": "shipkey",
  "backend": "1password",
  "providers": {
    "Cloudflare": {
      "fields": ["CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"]
    },
    "Stripe": {
      "fields": ["STRIPE_SECRET_KEY"]
    }
  },
  "targets": {
    "github": {
      "owner/repo": ["CLOUDFLARE_API_TOKEN", "STRIPE_SECRET_KEY"]
    }
  }
}
```

## 存储结构

### 1Password

密钥以条目形式存储在保险库中，按 Section 组织：

```
op://{vault}/{provider}/{project}-{env}/{FIELD}
```

示例：

```
op://shipkey/Cloudflare/my-app-prod/CLOUDFLARE_API_TOKEN
op://shipkey/Stripe/my-app-dev/STRIPE_SECRET_KEY
```

### Bitwarden

密钥以安全笔记形式存储在文件夹中，使用自定义隐藏字段：

```
文件夹: {vault}
  条目: {provider}（安全笔记）
    字段: {project}-{env}.{FIELD}（隐藏类型）
```

示例：

```
文件夹: shipkey
  条目: Cloudflare
    字段: my-app-prod.CLOUDFLARE_API_TOKEN = sk-xxx
  条目: Stripe
    字段: my-app-dev.STRIPE_SECRET_KEY = sk-xxx
```

## 环境要求

- [Bun](https://bun.sh) 运行时
- 以下密码管理器 CLI 之一：
  - [1Password CLI](https://developer.1password.com/docs/cli/) (`op`)
    ```bash
    brew install --cask 1password-cli
    ```
  - [Bitwarden CLI](https://bitwarden.com/help/cli/) (`bw`)
    ```bash
    npm install -g @bitwarden/cli
    ```
- [GitHub CLI](https://cli.github.com/) (`gh`) — 用于同步到 GitHub Actions
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) — 用于同步到 Cloudflare Workers

## 许可证

MIT
