<p align="center">
  <a href="https://github.com/chekusu/shipkey/blob/main/README.md">English</a> | <a href="https://github.com/chekusu/shipkey/blob/main/README.zh.md">中文</a> | <strong>日本語</strong>
</p>

# shipkey

たった1つのコマンドで、プロジェクトのすべての API キーをスキャン・バックアップ・同期。1Password & Bitwarden 対応。

## なぜ必要か

- マシンを変えると `.env` ファイルが失われる
- シークレットが GitHub、Cloudflare、ローカルファイルに散在
- 新メンバーが API キーの収集に何時間も費やす
- トークンに必要な権限を誰も覚えていない

shipkey がすべて解決します。

## クイックスタート

```bash
# インストール
curl -fsSL https://shipkey.dev/install.sh | bash

# プロジェクトをスキャンしてセットアップウィザードを起動
shipkey setup
```

> **ヒント：** `shipkey setup` を実行すると、ローカル API サーバーに接続されたウェブウィザードが自動的に開き、各プロバイダのキー設定をパスワードマネージャー（1Password または Bitwarden）と連携してステップバイステップでガイドします。

### npm でインストール

プロジェクトの devDependency としてインストールし、バージョンを固定することもできます：

```bash
# npm
npm install -D shipkey

# bun
bun add -d shipkey
```

`npx` / `bunx` で実行：

```bash
npx shipkey setup
bunx shipkey pull
```

または `package.json` にスクリプトを追加：

```json
{
  "scripts": {
    "setup": "shipkey setup",
    "keys:pull": "shipkey pull",
    "keys:push": "shipkey push"
  }
}
```

## 仕組み

```
shipkey scan     →  .env ファイル、ワークフロー、wrangler 設定を検出
                    providers と権限推奨を含む shipkey.json を生成

shipkey setup    →  ブラウザウィザードで API キーを入力
                    パスワードマネージャー + ローカル .env.local/.dev.vars に保存

shipkey pull     →  パスワードマネージャーからすべてのキーをローカルファイルに復元
                    新しいマシンが数秒で準備完了

shipkey sync     →  GitHub Actions、Cloudflare Workers にシークレットを送信
                    1コマンドですべてのプラットフォームに
```

## 対応バックエンド

| バックエンド | CLI | 読取 | 書込 | 一覧 |
|-------------|-----|------|------|------|
| [1Password](https://1password.com/) | `op` | ✅ | ✅ | ✅ |
| [Bitwarden](https://bitwarden.com/) | `bw` | ✅ | ✅ | ✅ |

`shipkey.json` でバックエンドを設定：

```json
{
  "backend": "bitwarden"
}
```

省略時のデフォルトは `"1password"` です（後方互換）。

## コマンド

### `shipkey setup [dir]`

ブラウザベースのインタラクティブセットアップウィザードを起動。

```bash
shipkey setup                  # カレントディレクトリ、prod 環境
shipkey setup -e dev           # dev 環境
shipkey setup --port 3000      # API ポートを指定
shipkey setup --no-open        # ブラウザを自動で開かない
```

ウィザードの機能：
- 各プロバイダのステップバイステップガイド（Cloudflare、AWS、Stripe など）
- プロジェクトコードから自動推論された権限の推奨
- ワンクリックで 1Password または Bitwarden に保存
- CLI ステータスチェック（op/bw、gh、wrangler）とインストール手順

### `shipkey scan [dir]`

プロジェクトをスキャンして `shipkey.json` を生成。

```bash
shipkey scan                   # スキャンして設定を書き出し
shipkey scan --dry-run         # プレビューのみ（書き込みなし）
```

検出対象：
- `.env`、`.env.local`、`.env.example`、`.dev.vars`、`.envrc`
- GitHub Actions ワークフローの secrets
- Wrangler バインディング（KV、R2、D1、Queues、AI）
- `package.json` の依存関係（AWS SDK、Supabase、Stripe など）

プロバイダごとに必要な権限を自動推論。

### `shipkey push [dir]`

ローカルの環境変数をパスワードマネージャーにプッシュ。

```bash
shipkey push                   # dev 環境をプッシュ
shipkey push -e prod           # prod 環境をプッシュ
shipkey push --vault myteam    # カスタム保管庫
```

### `shipkey pull [dir]`

パスワードマネージャーからシークレットを取得してローカル env ファイルを生成。

```bash
shipkey pull                   # dev 環境を取得
shipkey pull -e prod           # prod 環境を取得
shipkey pull --no-envrc        # .envrc の生成をスキップ
shipkey pull --no-dev-vars     # .dev.vars の生成をスキップ
```

生成ファイル：
- `.envrc` — `op://` 参照付き（1Password）または直接値（Bitwarden）、direnv 用
- `.dev.vars` — 解決済みの値（Cloudflare Workers 用）

### `shipkey sync [target] [dir]`

シークレットを外部プラットフォームに同期。

```bash
shipkey sync                   # すべてのターゲットに同期
shipkey sync github            # GitHub Actions のみ
shipkey sync cloudflare        # Cloudflare Workers のみ
```

対応ターゲット：
- **GitHub Actions** — `gh secret set` でリポジトリシークレットを設定
- **Cloudflare Workers** — `wrangler secret put` でシークレットを設定

### `shipkey list [dir]`

パスワードマネージャーに保存されたすべてのシークレットを一覧表示。

```bash
shipkey list                   # 現在のプロジェクト
shipkey list --all             # すべてのプロジェクト
shipkey list -e prod           # 環境でフィルタ
```

## 設定

`shipkey.json` は `shipkey scan` で自動生成されます。手動編集も可能です。

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

## ストレージ構造

### 1Password

シークレットは保管庫内のアイテムとして、セクションで整理されます：

```
op://{vault}/{provider}/{project}-{env}/{FIELD}
```

例：

```
op://shipkey/Cloudflare/my-app-prod/CLOUDFLARE_API_TOKEN
op://shipkey/Stripe/my-app-dev/STRIPE_SECRET_KEY
```

### Bitwarden

シークレットはフォルダ内のセキュアノートとして、カスタム非表示フィールドで保存されます：

```
フォルダ: {vault}
  アイテム: {provider}（セキュアノート）
    フィールド: {project}-{env}.{FIELD}（非表示タイプ）
```

例：

```
フォルダ: shipkey
  アイテム: Cloudflare
    フィールド: my-app-prod.CLOUDFLARE_API_TOKEN = sk-xxx
  アイテム: Stripe
    フィールド: my-app-dev.STRIPE_SECRET_KEY = sk-xxx
```

## 必要な環境

- [Bun](https://bun.sh) ランタイム
- 以下のいずれかのパスワードマネージャー CLI：
  - [1Password CLI](https://developer.1password.com/docs/cli/) (`op`)
    ```bash
    brew install --cask 1password-cli
    ```
  - [Bitwarden CLI](https://bitwarden.com/help/cli/) (`bw`)
    ```bash
    npm install -g @bitwarden/cli
    ```
- [GitHub CLI](https://cli.github.com/) (`gh`) — GitHub Actions への同期用
- [Wrangler](https://developers.cloudflare.com/workers/wrangler/) — Cloudflare Workers への同期用

## ライセンス

MIT
