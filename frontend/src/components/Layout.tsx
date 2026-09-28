import { NavLink, Outlet, useLocation, useNavigate } from 'react-router';
import { useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '../auth';
import { useI18n } from '../i18n';
import { useTheme, type ThemeChoice } from '../theme';
import { Tour, type TourStep } from './Tour';

export function Brand({ light = false, size = 'md' }: { light?: boolean; size?: 'md' | 'lg' }) {
  const logo = light ? '/synerry-logo-dark.png' : '/synerry-logo.png';
  const mark = light ? '/synerry-mark-dark.png' : '/synerry-mark.png';
  const height = size === 'lg' ? 'h-14' : 'h-9';
  return (
    <span className={`inline-flex items-center gap-3 ${light ? 'text-white' : 'text-navy'}`}>
      <img
        src={logo}
        alt="Synerry"
        className={`${height} w-auto ${size === 'md' ? 'hidden sm:block print:block' : ''}`}
      />
      {size === 'md' && <img src={mark} alt="Synerry" className="h-8 w-auto sm:hidden print:hidden" />}
      <span className="h-7 w-px bg-current opacity-25" aria-hidden />
      <span className={`whitespace-nowrap font-semibold ${size === 'lg' ? 'text-xl' : ''}`}>Short URL</span>
    </span>
  );
}

const THEME_ICONS: Record<ThemeChoice, ReactNode> = {
  light: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M2.5 12h2M19.5 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
    </>
  ),
  dark: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />,
  system: (
    <>
      <rect x="3" y="4" width="18" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </>
  ),
};

const THEME_ORDER: ThemeChoice[] = ['light', 'dark', 'system'];

const segBtn = (active: boolean) =>
  `grid h-7 min-w-7 place-items-center rounded-md px-2 text-xs font-semibold transition-colors duration-150 ${
    active ? 'bg-white text-header shadow-sm' : 'text-white/65 hover:bg-white/10 hover:text-white'
  }`;

export function Preferences() {
  const { lang, setLang, t } = useI18n();
  const { choice, setChoice } = useTheme();
  return (
    <div className="flex items-center gap-2" data-tour="prefs">
      <div className="flex gap-0.5 rounded-lg bg-white/10 p-0.5" role="group" aria-label="Language">
        <button
          type="button"
          onClick={() => setLang('th')}
          aria-pressed={lang === 'th'}
          className={segBtn(lang === 'th')}
        >
          TH
        </button>
        <button
          type="button"
          onClick={() => setLang('en')}
          aria-pressed={lang === 'en'}
          className={segBtn(lang === 'en')}
        >
          EN
        </button>
      </div>
      <div className="flex gap-0.5 rounded-lg bg-white/10 p-0.5" role="group" aria-label="Theme">
        {THEME_ORDER.map((option) => {
          const label = t(`theme.${option}`);
          return (
            <button
              key={option}
              type="button"
              onClick={() => setChoice(option)}
              aria-pressed={choice === option}
              aria-label={label}
              title={label}
              className={segBtn(choice === option)}
            >
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                {THEME_ICONS[option]}
              </svg>
            </button>
          );
        })}
      </div>
    </div>
  );
}

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-2 text-sm font-medium transition ${isActive ? 'bg-white/15 text-white' : 'text-white/70 hover:text-white'}`;

export function Layout() {
  const { user, logout, markOnboarded } = useAuth();
  const { t } = useI18n();
  const navigate = useNavigate();
  const location = useLocation();
  const [touring, setTouring] = useState(false);

  useEffect(() => {
    if (user && !user.onboardedAt && location.pathname === '/') setTouring(true);
  }, [user, location.pathname]);

  const tourSteps: TourStep[] = [
    { id: 'welcome' },
    { id: 'url', target: 'url' },
    { id: 'options', target: 'options' },
    { id: 'history', target: 'nav-links' },
    { id: 'trash', target: 'nav-trash' },
    { id: 'prefs', target: 'prefs' },
    ...(user?.role === 'admin' ? [{ id: 'admin', target: 'nav-admin' }] : []),
    { id: 'helpBtn', target: 'help' },
  ];

  const finishTour = () => {
    setTouring(false);
    markOnboarded();
  };

  const replayTour = () => {
    if (location.pathname !== '/') navigate('/');
    setTouring(true);
  };

  const onLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen">
      <header className="border-b-2 border-brand bg-header print:hidden">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <NavLink to="/" className="mr-2">
            <Brand light />
          </NavLink>
          <nav className="flex gap-1">
            <NavLink to="/" end className={navClass}>
              {t('nav.overview')}
            </NavLink>
            <NavLink to="/links" end className={navClass} data-tour="nav-links">
              {t('nav.links')}
            </NavLink>
            <NavLink to="/trash" className={navClass} data-tour="nav-trash">
              {t('nav.trash')}
            </NavLink>
            {user?.role === 'admin' && (
              <NavLink to="/admin" className={navClass} data-tour="nav-admin">
                {t('nav.admin')}
              </NavLink>
            )}
          </nav>
          <div className="ml-auto flex flex-wrap items-center gap-3 text-sm text-white/80">
            <button
              type="button"
              onClick={replayTour}
              aria-label={t('tour.help')}
              title={t('tour.help')}
              data-tour="help"
              className="grid h-8 w-8 place-items-center rounded-lg text-white/75 hover:bg-white/10 hover:text-white"
            >
              <svg
                viewBox="0 0 24 24"
                className="h-5 w-5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <circle cx="12" cy="12" r="9" />
                <path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.3" />
                <path d="M12 17h.01" />
              </svg>
            </button>
            <Preferences />
            <span className="hidden sm:inline">
              {t('nav.user')}: <strong className="text-white">{user?.username}</strong>
            </span>
            <button
              onClick={onLogout}
              className="rounded-lg border border-white/30 px-3 py-1.5 text-white hover:bg-white/10"
            >
              {t('nav.logout')}
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 print:max-w-none print:p-0">
        <Outlet />
      </main>
      {touring && <Tour steps={tourSteps} onFinish={finishTour} />}
    </div>
  );
}
