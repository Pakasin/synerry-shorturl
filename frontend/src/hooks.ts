import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { useErrorText } from './i18n';

const DEBOUNCE_MS = 300;

export function useDebounced(value: string, delay = DEBOUNCE_MS) {
  const [debounced, setDebounced] = useState(value.trim());
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value.trim()), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export function useResource<T>(path: string) {
  const errorText = useErrorText();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    api<T>(path)
      .then((result) => {
        setData(result);
        setError(null);
      })
      .catch((err) => setError(errorText(err)));
  }, [path, errorText]);

  useEffect(reload, [reload]);

  return { data, error, reload };
}
