# FlowNote 実装エージェント一覧書

> FlowNote MVPを複数エージェントで安全かつ競合なく実装するための役割定義

- **文書ID:** FN-AG-001
- **版:** v0.1
- **作成日:** 2026-08-12
- **対象:** FlowNote MVP
- **参照文書:** `FlowNote_要件定義書_v0.1.md`、`FlowNote_技術定義書_v0.1.md`、`FlowNote_デザイン仕様書_v0.1.md`

---

## 1. 目的

本書は、FlowNoteを実装する際に起動するエージェントの責務、所有範囲、成果物、起動タイミングおよび完了条件を定義する。各エージェントは独立した作業単位を担当し、同じファイルを複数エージェントが同時編集する状態を避ける。

最終ゴールは、コード、テスト、環境変数の雛形、Spreadsheet初期化処理、CIおよび運用ドキュメントが揃い、ユーザー側に残る作業が以下だけの状態である。

1. Vercelへ環境変数を設定する。この環境・認証設定には、使用するGoogle Spreadsheetを`GOOGLE_SERVICE_ACCOUNT_EMAIL`へ共有する作業も含む。
2. GitHubへpushし、Vercel Projectへ接続してデプロイする。

Google Spreadsheetの共有はGoogle側の権限設定であり、アプリのコードから安全に代行できないため、環境変数設定と同じセットアップ工程として扱う。

## 2. 共通ルール

すべてのエージェントは、起動時に次のルールを受け取る。

- 自分以外のエージェントも同じコードベースで作業している。担当外の変更を取り消さない。
- 作業開始前に担当ファイルまたは担当ディレクトリを明示する。
- 共有ファイルを変更する必要が生じた場合は、Lead Orchestratorへ先に通知する。
- 既存の未コミット変更をユーザーまたは他エージェントの成果として扱い、無断で削除・巻き戻ししない。
- 外部サービスへ実データを書き込むテストは行わず、単体・統合テストではモックまたはテスト用アダプタを使う。
- 秘密鍵、APIキー、OAuth Secret、アクセストークン、メモ本文をログ・テストスナップショット・リポジトリへ残さない。
- 完了報告には、変更ファイル、実行した検証、残課題、他エージェントへの引き継ぎ事項を含める。

## 3. エージェント構成

### AG-00 Lead Orchestrator / Integration Owner

| 項目 | 内容 |
| --- | --- |
| 起動名 | `lead_orchestrator` |
| 役割 | 全体計画、エージェント起動、担当範囲の分離、仕様判断、統合、最終判定 |
| 主な所有範囲 | `package.json`、lockfile、共通設定、統合ブランチ、最終README |
| 入力 | 3仕様書、本エージェント一覧、Spreadsheet情報、現在のリポジトリ状態 |
| 成果物 | 実装計画、タスク割当表、統合済みコード、トレーサビリティ表、最終チェック結果 |
| 完了条件 | 全Must要件に実装またはテストの根拠があり、ビルド・テスト・セキュリティゲートが通過している |

Leadはすべてを自分で実装せず、独立して進められる作業を適切なエージェントへ割り当てる。共有型、環境変数スキーマ、依存ライブラリの追加はLeadが競合を調整する。

### AG-01 Requirements & Traceability Agent

| 項目 | 内容 |
| --- | --- |
| 起動名 | `requirements_guard` |
| 役割 | 仕様書から実装項目と受入条件を抽出し、抜け・矛盾・スコープ逸脱を検出する |
| 主な所有範囲 | `docs/traceability.md`、受入条件一覧。原則としてアプリコードは編集しない |
| 成果物 | 要件IDと実装ファイル・テストの対応表、未決事項一覧、MVP対象外一覧 |
| 完了条件 | FR/AC/DS-ACのMust項目がすべて追跡可能である |
| 起動タイミング | 実装開始時と最終統合前 |

### AG-02 System Architecture & Domain Agent

| 項目 | 内容 |
| --- | --- |
| 起動名 | `architecture_domain` |
| 役割 | Next.js構成、ドメインモデル、境界、依存方向、共通スキーマを設計する |
| 主な所有範囲 | `src/domain/**`、`src/lib/graph/**`、ADR、共有インターフェース |
| 成果物 | `ActivityGraph`、`Note`、`DiagramSnapshot`の型とZod Schema、Repository境界、設計判断記録 |
| 完了条件 | UI、Gemini、Sheets、HTML出力が同じ検証済みドメイン型を利用できる |
| 起動タイミング | 最初の実装Wave |

### AG-03 Frontend Editor Agent

| 項目 | 内容 |
| --- | --- |
| 起動名 | `frontend_editor` |
| 役割 | メモ一覧・詳細画面とSlack風Markdownエディタを実装する |
| 主な所有範囲 | `src/app/**`のメモ画面、`src/components/editor/**`、関連スタイル、エディタテスト |
| 必須仕様 | Enterは改行、Cmd/Ctrl + Enterは図生成、Tab/Shift + Tabはインデント、IME中の誤動作防止、Markdown即時反映、Undo |
| 成果物 | キーボード操作可能なエディタ、保存状態表示、アクセシブルなツールバー、コンポーネントテスト |
| 完了条件 | キーボード受入条件とMarkdown変換テストが通過する |
| 起動タイミング | ドメイン型が合意された後。画面骨格はモックRepositoryで先行可能 |

### AG-04 Gemini & Activity Graph Agent

| 項目 | 内容 |
| --- | --- |
| 起動名 | `gemini_diagram` |
| 役割 | 自然文から検証済みActivityGraphを生成し、アクティビティ図として表示する |
| 主な所有範囲 | `src/lib/gemini/**`、`src/app/api/diagrams/generate/**`、`src/components/diagram/**`、グラフ検証テスト |
| 必須仕様 | Structured Output、Zod再検証、参照切れ・未到達・終了不能等の検査、warnings保持、生成時は保存しない |
| 成果物 | Geminiアダプタ、生成Route Handler、決定的な図レイアウト、警告と元文章の対応表示 |
| 完了条件 | AI応答の正常・不正・曖昧・タイムアウトケースをテストし、生成APIが永続化を呼ばない |
| 起動タイミング | ドメイン型確定後 |

### AG-05 Backend, Auth & Google Sheets Agent

| 項目 | 内容 |
| --- | --- |
| 起動名 | `backend_sheets_auth` |
| 役割 | 共有パスワード認証、認可、メモCRUD、保存済みスナップショット、Google Sheets Repositoryを実装する |
| 主な所有範囲 | `src/lib/auth/**`、`src/app/login/**`、`src/app/api/auth/**`、`src/lib/sheets/**`、`src/app/api/notes/**`、`src/app/api/diagram-snapshots/**` |
| 必須仕様 | `AUTH_PASSWORD_HASH`をArgon2idでサーバー照合、JWTセッション、安全なCookie、ログアウト、ログイン試行制限、Fail Closed、サーバーからのみSheets APIを利用、UUID識別、version競合検出、論理削除、冪等保存 |
| Spreadsheet | ID `1CqXYXrcsblxe2I7NBlesRSBq6DP4be1Bx8e1lyZWu50`、URLは本書末尾参照 |
| 成果物 | パスワードハッシュ生成コマンド、認証設定、ログイン画面、認証ガード、Repository、Route Handler、シート見出しの冪等初期化処理、統合テスト |
| 完了条件 | 平文パスワードを保存せず正常・誤入力・レート制限・ログアウト・設定不備を安全に扱い、notes・diagram_snapshots・operationsを既存または未初期化のSpreadsheetで利用できる |
| 起動タイミング | 最初の実装Wave |

### AG-06 HTML Export & Ponchi-e Agent

| 項目 | 内容 |
| --- | --- |
| 起動名 | `html_export` |
| 役割 | アクティビティ図を主役にしたポンチ絵プレビューと単体HTML出力を実装する |
| 主な所有範囲 | `src/lib/export/**`、`src/app/api/exports/html/**`、`src/components/export/**` |
| 必須仕様 | プレビュー・設定変更・ブラウザ表示・HTMLダウンロードでは保存しない。「ポンチ絵を保存」だけが保存APIを呼ぶ |
| 成果物 | 出力設定UI、未保存離脱確認、HTMLビルダー、HTMLエスケープ、出力テスト |
| 完了条件 | 外部CDNなしで閲覧できるHTMLを生成し、保存と出力の分離テストが通過する |
| 起動タイミング | ドメイン型と図表示インターフェース確定後 |

### AG-07 Quality, Accessibility & E2E Agent

| 項目 | 内容 |
| --- | --- |
| 起動名 | `quality_accessibility` |
| 役割 | テスト戦略、回帰試験、キーボード操作、アクセシビリティ、境界値を検証する |
| 主な所有範囲 | `tests/**`、`e2e/**`、Playwright設定、テスト用Fixture。製品コード修正は担当者へ依頼する |
| 成果物 | 単体・コンポーネント・API統合・E2Eテスト、要件別テスト結果 |
| 完了条件 | パスワード認証、セッション、ログアウト、Enter、Cmd/Ctrl + Enter、Tab、IME、Markdown、保存分離、失敗時入力保持を自動確認できる |
| 起動タイミング | 各機能の薄い縦断実装ができた時点から継続 |

### AG-08 DevOps & Release Agent

| 項目 | 内容 |
| --- | --- |
| 起動名 | `devops_release` |
| 役割 | Vercel互換性、CI、環境変数、ビルド再現性、運用手順を整える |
| 主な所有範囲 | `.github/workflows/**`、`.env.example`、`vercel.json`が必要な場合のみ、デプロイREADME |
| 成果物 | lint/typecheck/test/buildを行うCI、環境変数一覧、GitHub/Vercel手順、ヘルスチェック |
| 完了条件 | 実秘密情報なしでCIと`next build`が通り、実秘密情報は実行時だけ検証される |
| 起動タイミング | 中盤でCIを先行作成し、最終Waveでデプロイ準備を確認 |

## 4. セキュリティチーム

### SEC-RED レッドチーム

| 項目 | 内容 |
| --- | --- |
| 起動名 | `red_team` |
| 役割 | 攻撃者視点で設計・コード・ローカルまたは許可済みPreview環境の弱点を検出する |
| 主な確認対象 | パスワード総当たり、認証回避、セッション固定・改ざん、Cookie不備、ハッシュ・平文漏えい、CSRF、XSS、HTML注入、プロンプトインジェクション、API乱用、Sheets数式注入、ログ漏えい |
| 編集権限 | 原則読み取りとテスト作成のみ。修正はBlue Teamへ渡す |
| 成果物 | 重要度、再現条件、影響範囲、根拠、推奨対策を含むFinding一覧 |
| 禁止事項 | 本番・第三者サービスへの無許可攻撃、破壊的テスト、実秘密情報の取得・表示、実ユーザーデータの使用 |
| 完了条件 | Critical/High候補を網羅し、誤検知をPurple Teamと整理できる |

### SEC-BLUE ブルーチーム

| 項目 | 内容 |
| --- | --- |
| 起動名 | `blue_team` |
| 役割 | 防御設計、Red Team Findingの修正、監視・エラー処理・安全な既定値を実装する |
| 主な所有範囲 | Argon2id認証、セッション・Cookie、認証・認可ガード、セキュリティヘッダー、ログイン/APIレート制限、サニタイズ、監査ログ |
| 成果物 | 修正コード、回帰テスト、脅威ごとの防御根拠、運用監視項目 |
| 完了条件 | Critical/Highが解消され、Mediumは修正または受容理由が記録される |

### SEC-PURPLE パープルチーム

| 項目 | 内容 |
| --- | --- |
| 起動名 | `purple_team` |
| 役割 | RedとBlueの橋渡しを行い、Findingを再現可能なテストと受入条件へ変換する |
| 主な所有範囲 | `docs/security-review.md`、セキュリティ回帰テスト、Finding管理表 |
| 成果物 | Findingの重複整理、優先順位、修正担当、再テスト結果、残存リスク |
| 完了条件 | Critical/Highが再テスト済みで、未解決事項に所有者と判断理由がある |

## 5. 推奨起動Wave

### Wave 0: 調査と分割

1. `requirements_guard`がMust要件と受入条件を抽出する。
2. `lead_orchestrator`が現在のコード、依存関係、既存変更を確認する。
3. `architecture_domain`が共有型と境界を確定する。

### Wave 1: 基盤の並行実装

- `frontend_editor`: モックRepositoryを使って画面とエディタを実装する。
- `backend_sheets_auth`: 認証、Notes API、Sheets Repositoryを実装する。
- `gemini_diagram`: Geminiアダプタ、検証、図表示を実装する。

同時起動数に制限がある場合は、Leadを含めて3〜4エージェント以内にし、完了したエージェントを再利用する。

### Wave 2: 出力と縦断統合

- `html_export`: ポンチ絵画面とHTML生成を実装する。
- `quality_accessibility`: キーボード操作、API、縦断E2Eを追加する。
- LeadがNotes → 図生成 → 未保存プレビュー → HTMLダウンロード → 明示保存 → 再表示を接続する。

### Wave 3: セキュリティループ

1. `red_team`が独立レビューと許可範囲内の検証を行う。
2. `purple_team`がFindingを整理し、回帰テストへ変換する。
3. `blue_team`が修正する。
4. `purple_team`が回帰テストを実行する。
5. `red_team`がCritical/Highを再確認する。

### Wave 4: リリース準備

- `devops_release`がCI、環境変数、Vercel互換性、READMEを確認する。
- `requirements_guard`がトレーサビリティを最終更新する。
- Leadが全ゲートを実行し、GitHubへpush可能な状態を判定する。

## 6. 推奨agent_type対応表

利用するエージェント基盤に専門タイプがある場合は、次の割り当てを推奨する。該当タイプがない場合は`default`を使い、役割、所有範囲、完了条件をプロンプトで明示する。

| 起動名 | 推奨agent_type | 理由 |
| --- | --- | --- |
| `lead_orchestrator` | 親エージェント自身 / `system-architect` | 全体境界と統合判断を担う |
| `requirements_guard` | `requirements-analyst` | 仕様抽出とトレーサビリティ |
| `architecture_domain` | `system-architect` | ドメイン境界と共有インターフェース |
| `frontend_editor` | `frontend-architect` | エディタ、画面、アクセシビリティ |
| `gemini_diagram` | `backend-architect` | AIアダプタ、Schema、Route Handler |
| `backend_sheets_auth` | `backend-architect` | 認証、データ整合性、Sheets API |
| `html_export` | `frontend-architect` | 出力UIとブラウザ表示。HTMLビルダーはBackendとレビュー |
| `quality_accessibility` | `quality-engineer` | テスト設計、E2E、境界値 |
| `devops_release` | `devops-architect` | CI、Vercel、環境変数、リリース |
| `red_team` | `security-engineer` | 攻撃者視点の脅威検証 |
| `blue_team` | `security-engineer` | 防御実装と監視 |
| `purple_team` | `quality-engineer`または`security-engineer` | Findingを再現テストと受入条件へ変換 |

## 7. ファイル所有の推奨境界

| 領域 | 主担当 | レビュー担当 |
| --- | --- | --- |
| `src/domain/**`、共通Schema | Architecture | Gemini、Backend、Export |
| `src/components/editor/**`、メモ画面 | Frontend Editor | QA |
| `src/components/diagram/**`、Gemini | Gemini & Graph | Architecture、QA |
| `src/lib/sheets/**`、Notes/Snapshot API | Backend/Sheets/Auth | Blue、QA |
| `src/lib/export/**`、出力画面 | HTML Export | Blue、QA |
| 認証・認可・セキュリティ共通処理 | Backend + Blue | Red、Purple |
| `tests/**`、`e2e/**` | QA | 各機能担当 |
| CI、環境変数、デプロイ文書 | DevOps | Lead、Blue |

## 8. Spreadsheet情報

- **Spreadsheet URL:** https://docs.google.com/spreadsheets/d/1CqXYXrcsblxe2I7NBlesRSBq6DP4be1Bx8e1lyZWu50/edit?gid=0#gid=0
- **Spreadsheet ID:** `1CqXYXrcsblxe2I7NBlesRSBq6DP4be1Bx8e1lyZWu50`
- **初期gid:** `0`
- **利用予定シート:** `notes`、`diagram_snapshots`、`operations`

実装はgidや行番号を永続IDとして使用しない。起動時または最初のRepositoryアクセス時に、必要なシートと見出しを冪等に確認・作成する。Spreadsheetは`GOOGLE_SERVICE_ACCOUNT_EMAIL`の値に編集者権限で共有する。

## 9. 最終判定

Leadは次をすべて満たした場合だけ完了とする。

- 3仕様書のMust要件と主要受入条件に実装・テストの根拠がある。
- lint、format check、typecheck、unit、component、API integration、E2E、buildが成功する。
- Red/Blue/Purpleのセキュリティループが完了している。
- プレビュー、HTMLダウンロード、図生成が保存APIを呼ばないことをテストで保証している。
- `.env.example`に必要な変数があり、実秘密情報が含まれていない。
- `AUTH_PASSWORD_HASH`はArgon2idハッシュだけを受け付け、対話式ハッシュ生成コマンド、ログイン試行制限、安全なCookie、ログアウト、未認証API拒否が実装・テストされている。
- Spreadsheet IDが指定済みで、シート初期化が冪等である。
- READMEにGoogle共有、GitHub push、Vercel接続、環境変数設定の手順がある。
- 実環境変数とGoogleアクセス権を設定してGitHubへpushすれば、Vercelでデプロイできる状態である。
