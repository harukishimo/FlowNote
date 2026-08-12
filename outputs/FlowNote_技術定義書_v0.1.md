# FlowNote 技術定義書

> Next.js・Vercel・Google Sheets API・Gemini APIによるMVP実装仕様

- **文書ID:** FN-TD-001

- **版:** v0.1

- **状態:** 要件整理版 / Draft

- **作成日:** 2026-08-12

- **対象:** FlowNote MVP

---

## 1. 文書の目的

本書は、要件定義書に基づくFlowNote MVPの技術構成、コンポーネント責務、データモデル、API、認証、保存、AI処理、テストおよび運用方式を定義する。

> **アーキテクチャ原則**  ブラウザは秘密情報を保持せず、Gemini APIおよびGoogle Sheets APIへの通信はNext.jsのサーバー処理だけが行う。

## 2. 採用技術

| 領域 | 採用 | 用途 |
| --- | --- | --- |
| フレームワーク | Next.js / App Router / TypeScript | 画面、Server Components、Route Handlers、HTML出力 |
| ホスティング | Vercel | Preview/Productionデプロイ、Serverless Functions、環境変数 |
| エディタ | Tiptap（ProseMirror）推奨 | リッチテキスト、Markdownショートカット、Tab制御、選択範囲編集 |
| AI | Gemini Flash系モデル | 自然文からアクティビティ図JSONへの構造化 |
| 永続化 | Google Sheets API v4 | メモと保存済み図スナップショットの小規模MVP保存 |
| 認証 | Auth.js Credentials + Argon2id | 環境変数の共有パスワードハッシュ照合、JWTセッション。Google OAuthは将来候補 |
| 検証 | Zod | リクエスト、環境変数、Gemini Structured Output、保存データの検証 |
| テスト | Vitest + Testing Library + Playwright | 単体、画面操作、E2E、キーボード操作 |

## 3. システム構成

```text
Browser (Next.js UI)
  ├─ Password Login / Logout
  ├─ Note Editor / Markdown shortcuts
  ├─ Activity Diagram Preview
  └─ Ponchi-e Output Preview
          │ HTTPS
          ▼
Next.js Server on Vercel
  ├─ Credentials Authentication / Session Authorization
  ├─ Notes API
  ├─ Diagram Generation API ──► Gemini API
  ├─ Snapshot Save API ───────► Google Sheets API
  └─ HTML Export Builder
```

HTML出力は保存済みデータを必須とせず、ブラウザ上の現在の図データと表示設定から生成できる。保存と出力は別API、別UI操作とする。

## 4. ディレクトリ構成案

```text
src/
  app/
    login/page.tsx
    notes/[id]/page.tsx
    api/auth/[...nextauth]/route.ts
    api/notes/route.ts
    api/notes/[id]/route.ts
    api/diagrams/generate/route.ts
    api/diagram-snapshots/route.ts
    api/exports/html/route.ts
  components/
    auth/PasswordLoginForm.tsx
    editor/NoteEditor.tsx
    diagram/ActivityDiagram.tsx
    export/PonchiPreview.tsx
  lib/
    auth/config.ts
    auth/password.ts
    auth/session.ts
    auth/rate-limit.ts
    env.ts
    gemini/client.ts
    gemini/schema.ts
    sheets/client.ts
    sheets/notes-repository.ts
    sheets/snapshots-repository.ts
    graph/validate.ts
    export/build-html.ts
  domain/
    note.ts
    activity-graph.ts
    snapshot.ts
```

## 5. 環境変数

| 変数名 | 必須 | Secret | 説明 |
| --- | --- | --- | --- |
| GOOGLE_SHEETS_SPREADSHEET_ID | Yes | 推奨 | 保存先スプレッドシートID |
| GOOGLE_SERVICE_ACCOUNT_EMAIL | Yes | No | シートを共有するサービスアカウントのメールアドレス |
| GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY | Yes | Yes | サービスアカウント秘密鍵。\nを実改行へ復元して使用 |
| GEMINI_API_KEY | Yes | Yes | Gemini APIキー |
| GEMINI_MODEL | Yes | No | 使用モデルID。環境ごとに切替可能 |
| AUTH_SECRET | Yes | Yes | JWTセッションの署名・暗号化用秘密情報 |
| AUTH_PASSWORD_HASH | Yes | Yes | Argon2idのエンコード済みハッシュ。saltとパラメータを含む。平文は禁止 |
| AUTH_SESSION_MAX_AGE_SECONDS | Yes | No | セッション有効期限。既定値43200（12時間） |
| AUTH_LOGIN_MAX_ATTEMPTS | Yes | No | ログイン試行上限。既定値5 |
| AUTH_LOGIN_WINDOW_SECONDS | Yes | No | 試行回数の集計・一時制限時間。既定値900 |
| NOTES_SHEET_NAME | Yes | No | 既定値 notes |
| SNAPSHOTS_SHEET_NAME | Yes | No | 既定値 diagram_snapshots |
| MAX_MEMO_LENGTH | Yes | No | 入力上限。既定値 20000 |

> **禁止事項**  平文パスワード、秘密鍵、APIキー、固定アクセストークンを保存しない、または`NEXT_PUBLIC_`を付けない。Googleのアクセストークンはサービスアカウント資格情報から短時間のものを都度取得し、環境変数へ固定保存しない。

### 5.1 パスワード認証設計

- MVPは単一の共有パスワードと単一の論理ユーザー`shared-password-user`を使用する。ユーザー登録、個別パスワード、再発行は実装しない。
- `AUTH_PASSWORD_HASH`にはArgon2idのPHC形式文字列（アルゴリズム、パラメータ、salt、digestを含む）だけを登録する。SHA-256、MD5などの高速ハッシュは使用しない。
- 実装リポジトリへ、パスワードを対話的・非表示入力し、ハッシュだけを標準出力する`npm run auth:hash`を用意する。平文をCLI引数、shell history、ファイル、ログへ残さない。
- パスワード照合はNode.js Runtimeのサーバー側だけで行う。Edge Middlewareではハッシュ照合せず、Route HandlerまたはServer Actionで照合する。
- 認証成功時はAuth.jsのJWTセッションを発行する。CookieはHttpOnly、Secure（Production）、SameSite=Lax、Path=/、有効期限付きとする。
- ページの早期リダイレクトだけに依存せず、すべてのRoute HandlerとServer Actionでセッションを再検証する。
- ログアウト時はCookieを破棄する。ハッシュ変更後に既存セッションを即時失効させる必要がある場合は`AUTH_SECRET`もローテーションする。
- ログイン失敗メッセージは「パスワードを確認してください」に統一し、ハッシュ未設定、形式不正、照合失敗の内部理由をブラウザへ返さない。
- ログイン試行はIP等を直接ログへ残さず、必要に応じてHMAC化した識別子で制限する。Vercelの複数インスタンスでも共有できるレート制限手段を優先し、少なくとも短時間の連続試行へ指数バックオフを適用する。
- `AUTH_PASSWORD_HASH`が未設定またはArgon2id形式でない場合は起動後の認証機能をFail Closedとし、503の設定エラーとして扱う。ビルド自体は実秘密情報なしで成功させる。

## 6. Google Sheets設計

### 6.1 notesシート

| 列 | 型 | 説明 |
| --- | --- | --- |
| id | string/UUID | 不変のメモID |
| owner_id | string | MVPでは固定値`shared-password-user`。将来のユーザー別認証へ備えて保持 |
| title | string | メモタイトル |
| content_markdown | string | 保存の正本となるMarkdown |
| content_json | JSON string | エディタ状態の高速復元用。Markdownから再構築可能 |
| created_at | ISO 8601 | 作成日時 |
| updated_at | ISO 8601 | 更新日時 |
| version | integer | 楽観的ロック用 |
| deleted_at | ISO 8601/null | 論理削除日時 |

### 6.2 diagram_snapshotsシート

| 列 | 型 | 説明 |
| --- | --- | --- |
| id | string/UUID | 保存済みスナップショットID |
| note_id | string/UUID | 関連するメモID |
| graph_json | JSON string | ノード・エッジ・担当者・分岐 |
| warnings_json | JSON string | 曖昧箇所と元文章範囲 |
| summary | string | ポンチ絵の概要文 |
| layout_config_json | JSON string | レイアウト、色、補足カード表示設定 |
| saved_at | ISO 8601 | 保存ボタン実行時刻 |
| version | integer | スナップショット版 |

HTML本文は保存しない。再出力時はgraph_json、summary、layout_config_jsonから決定的に生成する。これによりHTMLテンプレート更新後も再生成できる。

### 6.3 リポジトリ実装

- 行番号をIDとして扱わず、先頭列のUUIDを検索して対象行を決定する。

- 新規追加はvalues.append、更新は対象行を特定後にvalues.updateを使う。

- 複数範囲は可能な限りbatchGet/batchUpdateでまとめる。

- 更新時はクライアントのversionと保存済みversionを比較し、不一致なら409 Conflictを返す。

- 同一request_idの保存要求は重複行を作らない。

## 7. ドメインモデル

```text
type ActivityGraph = {
  schemaVersion: 1;
  title: string;
  nodes: Array<{
    id: string;
    type: 'start' | 'action' | 'decision' | 'merge' | 'end';
    label: string;
    actor: string | null;
    sourceRange: { start: number; end: number } | null;
    confidence: number;
  }>;
  edges: Array<{
    id: string;
    from: string;
    to: string;
    label: string | null;
    kind: 'normal' | 'branch' | 'loop';
  }>;
  warnings: Array<{
    code: string;
    message: string;
    sourceRange: { start: number; end: number } | null;
  }>;
};
```

## 8. Gemini処理

1. サーバーで本文長、空入力、ユーザー権限、レート制限を検証する。

1. Geminiへ、図の構造化専用プロンプトとJSON Schemaを送る。

1. 返却値をZodで再検証する。

1. ノードID重複、参照切れ、未到達ノード、終了不能、分岐ラベル不足、異常ループを検査する。

1. 修復可能な形式上の問題だけをプログラムで補正し、意味上の不明点はwarningsへ残す。

1. 検証済みActivityGraphをクライアントへ返す。ここでは保存しない。

> **重要**  モデルへHTMLやMermaidを直接自由生成させない。モデルは意味構造の抽出に限定し、描画とHTML生成はアプリ側の決定的処理にする。

## 9. エディタ実装

| 要件 | 実装方針 |
| --- | --- |
| Enter | エディタ標準の段落/改行コマンドだけを実行。送信ハンドラへ割り当てない。 |
| Cmd/Ctrl + Enter | IME composing中でない場合のみgenerateDiagramを1回呼ぶ。処理中は二重実行を抑止。 |
| Tab | EditorView内でsinkListItemまたは選択行のindentコマンドを実行し、preventDefaultでフォーカス移動を抑止。 |
| Shift + Tab | liftListItemまたはoutdentコマンド。インデント0では安全に何もしない。 |
| Markdown | Tiptap Input Rulesを用いてSpace/閉じ記号の入力時に即時変換。Undoで変換前へ戻せる。 |
| 保存形式 | content_markdownを正本、content_jsonを編集状態のキャッシュとして併存。シリアライズ往復テストを設ける。 |

## 10. API定義

| Method / Path | 責務 | 主な応答 |
| --- | --- | --- |
| POST /api/auth/callback/credentials | 共有パスワード照合とセッション発行 | 200/302 / 401 / 429 / 503 |
| POST /api/auth/signout | セッション破棄 | 200/302 |
| GET /api/notes | 認証ユーザーのメモ一覧 | 200 notes[] |
| POST /api/notes | メモ新規保存 | 201 note |
| GET /api/notes/:id | メモ取得 | 200 note / 404 |
| PUT /api/notes/:id | version付き更新 | 200 note / 409 |
| DELETE /api/notes/:id | 論理削除 | 204 |
| POST /api/diagrams/generate | 本文からActivityGraph生成。保存なし | 200 graph / 422 / 429 |
| POST /api/diagram-snapshots | 保存ボタンによるスナップショット保存 | 201 snapshot |
| GET /api/diagram-snapshots?noteId= | 保存済み図の取得 | 200 snapshots[] |
| POST /api/exports/html | 現在データから単体HTML生成。保存なし | 200 text/html |

### 10.1 保存と出力の分離

```text
Generate diagram  -> POST /api/diagrams/generate      -> no persistence
Open output UI   -> client-side preview                -> no persistence
Download HTML    -> POST /api/exports/html             -> no persistence
Save ponchi-e    -> POST /api/diagram-snapshots        -> persistence
```

## 11. 状態管理

| 状態 | 意味 | UI |
| --- | --- | --- |
| unauthenticated | 有効な認証セッションがない | ログイン画面へ誘導 |
| auth-submitting | パスワード照合中 | ログインボタン無効、二重送信禁止 |
| auth-rate-limited | ログイン試行制限中 | 待機を促す共通メッセージ |
| clean | 画面内容と保存済みデータが一致 | 保存済み表示 |
| note-dirty | メモ本文に未保存変更 | 未保存表示、保存ボタン有効 |
| diagram-generating | Gemini処理中 | 生成ボタン無効、進捗表示 |
| diagram-draft | 生成済みだが保存していない図 | 未保存バッジ |
| snapshot-saving | ポンチ絵保存中 | 保存ボタン進行中、二重実行禁止 |
| snapshot-saved | 明示保存済み | 保存時刻と保存済み表示 |
| error | 直近操作が失敗 | 入力を保持し、再試行操作を表示 |

## 12. セキュリティ

- すべてのページ、Route Handler、Server Actionで認証を確認し、書き込みではCSRF対策と入力検証を行う。共有パスワードMVPでは`owner_id=shared-password-user`を一貫して使用する。

- パスワードはArgon2idで照合し、平文、ハッシュ、照合入力をログ・Cookie・Sheets・クライアントへ出さない。比較ライブラリが提供する安全なverify処理を利用する。

- ログインにIP等を用いたレート制限と一時ロックを設ける。認証成功だけでなく失敗と制限を本文なしの監査イベントとして記録する。

- GeminiとGoogleの秘密情報はVercel Sensitive Environment Variablesへ登録する。

- ログへ本文、graph_json、パスワード、パスワードハッシュ、秘密鍵、APIキー、セッションToken、OAuth Tokenを出力しない。

- APIへユーザー単位・IP単位のレート制限と本文長制限を設定する。

- HTML出力時はタイトル・ラベル・概要文をHTMLエスケープし、任意スクリプトを混入させない。

- Content Security Policy、X-Content-Type-Options、Referrer-Policyなどのヘッダーを設定する。

## 13. エラー設計

| 状況 | HTTP | ユーザー向け動作 |
| --- | --- | --- |
| パスワード不一致 | 401 | 「パスワードを確認してください」とだけ表示 |
| ログイン試行制限 | 429 | 詳細を漏らさず、時間をおいて再試行するよう表示 |
| 認証環境変数の未設定/不正 | 503 | 管理者向け設定エラー。入力値やハッシュは表示しない |
| 入力不正 | 400/422 | 対象箇所と修正方法を表示 |
| 未認証/権限なし | 401/403 | ログインまたは権限確認へ誘導 |
| 更新競合 | 409 | 再読み込みと自分の変更保持を選択可能にする |
| Gemini制限/一時障害 | 429/502/503 | 本文を保持し、待機時間と再試行を表示 |
| Sheets保存失敗 | 502/503 | 保存済みと表示せず、未保存状態のまま再試行可能にする |

## 14. テスト戦略

| 層 | 対象 |
| --- | --- |
| 単体 | Argon2idハッシュ形式・verify、セッション設定、Markdownシリアライズ、グラフ検証、HTMLエスケープ、Sheets行変換、環境変数検証 |
| コンポーネント | パスワード表示切替、ログイン状態、Enter/Cmd+Enter/Tab/Shift+Tab、IME、Markdown即時変換、未保存表示 |
| API統合 | 正常/誤パスワード、レート制限、認証必須、Zod検証、Gemini/Sheetsモック、409、429、保存と出力の分離 |
| E2E | 未認証拒否→ログイン→メモ作成→図生成→未保存確認→HTMLダウンロード→保存→再表示→ログアウト |
| 回帰データ | 通常、分岐、ループ、曖昧文、長文、悪意あるHTML文字列を含む代表ケース |

## 15. Vercelデプロイ

1. GitリポジトリをVercel Projectへ接続する。

1. Development、Preview、Productionの環境変数を分離して登録する。

1. Production/Previewの秘密情報はSensitive設定にする。

1. `npm run auth:hash`で生成したArgon2idハッシュを`AUTH_PASSWORD_HASH`へ登録し、平文はどこにも保存しない。

1. Previewではテスト用スプレッドシートとAPIキーを使用する。

1. ビルド、型検査、テスト、E2Eスモークを通過したコミットだけをProductionへ昇格する。

1. 環境変数更新後は新しいデプロイを作成して反映を確認する。

## 16. 監視・運用

- request_id、action、status、duration_ms、external_service、error_codeを構造化ログとして記録する。

- Geminiの呼び出し回数、失敗率、処理時間、推定トークン量を監視する。

- Sheetsの保存・取得失敗率と競合発生数を監視する。

- サービスアカウント秘密鍵とGemini APIキーのローテーション手順を運用資料へ記載する。

- 共有パスワード変更時は新しいArgon2idハッシュへ差し替え、必要に応じて`AUTH_SECRET`もローテーションして既存セッションを失効する。

## 17. 技術上の制約と移行基準

Google SheetsはMVPの管理性に優れる一方、行検索、同時更新、クエリ、トランザクションに制約がある。次のいずれかが発生した場合はPostgreSQL等への移行を評価する。

- レコード数または検索時間がユーザー体験上の目標を継続的に超える。

- 複数ユーザーの同時編集・厳密な権限・監査ログが必要になる。

- 複数レコードをまたぐ原子的更新が必要になる。

- 一覧・検索・集計の条件が複雑化する。

## 18. 公式参考資料

- Next.js Environment Variables: https://nextjs.org/docs/pages/guides/environment-variables

- Vercel Environment Variables: https://vercel.com/docs/environment-variables

- Google Sheets values API: https://developers.google.com/workspace/sheets/api/guides/values

- Google service account credentials: https://docs.cloud.google.com/iam/docs/service-account-creds

- Gemini API keys: https://ai.google.dev/gemini-api/docs/api-key

- Gemini Structured Outputs: https://ai.google.dev/gemini-api/docs/structured-output

- Next.js Authentication Guide: https://nextjs.org/docs/app/guides/authentication

- Next.js cookies API: https://nextjs.org/docs/app/api-reference/functions/cookies

- Auth.js: https://authjs.dev/

- OWASP Password Storage Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html
