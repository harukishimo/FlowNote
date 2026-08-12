import { PasswordLoginForm } from '@/components/auth/PasswordLoginForm';
import { FlowNoteLogo } from '@/components/brand/FlowNoteLogo';

export default function LoginPage() {
  return (
    <main className="login-shell">
      <section className="login-card" aria-labelledby="login-heading">
        <FlowNoteLogo className="login-logo" title="FlowNote" />
        <p className="eyebrow">FLOWNOTE</p>
        <h1 id="login-heading">メモから、流れを見つける。</h1>
        <p className="login-description">業務メモを入力すると、アクティビティ図と説明用のポンチ絵に整理できます。</p>
        <PasswordLoginForm />
        <p className="login-note">共有パスワードで保護されたワークスペースです。</p>
      </section>
    </main>
  );
}
