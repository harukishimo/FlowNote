'use client';

import { FormEvent, useState } from 'react';
import { signIn } from 'next-auth/react';

export function PasswordLoginForm() {
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading || !password) return;
    setLoading(true); setError('');
    try {
      const next = new URLSearchParams(window.location.search).get('next');
      const result = await signIn('credentials', { password, redirect: false, callbackUrl: next && next.startsWith('/') ? next : '/' });
      if (!result || result.error) throw new Error(result?.error === 'TooManyRequests' ? 'しばらく時間をおいて、もう一度お試しください。' : 'パスワードを確認してください。');
      window.location.assign(result.url ?? (next && next.startsWith('/') ? next : '/'));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'パスワードを確認してください。');
      setLoading(false);
    }
  }

  return (
    <form className="login-form" onSubmit={submit} noValidate>
      <div className="field-group">
        <label htmlFor="password">パスワード</label>
        <div className="password-wrap">
          <input id="password" name="password" type={visible ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" aria-describedby={error ? 'login-error' : undefined} aria-invalid={Boolean(error)} autoFocus />
          <button className="input-action" type="button" onClick={() => setVisible((current) => !current)} aria-label={visible ? 'パスワードを隠す' : 'パスワードを表示'} aria-pressed={visible}>{visible ? '隠す' : '表示'}</button>
        </div>
      </div>
      {error && <p className="form-error" id="login-error" role="alert">{error}</p>}
      <button className="button button-primary button-large" type="submit" disabled={loading || !password}>{loading ? '確認しています…' : 'ログイン'}</button>
    </form>
  );
}
