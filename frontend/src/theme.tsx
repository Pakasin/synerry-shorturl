import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';

export type ThemeChoice = 'light' | 'dark' | 'system';

type ThemeValue = {
  choice: ThemeChoice;
  resolved: 'light' | 'dark';
  setChoice: (c: ThemeChoice) => void;
};

const ThemeContext = createContext<ThemeValue | null>(null);

const STORAGE_KEY = 'synerry.theme';

function initialChoice(): ThemeChoice {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<ThemeChoice>(initialChoice);
  const [systemDark, setSystemDark] = useState(() => darkQuery().matches);

  useEffect(() => {
    const mq = darkQuery();
    const onChange = () => setSystemDark(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const resolved = choice === 'system' ? (systemDark ? 'dark' : 'light') : choice;

  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark');
  }, [resolved]);

  const setChoice = useCallback((c: ThemeChoice) => {
    setChoiceState(c);
    try {
      localStorage.setItem(STORAGE_KEY, c);
    } catch {}
  }, []);

  const value = useMemo(() => ({ choice, resolved, setChoice }), [choice, resolved, setChoice]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}

function usePrinting() {
  const [printing, setPrinting] = useState(() => window.matchMedia('print').matches);
  useEffect(() => {
    const mq = window.matchMedia('print');
    const set = (value: boolean) => flushSync(() => setPrinting(value));
    const before = () => set(true);
    const after = () => set(false);
    const onChange = () => set(mq.matches);
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    mq.addEventListener('change', onChange);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
      mq.removeEventListener('change', onChange);
    };
  }, []);
  return printing;
}

export function useChartColors() {
  const { resolved } = useTheme();
  const printing = usePrinting();
  return resolved === 'dark' && !printing
    ? {
        data: '#3987e5',
        grid: '#2c2c2a',
        muted: '#898781',
        tooltipBg: '#1a1a19',
        tooltipText: '#ffffff',
        mapEmpty: '#262b3d',
        mapRamp: ['#184f95', '#1c5cab', '#2a78d6', '#5598e7', '#9ec5f4'],
        mapStroke: '#151b2e',
      }
    : {
        data: '#2a78d6',
        grid: '#e1e0d9',
        muted: '#898781',
        tooltipBg: '#ffffff',
        tooltipText: '#0b0b0b',
        mapEmpty: '#eceef2',
        mapRamp: ['#b7d3f6', '#86b6ef', '#3987e5', '#256abf', '#104281'],
        mapStroke: '#ffffff',
      };
}
