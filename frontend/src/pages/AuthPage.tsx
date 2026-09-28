import { useState, type FormEvent } from 'react';
import { Link as RouterLink, Navigate, useLocation, useNavigate } from 'react-router';
import { QRCodeSVG } from 'qrcode.react';
import { useAuth } from '../auth';
import { ApiError } from '../api';
import { useErrorText, useI18n } from '../i18n';
import { Brand, Preferences } from '../components/Layout';
import { buttonCls, inputCls } from '../components/styles';
import { FieldError } from '../components/ui';

const DEMO_ACCOUNT = { username: 'demo', password: 'Demo@1234' };
const EXAMPLE_LONG_URL =
  'https://www.synerry.com/?utm_source=line&utm_medium=social&utm_campaign=digital-government-2026';
const EXAMPLE_CODE = 'synerry';
const EXAMPLE_SHORT_URL = `${__SHORT_BASE_URL__}/${EXAMPLE_CODE}`;
const EXAMPLE_SHORT_HOST = new URL(__SHORT_BASE_URL__).host;
const EXAMPLE_DAILY_CLICKS = [18, 26, 21, 34, 29, 47, 70];

export function AuthPage({ mode }: { mode: 'login' | 'register' }) {
  const { user, login, register } = useAuth();
  const { t } = useI18n();
  const errorText = useErrorText();
  const navigate = useNavigate();
  const location = useLocation();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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

  const fillDemo = () => {
    setUsername(DEMO_ACCOUNT.username);
    setPassword(DEMO_ACCOUNT.password);
    setError(null);
  };

  const fieldError = (f: string) => (error instanceof ApiError ? error.fieldError(f) : undefined);

  return (
    <div className="grid min-h-screen grid-rows-[auto_1fr] bg-surface lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:grid-rows-none">
      <aside className="relative flex flex-col gap-10 overflow-hidden bg-header px-6 py-6 text-white sm:px-10 lg:px-14 lg:py-10">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <Brand light size="lg" />
          <Preferences />
        </div>
        <div className="hidden flex-1 flex-col justify-center lg:flex">
          <h2 className="max-w-[18ch] text-4xl font-bold leading-tight xl:text-5xl">{t('auth.heroTitle')}</h2>
          <p className="mt-4 max-w-[46ch] text-lg text-white/70">{t('auth.heroBody')}</p>
          <LinkSpecimen />
        </div>
        <p className="hidden text-sm text-white/60 lg:block">{t('app.tagline')}</p>
      </aside>

      <main className="flex items-start justify-center px-6 py-10 sm:px-10 lg:items-center">
        <div className="w-full max-w-sm">
          <h1 className="text-3xl font-bold">{isRegister ? t('auth.register') : t('auth.login')}</h1>
          <p className="mt-2 text-slate-600">{isRegister ? t('auth.registerSubtitle') : t('auth.loginSubtitle')}</p>

          {!isRegister && (
            <div className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-line bg-mist px-4 py-3 text-sm">
              <span className="text-slate-600">
                {t('auth.demo')} <strong className="font-semibold text-navy">{DEMO_ACCOUNT.username}</strong> /{' '}
                <strong className="font-semibold text-navy">{DEMO_ACCOUNT.password}</strong>
              </span>
              <button type="button" onClick={fillDemo} className={buttonCls('outline', 'sm', 'shrink-0 bg-surface')}>
                {t('auth.useDemo')}
              </button>
            </div>
          )}

          <form onSubmit={submit} className="mt-6 space-y-5" noValidate>
            {error !== null && (
              <div role="alert" className="rounded-lg border border-brand/30 bg-red-50 px-3 py-2 text-sm text-brand">
                {errorText(error)}
              </div>
            )}
            <div>
              <label htmlFor="username" className="mb-1.5 block text-sm font-medium">
                {t('auth.username')}
              </label>
              <input
                id="username"
                autoComplete="username"
                autoCapitalize="none"
                spellCheck={false}
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={inputCls}
                required
              />
              {isRegister && <p className="mt-1 text-xs text-slate-500">{t('auth.usernameHint')}</p>}
              <FieldError message={fieldError('username')} />
            </div>
            <div>
              <label htmlFor="password" className="mb-1.5 block text-sm font-medium">
                {t('auth.password')}
              </label>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete={isRegister ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputCls} pr-12`}
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? t('auth.hidePassword') : t('auth.showPassword')}
                  aria-pressed={showPassword}
                  className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-[10px] text-slate-500 hover:text-navy"
                >
                  <EyeIcon open={showPassword} />
                </button>
              </div>
              {isRegister && <p className="mt-1 text-xs text-slate-500">{t('auth.passwordHint')}</p>}
              <FieldError message={fieldError('password')} />
            </div>
            <button type="submit" disabled={busy} className={buttonCls('primary', 'lg', 'w-full')}>
              {busy ? t('common.processing') : isRegister ? t('auth.submitRegister') : t('auth.login')}
            </button>
          </form>

          <p className="mt-6 border-t border-line pt-6 text-center text-sm text-slate-600">
            {isRegister ? t('auth.haveAccount') : t('auth.noAccount')}{' '}
            <RouterLink
              to={isRegister ? '/login' : '/register'}
              state={location.state}
              className="font-semibold text-brand hover:underline"
            >
              {isRegister ? t('auth.login') : t('auth.register')}
            </RouterLink>
          </p>
        </div>
      </main>
    </div>
  );
}

function LinkSpecimen() {
  const { t } = useI18n();
  const peak = Math.max(...EXAMPLE_DAILY_CLICKS);
  const total = EXAMPLE_DAILY_CLICKS.reduce((sum, n) => sum + n, 0);
  return (
    <figure
      className="mt-10 max-w-xl rounded-2xl bg-white/[0.06] p-6 ring-1 ring-white/10"
      aria-label={t('auth.example')}
    >
      <p className="text-sm text-white/70">{t('auth.exampleOriginal')}</p>
      <p className="mt-1 truncate text-white/80" title={EXAMPLE_LONG_URL}>
        {EXAMPLE_LONG_URL}
      </p>
      <div className="my-4 flex items-center gap-3 text-brand" aria-hidden>
        <svg
          viewBox="0 0 16 16"
          className="h-4 w-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M8 2v11M3.5 8.5 8 13l4.5-4.5" />
        </svg>
        <span className="h-px flex-1 bg-white/10" />
      </div>
      <div className="specimen-reveal flex items-center gap-5">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-white/70">{t('auth.exampleShort')}</p>
          <p className="mt-1 truncate text-lg text-white/80">{EXAMPLE_SHORT_HOST}</p>
          <p className="text-4xl font-bold tracking-tight">
            <span className="text-brand">/</span>
            {EXAMPLE_CODE}
          </p>
          <div className="mt-4 flex items-end gap-1.5" aria-hidden>
            {EXAMPLE_DAILY_CLICKS.map((n, i) => (
              <span
                key={i}
                className={`w-5 rounded-t-sm ${i === EXAMPLE_DAILY_CLICKS.length - 1 ? 'bg-brand' : 'bg-white/25'}`}
                style={{ height: `${Math.round((n / peak) * 44)}px` }}
              />
            ))}
          </div>
          <p className="mt-2 text-sm text-white/70">{t('auth.exampleClicks', { total })}</p>
        </div>
        <div className="shrink-0 rounded-xl bg-white p-2.5">
          <QRCodeSVG value={EXAMPLE_SHORT_URL} size={96} fgColor="#1b2340" />
        </div>
      </div>
      <figcaption className="mt-5 text-xs text-white/60">{t('auth.example')}</figcaption>
    </figure>
  );
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
      {open && <path d="M4 4l16 16" />}
    </svg>
  );
}
