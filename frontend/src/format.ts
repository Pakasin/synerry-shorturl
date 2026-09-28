// นำเข้า hook ของ React สำหรับจำค่าที่คำนวณแล้ว
import { useMemo } from 'react';
// นำเข้าภาษาปัจจุบัน
import { useI18n, type MessageKey } from './i18n';
// นำเข้าชื่อประเทศหลายภาษา และตัวแปลงรหัสประเทศ
import countries from 'i18n-iso-countries';
// นำเข้าชื่อประเทศภาษาอังกฤษ
import enCountries from 'i18n-iso-countries/langs/en.json';
// นำเข้าชื่อประเทศภาษาไทย
import thCountries from 'i18n-iso-countries/langs/th.json';

// ลงทะเบียนชื่อประเทศทั้งสองภาษา
countries.registerLocale(enCountries);
countries.registerLocale(thCountries);

// แปลงวันเวลาเป็นค่าที่ช่อง datetime-local ใช้ได้ (เวลาท้องถิ่นของเครื่อง)
export function toLocalInput(iso: string | null): string {
  // ไม่มีค่าให้เป็นช่องว่าง
  if (!iso) return '';
  // สร้าง Date
  const d = new Date(iso);
  // ชดเชยเขตเวลาของเครื่อง แล้วตัดให้เหลือ YYYY-MM-DDTHH:mm
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

// แปลงค่าจากช่อง datetime-local เป็น ISO ที่ส่งให้ API ได้ ค่าว่างให้เป็น null
export const fromLocalInput = (value: string) => (value ? new Date(value).toISOString() : null);

// ตัวจัดรูปแบบวันที่ ตัวเลข และชื่อต่างๆ ตามภาษาปัจจุบัน
export function useFormat() {
  // ภาษา locale และฟังก์ชันแปล
  const { lang, locale, t } = useI18n();
  // สร้างตัวจัดรูปแบบใหม่เฉพาะตอนเปลี่ยนภาษา
  return useMemo(() => {
    // วันเวลาแบบเต็ม ตามเวลาไทย
    const dateTimeFmt = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Bangkok' });
    // วันที่สั้น สำหรับแกนกราฟ (ค่าเป็นวันตามปฏิทินอยู่แล้ว จึงใช้ UTC ไม่ให้เลื่อนวัน)
    const shortDateFmt = new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });
    // ตัวเลขมีคอมมา
    const numberFmt = new Intl.NumberFormat(locale);
    return {
      // วันเวลา ถ้าไม่มีค่าแสดง -
      dateTime: (iso: string | null | undefined) => (iso ? dateTimeFmt.format(new Date(iso)) : '-'),
      // วันที่สั้นจากรูปแบบ YYYY-MM-DD
      shortDate: (ymd: string) => shortDateFmt.format(new Date(`${ymd}T00:00:00Z`)),
      // ตัวเลข ถ้าเป็น null แสดง -
      number: (n: number | null | undefined) => (n === null || n === undefined ? '-' : numberFmt.format(n)),
      // ชื่อประเภทอุปกรณ์
      device: (name: string) => {
        // key ของข้อความ
        const key = `device.${name}` as MessageKey;
        // ถ้ามีคำแปลใช้คำแปล ไม่งั้นใช้ชื่อเดิม
        return ['desktop', 'mobile', 'tablet', 'other', 'Unknown'].includes(name) ? t(key) : name;
      },
      // ชื่อแหล่งที่มา Direct = เปิดตรงหรือสแกน QR
      referer: (name: string) => (name === 'Direct' ? t('referer.direct') : name),
      // ชื่อประเทศจากรหัส 2 ตัว
      country: (code: string | null) => (code && code !== 'Unknown' ? (countries.getName(code, lang) ?? code) : t('map.unknown')),
    };
  }, [lang, locale, t]);
}

// แปลงรหัสประเทศ 2 ตัว (TH) เป็นรหัสตัวเลข ISO (764) ที่ใช้ในไฟล์แผนที่โลก
export const alpha2ToNumeric = (code: string) => countries.alpha2ToNumeric(code);
