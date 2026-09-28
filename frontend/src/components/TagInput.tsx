// นำเข้า state ของ React
import { useState, type KeyboardEvent } from 'react';
// นำเข้าป้ายแท็ก
import { TagChip } from './ui';
// นำเข้าฟังก์ชันแปล
import { useI18n } from '../i18n';

// จำนวนแท็กสูงสุด (ตรงกับที่ gateway กำหนด)
const MAX_TAGS = 10;

// ช่องกรอกแท็ก: พิมพ์แล้วกด Enter หรือ , เพื่อเพิ่ม กด Backspace ในช่องว่างเพื่อลบตัวสุดท้าย
export function TagInput({ id, value, onChange }: { id: string; value: string[]; onChange: (tags: string[]) => void }) {
  // ฟังก์ชันแปล
  const { t } = useI18n();
  // ข้อความที่กำลังพิมพ์
  const [draft, setDraft] = useState('');

  // เพิ่มแท็กจากข้อความที่พิมพ์
  const add = () => {
    // ตัดช่องว่างและเครื่องหมาย , ที่ติดมา
    const tag = draft.replace(/,/g, '').trim().slice(0, 30);
    // ล้างช่องกรอก
    setDraft('');
    // ไม่มีข้อความ หรือครบจำนวนแล้ว ไม่ต้องเพิ่ม
    if (!tag || value.length >= MAX_TAGS) return;
    // ไม่เพิ่มแท็กซ้ำ (ไม่สนตัวพิมพ์)
    if (value.some((v) => v.toLowerCase() === tag.toLowerCase())) return;
    // เพิ่มต่อท้าย
    onChange([...value, tag]);
  };

  // จัดการปุ่มคีย์บอร์ด
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // Enter หรือ , ให้เพิ่มแท็ก (และไม่ให้ Enter ส่งฟอร์ม)
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add();
    }
    // Backspace ตอนช่องว่าง ให้ลบแท็กตัวสุดท้าย
    if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1));
  };

  return (
    // กรอบเดียวกันทั้งป้ายแท็กและช่องพิมพ์
    <div className="flex min-h-[42px] w-full flex-wrap items-center gap-1.5 rounded-[10px] border border-slate-300 bg-surface px-2 py-1.5 focus-within:border-navy focus-within:ring-2 focus-within:ring-navy/15">
      {/* แท็กที่เพิ่มแล้ว */}
      {value.map((tag) => (
        <TagChip key={tag} tag={tag} onRemove={() => onChange(value.filter((v) => v !== tag))} />
      ))}
      {/* ช่องพิมพ์ ซ่อนเมื่อครบจำนวน */}
      {value.length < MAX_TAGS && (
        <input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          // ออกจากช่องแล้วยังมีข้อความค้าง ให้เพิ่มเป็นแท็กเลย
          onBlur={add}
          placeholder={value.length ? '' : t('tags.placeholder')}
          className="min-w-[6rem] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none"
        />
      )}
    </div>
  );
}
