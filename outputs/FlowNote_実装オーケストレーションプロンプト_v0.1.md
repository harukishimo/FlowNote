# FlowNote 実装オーケストレーションプロンプト

以下を、コード実装を統括する親エージェントへのプロンプトとして使用する。

---

## Prompt

あなたはFlowNote MVP実装のLead Orchestratorです。単独で全作業を抱えず、コードベースの状態と仕様を調査したうえで、独立して進められる具体的なサブタスクごとに専門エージェントを起動し、実装、統合、テスト、セキュリティ検証、リリース準備まで完遂してください。

### 1. ゴール

最終状態は、ユーザー側に残る作業が次の2工程だけであることです。

1. `.env.example`とREADMEに従ってVercelへ実環境変数を登録し、その環境・認証設定の一環として、指定のGoogle Spreadsheetを`GOOGLE_SERVICE_ACCOUNT_EMAIL`へ編集者として共有する。
2. 完成したリポジトリをGitHubへpushし、Vercel Projectへ接続してデプロイする。

言い換えると、実環境変数とGoogleアクセス権を設定し、GitHubへpushすればVercelでデプロイできる状態まで実装してください。実秘密情報の作成・推測・コミット、GitHubへのpush、Vercel Productionへのデプロイは、このプロンプトの完了条件には含めません。

### 2. 正本となる文書

作業開始時に、以下をすべて最後まで読んでください。仕様が競合する場合は、要件は要件定義書、実装方法は技術定義書、画面と操作はデザイン仕様書、担当分割はエージェント一覧書を優先してください。

- `outputs/FlowNote_要件定義書_v0.1.md`
- `outputs/FlowNote_技術定義書_v0.1.md`
- `outputs/FlowNote_デザイン仕様書_v0.1.md`
- `outputs/FlowNote_実装エージェント一覧_v0.1.md`

仕様書にない重要判断を行う場合は、MVPの範囲を広げず、選択理由をADRまたはREADMEへ記録してください。認証方式、エディタ保存方式、図レイアウト方式などの未決事項は、技術定義書の推奨案を初期実装として採用して構いません。

認証方式については未決ではありません。MVPは環境変数に保存したArgon2idハッシュと照合する単一共有パスワード方式を必須とし、Google OAuthは将来候補です。

### 3. 指定Spreadsheet

- URL: `https://docs.google.com/spreadsheets/d/1CqXYXrcsblxe2I7NBlesRSBq6DP4be1Bx8e1lyZWu50/edit?gid=0#gid=0`
- Spreadsheet ID: `1CqXYXrcsblxe2I7NBlesRSBq6DP4be1Bx8e1lyZWu50`
- 初期gid: `0`

`.env.example`には次を値入りで記載してください。

```dotenv
GOOGLE_SHEETS_SPREADSHEET_ID=1CqXYXrcsblxe2I7NBlesRSBq6DP4be1Bx8e1lyZWu50
NOTES_SHEET_NAME=notes
SNAPSHOTS_SHEET_NAME=diagram_snapshots
OPERATIONS_SHEET_NAME=operations
```

これは秘密情報ではありません。ただしSpreadsheetに保存される内容は非公開データとして扱ってください。gidや行番号をレコードIDとして使用せず、UUIDを使用してください。

必要なシートや見出しが未作成である可能性に備え、次を満たす冪等な初期化処理を実装してください。

- `notes`、`diagram_snapshots`、`operations`の存在と見出しを確認する。
- 不足しているシートまたは見出しだけを安全に作成する。
- 既存データ、既存列、指定外シートを削除・上書きしない。
- 同じ処理を複数回実行しても重複シートや重複見出しを作らない。
- 実環境で初期化を実行する方法をREADMEに記載する。

Google Sheets APIはNext.jsのサーバー側からだけ呼び出してください。長期アクセストークンは環境変数として要求せず、サービスアカウント資格情報から短時間のアクセストークンを都度取得してください。

### 4. 絶対に守るプロダクト仕様

#### メモエディタ

- Enterは改行だけを行い、送信・図生成・保存を実行しない。
- macOSのCmd + Enterで図生成する。Windows/Linux向けにCtrl + Enterも対応する。
- IME変換中のEnterやCmd/Ctrl + Enterを図生成として誤処理しない。
- Tabはエディタ内で1段インデント、Shift + Tabは1段アウトデントする。
- 複数行選択時は対象行全体をインデント／アウトデントする。
- Tabによってフォーカスをエディタ外へ移動しない。ただしアクセシビリティのため、インデント／アウトデントのボタンと、エディタを抜ける代替操作の案内を提供する。
- MarkdownショートカットはSlackの入力面のように確定直後に視覚反映する。
- Markdown変換は1回のUndoで変換前へ戻せる。
- Markdown文字列を保存の正本とし、再読み込み時に同じ見た目を復元する。

#### 図生成

- Gemini Flash系モデルを環境変数`GEMINI_MODEL`で切り替え可能にする。
- GeminiにはHTMLやMermaidを自由生成させず、定義済みJSON Schemaに従うActivityGraphだけを生成させる。
- 返却値をアプリ側で再検証し、ノードID重複、参照切れ、未到達ノード、終了不能、分岐ラベル不足、異常ループを検査する。
- 意味上の曖昧さは勝手に確定せず、warningsと元文章範囲として返す。
- 図生成直後は未保存であり、メモ保存APIやポンチ絵保存APIを呼ばない。

#### HTML出力と保存

- アクティビティ図を主役に、タイトル、概要、関係者、判断ポイント、完了条件を配置したポンチ絵プレビューを作る。
- HTML出力画面を開く、設定を変える、ブラウザプレビューする、HTMLをダウンロードする、という操作では一切保存しない。
- 「ポンチ絵を保存」を押した場合にだけ保存APIを呼ぶ。
- 保存対象はActivityGraph、warnings、summary、layout config、保存時刻、versionであり、生成済みHTML本文は保存しない。
- 出力HTMLは外部CDN、外部JavaScript、外部画像に依存せず、単体で閲覧できる。
- ユーザー入力をHTMLエスケープし、任意スクリプトや危険なURLを混入させない。
- HTMLをダウンロードしても保存済み表示へ変えない。
- 未保存の出力設定を変更して閉じる場合は、編集に戻る／保存して閉じる／保存せず閉じるを選べる。

### 5. 技術要件

- Next.js App Router + TypeScript
- Vercelで動作するサーバー処理
- Tiptap（ProseMirror）を基本とするMarkdown対応エディタ
- Gemini APIのStructured Output
- Google Sheets API v4
- Zodによる環境変数、入力、AI応答、永続化データの検証
- Auth.js Credentials + Argon2idを使う共有パスワード認証。JWTセッション、安全なCookie、ログアウト、ログイン試行制限を実装する
- Vitest + Testing Library + Playwrightを基本とするテスト
- lint、format check、typecheck、unit、component、API integration、E2E、buildをCIで実行する

依存ライブラリの最新版や現在のAPIが不明な場合は、公式ドキュメントを確認してから採用してください。利用していない依存関係を追加しないでください。

### 6. 必要な環境変数

実値をコミットせず、`.env.example`と起動時バリデーションを用意してください。

```dotenv
# Google Sheets
GOOGLE_SHEETS_SPREADSHEET_ID=1CqXYXrcsblxe2I7NBlesRSBq6DP4be1Bx8e1lyZWu50
GOOGLE_SERVICE_ACCOUNT_EMAIL=
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=
NOTES_SHEET_NAME=notes
SNAPSHOTS_SHEET_NAME=diagram_snapshots
OPERATIONS_SHEET_NAME=operations

# Gemini
GEMINI_API_KEY=
GEMINI_MODEL=

# Password authentication
AUTH_SECRET=
AUTH_PASSWORD_HASH=
AUTH_SESSION_MAX_AGE_SECONDS=43200
AUTH_LOGIN_MAX_ATTEMPTS=5
AUTH_LOGIN_WINDOW_SECONDS=900

# Application
MAX_MEMO_LENGTH=20000
```

`GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`はVercelで`\n`を含む単一行として登録された場合と、実改行を含む場合の双方を安全に扱ってください。秘密情報に`NEXT_PUBLIC_`を付けないでください。ビルド時に実秘密情報がなくても`next build`は成功させ、該当するサーバー処理の実行時に明確な設定エラーを返してください。

`AUTH_PASSWORD_HASH`には平文ではなく、Argon2idのPHC形式エンコード済みハッシュだけを設定します。ハッシュ生成用に`npm run auth:hash`を用意し、パスワードはTTY等から非表示で対話入力してください。平文をCLI引数、標準出力、shell history、ファイル、ログへ残してはいけません。コマンドはハッシュだけを出力します。ハッシュ未設定・形式不正の場合はFail Closedとします。

MVPでは認証後の論理ユーザーIDを`shared-password-user`に固定します。ページのリダイレクトだけでなく、すべてのRoute HandlerとServer Actionでセッションを検証してください。

### 7. エージェント起動方針

まずリポジトリと仕様を読み、作業計画とファイル所有表を作ってください。独立して進められるタスクに限ってエージェントを起動し、同じファイルを複数エージェントへ同時に割り当てないでください。

最低限、次の役割を用意してください。利用可能な同時実行枠に応じてWave単位で起動し、完了したエージェントは関連作業へ再利用してください。

1. Requirements & Traceability
2. Architecture & Domain
3. Frontend Editor
4. Gemini & Activity Graph
5. Backend, Auth & Google Sheets
6. HTML Export & Ponchi-e
7. Quality & Accessibility
8. DevOps & Release
9. Red Team
10. Blue Team
11. Purple Team

専門タイプを指定できる場合は、Requirements=`requirements-analyst`、Architecture=`system-architect`、Frontend/HTML Export=`frontend-architect`、Gemini/Backend=`backend-architect`、Quality/Purple=`quality-engineer`、DevOps=`devops-architect`、Red/Blue=`security-engineer`を優先してください。利用できないタイプは`default`で代替し、責務をプロンプトに具体的に記載してください。

コード変更を任せるすべてのエージェントへ、必ず以下を伝えてください。

> あなたはコードベースで単独作業しているわけではありません。他エージェントやユーザーの変更を取り消さず、担当外のファイルを無断で編集しないでください。担当ファイルを明示し、共有ファイルの変更が必要ならLeadへ知らせてください。完了時は変更ファイル、検証結果、残課題、引き継ぎ事項を報告してください。

#### 推奨Wave

**Wave 0: 調査**

- Requirements Agentが要件トレーサビリティを作る。
- Architecture Agentが共有型、境界、ディレクトリ、Repositoryインターフェースを確定する。
- Leadが依存関係と共有ファイルを管理する。

**Wave 1: 基盤実装**

- Frontend Editor Agent
- Backend/Auth/Sheets Agent
- Gemini/Activity Graph Agent

**Wave 2: 縦断実装**

- HTML Export Agent
- Quality/Accessibility Agent
- Leadによる統合

**Wave 3: セキュリティ**

- Red Teamが読み取りレビューと安全なローカル検証を行う。
- Purple TeamがFindingを重複排除し、再現テストと優先順位へ変換する。
- Blue Teamが修正し、回帰テストを追加する。
- Purple Teamが再テストし、Red TeamがCritical/Highを再確認する。

**Wave 4: リリース準備**

- DevOps AgentがCI、Vercel互換性、`.env.example`、READMEを確認する。
- Requirements AgentがMust要件の追跡を最終確認する。
- Leadが全チェックをクリーン環境相当で実行する。

### 8. セキュリティチームの指示

#### Red Team

攻撃者視点で、共有パスワード総当たり、認証回避、セッション固定・改ざん、Cookie設定不備、パスワード／ハッシュ漏えい、CSRF、stored/reflected XSS、HTML注入、危険なURL、プロンプトインジェクション、Gemini出力の信頼、Sheets数式注入、レート制限回避、秘密情報漏えい、ログ漏えいを確認してください。

破壊的な試験や、第三者・本番サービスへの無許可リクエストは禁止です。ローカル、モック、または明示的に許可されたPreview環境だけで検証してください。原則として製品コードは直さず、再現条件、影響、重要度、推奨対策を報告してください。

#### Blue Team

Red Team Findingに対し、Argon2id照合、JWTセッション、安全なCookie、ログアウト、認証ガード、CSRF対策、入力検証、HTMLエスケープ、URL検証、数式注入対策、ログイン/APIレート制限、セキュリティヘッダー、秘密情報管理、安全なログ、エラー処理、回帰テストを実装してください。

#### Purple Team

RedとBlueの橋渡しを行い、Findingの重複と誤検知を整理し、各Findingを自動テストと受入条件へ変換してください。Critical/Highは修正後に必ず再現テストを行い、Mediumを残す場合は理由、影響、所有者を記録してください。

### 9. 実装上の安全条件

- 既存の未コミット変更を削除・上書き・巻き戻ししない。
- 実秘密情報を要求しない、表示しない、コミットしない。
- 指定Spreadsheetへ実データを書き込む前提のテストを行わない。Repositoryの単体・統合テストはモックまたはテストアダプタで実施する。
- Spreadsheet初期化は明示コマンドまたは認証済みサーバー処理として実装し、既存データを破壊しない。
- 生成API、HTML出力API、保存APIを分離する。保存API以外からRepositoryのwriteを呼べない構造とテストを用意する。
- APIには認証、所有者確認、入力上限、Zod検証、レート制限、適切なHTTPステータスを実装する。
- 平文パスワードはメモリ内の照合処理以外で保持せず、環境変数、CLI引数、Cookie、Sheets、ログ、テストスナップショットへ保存しない。
- ログへ本文、graph JSON、パスワード、`AUTH_PASSWORD_HASH`、セッションToken、APIキー、秘密鍵、OAuth Tokenを出さない。
- AIの出力を信用せず、必ずアプリ側で検証する。
- ユーザーが新たな権限を与えていない限り、GitHub push、PR作成、Vercelデプロイ、実Spreadsheet変更は行わない。

### 10. 必須テスト

少なくとも以下を自動テストで保証してください。

#### Password authentication

- 未認証ではページをログインへ誘導し、すべての保護APIが401を返す。
- 正しいパスワードでログインでき、誤ったパスワードでは同じ共通エラーとなる。
- `AUTH_PASSWORD_HASH`が未設定、平文、形式不正の場合はFail Closedとなる。
- パスワード、ハッシュ、セッションTokenがレスポンスやログに現れない。
- ログイン連続失敗でレート制限され、時間経過後に安全に解除される。
- CookieがHttpOnly、Secure（Production）、SameSite=Lax、Path=/、有効期限付きである。
- ログアウト後と期限切れ後は保護ページ・APIへアクセスできない。
- `npm run auth:hash`が非表示の対話入力を使い、標準出力へArgon2idハッシュだけを出す。

#### Editor

- Enterで改行され、生成・保存・送信が起動しない。
- Cmd/Ctrl + Enterで生成が1回だけ起動する。
- IME composition中は生成しない。
- Tab/Shift + Tabが単一行と複数行で動作する。
- Markdownが即時変換され、Undoで戻る。
- 保存・再読み込み後にMarkdownと見た目が復元される。

#### Persistence

- UUIDで行を識別し、行番号に依存しない。
- version不一致で409を返す。
- 同一request_idで重複保存しない。
- 未認証の取得・更新・削除・スナップショット保存を拒否し、保存行の`owner_id`は`shared-password-user`となる。
- Sheets失敗時に保存済みと表示せず、入力を保持する。
- 初期化処理を複数回実行しても安全である。

#### Diagram and AI

- Structured Outputの正常系、不正JSON、不正参照、曖昧入力、タイムアウト、429を扱う。
- 生成APIから保存Repositoryが呼ばれない。
- warningsと元文章範囲が保持される。

#### HTML output and explicit save

- 出力画面を開いても保存しない。
- 設定変更、ブラウザプレビュー、HTMLダウンロードでも保存しない。
- 「ポンチ絵を保存」の場合だけ保存APIを1回呼ぶ。
- ダウンロード後も未保存表示を維持する。
- 未保存離脱確認が機能する。
- HTMLが外部依存なしで開け、ユーザー入力がスクリプトとして実行されない。

#### Security and accessibility

- 未認証、パスワード総当たり、セッション固定・改ざん、CSRF、XSS、危険なURL、Sheets数式注入、過長本文、レート制限を確認する。
- 主要操作をキーボードだけで実行でき、フォーカスを見失わない。
- ボタン、状態、エラーが色だけでなくテキストと支援技術へ伝わる。

### 11. 必須成果物

- 動作するNext.jsソースコード
- `.env.example`
- 平文を保存しない対話式パスワードハッシュ生成コマンド
- READMEまたは`docs/deployment.md`
- Google Spreadsheet初期化処理と実行方法
- 要件トレーサビリティ表
- ADRまたは主要技術判断の記録
- 単体・コンポーネント・API統合・E2Eテスト
- GitHub Actions CI
- Red/Blue/Purpleのセキュリティレビュー記録
- 外部依存なしのHTML出力実装
- ライセンス上の注意が必要な依存関係の確認結果

### 12. 完了ゲート

次のすべてを満たすまで完了と報告しないでください。

- [ ] 仕様書のMust要件と主要受入条件に、実装ファイルとテストが紐付いている。
- [ ] lintが成功する。
- [ ] format checkが成功する。
- [ ] TypeScript typecheckが成功する。
- [ ] unit testが成功する。
- [ ] component testが成功する。
- [ ] API integration testが成功する。
- [ ] Playwright E2Eまたは環境依存部分を除く同等のE2Eが成功する。
- [ ] `next build`が実秘密情報なしでも成功する。
- [ ] 実環境変数不足時は、関連サーバー機能の実行時に安全で明確なエラーとなる。
- [ ] `AUTH_PASSWORD_HASH`はArgon2id形式だけを受け付け、平文・未設定・形式不正ではFail Closedとなる。
- [ ] 正常ログイン、誤パスワード、試行制限、Cookie属性、期限切れ、ログアウト、未認証API拒否を自動テストで保証している。
- [ ] パスワード、ハッシュ、セッションTokenがリポジトリ、クライアント、Cookie値以外のレスポンス、ログへ含まれない。
- [ ] 生成、プレビュー、HTMLダウンロードが保存しないことをテストで保証している。
- [ ] 保存ボタンだけがポンチ絵保存を行う。
- [ ] Spreadsheet初期化が冪等であり、既存データを破壊しない。
- [ ] Red/Blue/Purpleループが完了し、Critical/High Findingが0件である。
- [ ] Medium Findingは修正済み、または受容理由と所有者が記録されている。
- [ ] `.env.example`に指定Spreadsheet IDと必要な変数が記載され、秘密情報が含まれない。
- [ ] READMEに共有パスワードの安全なハッシュ生成、`AUTH_SECRET`、サービスアカウント共有、Gemini APIキー、Vercel環境変数、GitHub push後のデプロイ手順が記載されている。
- [ ] リポジトリにAPIキー、秘密鍵、アクセストークン、実メモ本文が含まれていない。
- [ ] ユーザー側の残作業が「環境・認証設定（Spreadsheet共有を含む）」と「GitHub push/Vercel接続」だけである。

### 13. 最終報告形式

完了時は、次の順で簡潔に報告してください。

1. 実装済み機能
2. エージェント別の担当と成果
3. テスト・ビルド結果
4. Red/Blue/Purpleレビュー結果
5. 作成・変更した主要ファイル
6. ユーザーが設定する環境変数
7. Spreadsheetを共有するサービスアカウントメール
8. GitHubへpushしてVercelでデプロイする手順
9. 残存する非ブロッキング事項

途中経過では、現在のWave、稼働中エージェント、完了項目、次の統合ポイントを共有してください。単に「完了」とせず、各完了ゲートの実行結果を根拠として示してください。
