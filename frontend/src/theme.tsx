// นำเข้าฟังก์ชันของ React
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
// นำเข้าตัวบังคับให้ React วาดหน้าใหม่ทันที (ใช้ตอนก่อนพิมพ์)
import { flushSync } from 'react-dom';

// ตัวเลือกธีม: สว่าง มืด หรือตามการตั้งค่าของเครื่อง
export type ThemeChoice = 'light' | 'dark' | 'system';

// ค่าที่ component อื่นอ่านได้
type ThemeValue = {
  // ตัวเลือกที่ผู้ใช้เลือก
  choice: ThemeChoice;
  // ธีมที่ใช้จริงหลังคำนวณ "ตามระบบ" แล้ว
  resolved: 'light' | 'dark';
  // เปลี่ยนตัวเลือก
  setChoice: (c: ThemeChoice) => void;
};

// สร้าง context
const ThemeContext = createContext<ThemeValue | null>(null);

// ชื่อ key ที่ใช้จำธีมใน browser
const STORAGE_KEY = 'synerry.theme';

// อ่านตัวเลือกที่เคยเลือกไว้ ถ้าไม่มีใช้ตามระบบ
function initialChoice(): ThemeChoice {
  try {
    // อ่านจาก localStorage
    const v = localStorage.getItem(STORAGE_KEY);
    // รับเฉพาะค่าที่รู้จัก
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    // อ่านไม่ได้ ใช้ตามระบบ
    return 'system';
  }
}

// ตัวค้นหาการตั้งค่าโหมดมืดของเครื่อง
const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

// ตัวครอบแอป จัดการธีมและใส่ class dark ที่ <html>
export function ThemeProvider({ children }: { children: ReactNode }) {
  // ตัวเลือกของผู้ใช้
  const [choice, setChoiceState] = useState<ThemeChoice>(initialChoice);
  // เครื่องตั้งเป็นโหมดมืดอยู่หรือไม่
  const [systemDark, setSystemDark] = useState(() => darkQuery().matches);

  // ฟังการเปลี่ยนโหมดของเครื่อง (เช่น เปลี่ยนตามเวลากลางคืน)
  useEffect(() => {
    // ตัวค้นหา
    const mq = darkQuery();
    // เมื่อเปลี่ยน ให้อัปเดต state
    const onChange = () => setSystemDark(mq.matches);
    // เริ่มฟัง
    mq.addEventListener('change', onChange);
    // เลิกฟังเมื่อถอด component
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // ธีมที่ใช้จริง
  const resolved = choice === 'system' ? (systemDark ? 'dark' : 'light') : choice;

  // ใส่หรือเอา class dark ออกจาก <html> ตามธีมที่ใช้จริง
  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark');
  }, [resolved]);

  // เปลี่ยนตัวเลือกและจำไว้
  const setChoice = useCallback((c: ThemeChoice) => {
    // เปลี่ยน state
    setChoiceState(c);
    try {
      // จำไว้ใน browser
      localStorage.setItem(STORAGE_KEY, c);
    } catch {
      // จำไม่ได้ก็ไม่เป็นไร
    }
  }, []);

  // สร้างค่าใหม่เฉพาะตอนเปลี่ยน
  const value = useMemo(() => ({ choice, resolved, setChoice }), [choice, resolved, setChoice]);
  // ส่งค่าให้ component ข้างใน
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

// hook สำหรับอ่านธีม
export function useTheme() {
  // อ่าน context
  const ctx = useContext(ThemeContext);
  // ถ้าใช้นอก provider ถือว่าเขียนโค้ดผิด
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  // คืนค่า
  return ctx;
}

// ติดตามว่ากำลังพิมพ์อยู่หรือไม่ ตอนพิมพ์หน้าเว็บเป็นสีสว่างเสมอ (ผ่าน CSS) กราฟที่กำหนดสีด้วย JavaScript จึงต้องเปลี่ยนตามด้วย
function usePrinting() {
  // สถานะกำลังพิมพ์
  const [printing, setPrinting] = useState(() => window.matchMedia('print').matches);
  useEffect(() => {
    // ตัวค้นหาโหมดพิมพ์
    const mq = window.matchMedia('print');
    // เปลี่ยน state แบบทันที (flushSync) เพื่อให้กราฟวาดใหม่เสร็จก่อน browser ถ่ายภาพหน้าไปพิมพ์
    const set = (value: boolean) => flushSync(() => setPrinting(value));
    // ก่อนพิมพ์
    const before = () => set(true);
    // หลังพิมพ์
    const after = () => set(false);
    // โหมดพิมพ์เปลี่ยน (เช่น เครื่องมือทดสอบจำลองการพิมพ์)
    const onChange = () => set(mq.matches);
    // เริ่มฟัง
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    mq.addEventListener('change', onChange);
    // เลิกฟังเมื่อถอด component
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
      mq.removeEventListener('change', onChange);
    };
  }, []);
  // คืนสถานะ
  return printing;
}

// สีของกราฟตามธีม (สีข้อมูลเลือกขั้นให้อ่านชัดบนพื้นแต่ละแบบ) ตอนพิมพ์ใช้ชุดสว่างเสมอ
export function useChartColors() {
  // ธีมที่ใช้จริง
  const { resolved } = useTheme();
  // กำลังพิมพ์อยู่หรือไม่
  const printing = usePrinting();
  // คืนชุดสี
  return resolved === 'dark' && !printing
    ? {
        // สีเส้นข้อมูลบนพื้นมืด
        data: '#3987e5',
        // เส้นตาราง
        grid: '#2c2c2a',
        // ตัวอักษรแกน
        muted: '#898781',
        // พื้นกล่องบอกค่า
        tooltipBg: '#1a1a19',
        // ตัวอักษรในกล่องบอกค่า
        tooltipText: '#ffffff',
        // สีแผนที่: ประเทศที่ไม่มีคลิก
        mapEmpty: '#262b3d',
        // ขั้นสีแผนที่จากน้อยไปมาก (พื้นมืด: มากขึ้น = สว่างขึ้น)
        mapRamp: ['#184f95', '#1c5cab', '#2a78d6', '#5598e7', '#9ec5f4'],
        // เส้นขอบประเทศ
        mapStroke: '#151b2e',
      }
    : {
        data: '#2a78d6',
        grid: '#e1e0d9',
        muted: '#898781',
        tooltipBg: '#ffffff',
        tooltipText: '#0b0b0b',
        mapEmpty: '#eceef2',
        // พื้นสว่าง: มากขึ้น = เข้มขึ้น
        mapRamp: ['#b7d3f6', '#86b6ef', '#3987e5', '#256abf', '#104281'],
        mapStroke: '#ffffff',
      };
}
