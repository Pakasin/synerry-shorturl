const fieldCls =
  'w-full rounded-[10px] border border-slate-300 bg-surface px-3 outline-none focus:border-navy focus:ring-2 focus:ring-navy/15';

export const inputCls = `${fieldCls} py-2.5`;

export const compactInputCls = `${fieldCls} py-2`;

const buttonVariants = {
  primary: 'rounded-[10px] bg-brand font-semibold text-white hover:bg-brand-dark',
  dark: 'rounded-[10px] bg-navy font-semibold text-surface hover:opacity-90',
  outline: 'rounded-[10px] border border-line font-medium hover:bg-mist',
  danger: 'rounded-[10px] border border-brand/40 font-medium text-brand hover:bg-red-50',
  ghost: 'rounded-md font-medium hover:bg-mist',
  ghostDanger: 'rounded-md font-medium text-brand hover:bg-red-50',
};

const buttonSizes = {
  row: 'px-2 py-1.5 text-sm',
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5',
  xl: 'h-14 px-8 text-lg',
};

export type ButtonVariant = keyof typeof buttonVariants;
export type ButtonSize = keyof typeof buttonSizes;

export function buttonCls(variant: ButtonVariant = 'outline', size: ButtonSize = 'sm', extra = '') {
  return `${buttonVariants[variant]} ${buttonSizes[size]} disabled:opacity-50 ${extra}`.trim();
}

export const chipCls = (active: boolean) =>
  `rounded-full px-3 py-1 text-sm font-medium ring-1 ${active ? 'bg-navy text-surface ring-navy' : 'bg-surface text-slate-600 ring-line hover:bg-mist'}`;
