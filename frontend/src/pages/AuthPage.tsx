import { useState, type FormEvent } from 'react';
import { Link as RouterLink, Navigate, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../auth';
import { ApiError } from '../api';
import { useErrorText, useI18n } from '../i18n';
import { Brand, Preferences } from '../components/Layout';
import { buttonCls, inputCls } from '../components/styles';
import { FieldError } from '../components/ui';

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { user, login, register } = useAuth();
  const { t } = useI18n();
  const errorText = useErrorText();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const from = (location.state as { from?: string } | null)?.from ?? '/';
  const isRegister = mode === 'register';

  if (user) return <Navigate to={from} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await (isRegister ? register(username, password) : login(username, password));
      navigate(from, { replace: true });
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const fieldError = (f: string) => (error instanceof ApiError ? error.fieldError(f) : undefined);

  return (
    <div className="relative grid min-h-screen place-items-center bg-header px-4 py-10">
      <div className="absolute right-4 top-4">
        <Preferences />
      </div>
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="flex justify-center">
            <Brand light size="lg" />
          </div>
          <p className="mt-2 text-sm text-white/70">{t('app.tagline')}</p>
        </div>
        <form
          onSubmit={submit}
          className="space-y-4 rounded-2xl border-t-4 border-brand bg-surface p-6 shadow-2xl"
          noValidate
        >
          <h1 className="text-xl font-bold">{isRegister ? t('auth.register') : t('auth.login')}</h1>
          {error !== null && (
            <div role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-brand">
              {errorText(error)}
            </div>
          )}
          <div>
            <label htmlFor="username" className="mb-1 block text-sm font-medium">
              {t('auth.username')}
            </label>
            <input
              id="username"
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={inputCls}
              required
            />
            {isRegister && <p className="mt-1 text-xs text-slate-500">{t('auth.usernameHint')}</p>}
            <FieldError message={fieldError('username')} />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium">
              {t('auth.password')}
            </label>
            <input
              id="password"
              type="password"
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCls}
              required
            />
            {isRegister && <p className="mt-1 text-xs text-slate-500">{t('auth.passwordHint')}</p>}
            <FieldError message={fieldError('password')} />
          </div>
          <button
            type="submit"
            disabled={busy || !username || !password}
            className={buttonCls('primary', 'lg', 'w-full')}
          >
            {busy ? t('common.processing') : isRegister ? t('auth.submitRegister') : t('auth.login')}
          </button>
          <p className="text-center text-sm text-slate-600">
            {isRegister ? t('auth.haveAccount') : t('auth.noAccount')}{' '}
            <RouterLink
              to={isRegister ? '/login' : '/register'}
              state={location.state}
              className="font-semibold text-brand hover:underline"
            >
              {isRegister ? t('auth.login') : t('auth.register')}
            </RouterLink>
          </p>
        </form>
        {!isRegister && (
          <p className="mt-4 text-center text-sm text-white/70">
            {t('auth.demo')} <code className="text-white">demo</code> / <code className="text-white">Demo@1234</code>
          </p>
        )}
      </div>
    </div>
  );
}
