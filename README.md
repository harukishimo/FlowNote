# FlowNote

メモ本文からアクティビティ図とポンチ絵HTMLを生成するNext.jsアプリです。図のプレビュー・HTMLダウンロードと、ポンチ絵スナップショットの保存は別操作になっています。

## ローカル起動

```bash
npm install
cp .env.example .env.local
npm run auth:hash # 対話入力したArgon2idハッシュをAUTH_PASSWORD_HASHへ設定
npm run dev
```

秘密情報はクライアントへ公開しないでください。`GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` はVercelの環境変数へ登録する際に改行を `\\n` として入力できます。Googleスプレッドシートは次のIDを使用します。

`1CqXYXrcsblxe2I7NBlesRSBq6DP4be1Bx8e1lyZWu50`

サービスアカウントのメールアドレスを対象スプレッドシートへ編集者として共有してください。初回の保存時に `notes`、`diagram_snapshots`、`operations` のタブとヘッダーを破壊的変更なしで冪等に初期化します。

## 検証

```bash
npm run typecheck
npm test
npm run build
```

## Vercel

1. GitHubへこのリポジトリをpushする。
2. VercelでリポジトリをImportする。
3. `.env.example` の値をPreview/Productionそれぞれへ登録する（`AUTH_SECRET`、`AUTH_PASSWORD_HASH`、Geminiキー、サービスアカウント秘密鍵は必須）。
4. 再デプロイ後、共有パスワードでログインしてメモ作成・図生成・明示保存を確認する。

認証ハッシュ未設定・形式不正時はfail closedになります。ビルドは実秘密情報なしで完了しますが、ログイン/APIは設定エラーになります。
