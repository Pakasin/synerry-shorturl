import { useState, type KeyboardEvent } from 'react';
import { TagChip } from './ui';
import { useI18n } from '../i18n';

const MAX_TAGS = 10;

export function TagInput({ id, value, onChange }: { id: string; value: string[]; onChange: (tags: string[]) => void }) {
  const { t } = useI18n();
  const [draft, setDraft] = useState('');

  const add = () => {
    const tag = draft.replace(/,/g, '').trim().slice(0, 30);
    setDraft('');
    if (!tag || value.length >= MAX_TAGS) return;
    if (value.some((v) => v.toLowerCase() === tag.toLowerCase())) return;
    onChange([...value, tag]);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add();
    }
    if (e.key === 'Backspace' && !draft && value.length) onChange(value.slice(0, -1));
  };

  return (
    <div className="flex min-h-[42px] w-full flex-wrap items-center gap-1.5 rounded-[10px] border border-slate-300 bg-surface px-2 py-1.5 focus-within:border-navy focus-within:ring-2 focus-within:ring-navy/15">
      {value.map((tag) => (
        <TagChip key={tag} tag={tag} onRemove={() => onChange(value.filter((v) => v !== tag))} />
      ))}
      {value.length < MAX_TAGS && (
        <input
          id={id}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={add}
          placeholder={value.length ? '' : t('tags.placeholder')}
          className="min-w-[6rem] flex-1 bg-transparent px-1 py-0.5 text-sm outline-none"
        />
      )}
    </div>
  );
}
