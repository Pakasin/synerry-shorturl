import { useMemo } from 'react';
import { useI18n, type MessageKey } from './i18n';
import countries from 'i18n-iso-countries';
import enCountries from 'i18n-iso-countries/langs/en.json';
import thCountries from 'i18n-iso-countries/langs/th.json';

countries.registerLocale(enCountries);
countries.registerLocale(thCountries);

export function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null);

export function useFormat() {
  const { lang, locale, t } = useI18n();
  return useMemo(() => {
    const dateTimeFmt = new Intl.DateTimeFormat(locale, {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: 'Asia/Bangkok',
    });
    const shortDateFmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });
    const numberFmt = new Intl.NumberFormat(locale);
    return {
      dateTime: (iso: string | null | undefined) => (iso ? dateTimeFmt.format(new Date(iso)) : '-'),
      shortDate: (ymd: string) => shortDateFmt.format(new Date(`${ymd}T00:00:00Z`)),
      number: (n: number | null | undefined) => (n === null || n === undefined ? '-' : numberFmt.format(n)),
      device: (name: string) => {
        const key = `device.${name}` as MessageKey;
        return ['desktop', 'mobile', 'tablet', 'other', 'Unknown'].includes(name) ? t(key) : name;
      },
      referer: (name: string) => (name === 'Direct' ? t('referer.direct') : name),
      country: (code: string | null) =>
        code && code !== 'Unknown' ? (countries.getName(code, lang) ?? code) : t('map.unknown'),
    };
  }, [lang, locale, t]);
}

export const alpha2ToNumeric = (code: string) => countries.alpha2ToNumeric(code);
