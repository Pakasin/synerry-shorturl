import type { AdminSummary } from '../../api';
import { useFormat } from '../../format';
import { useResource } from '../../hooks';
import { useI18n } from '../../i18n';
import { LoadError, StatStrip } from '../../components/ui';

export function AdminOverview() {
  const { t } = useI18n();
  const fmt = useFormat();
  const { data, error, reload } = useResource<AdminSummary>('/admin/summary');

  return (
    <div className="space-y-6">
      {error && <LoadError message={error} onRetry={reload} />}
      <StatStrip
        items={[
          { label: t('admin.users'), value: fmt.number(data?.users) },
          { label: t('admin.suspendedUsers'), value: fmt.number(data?.suspendedUsers) },
          { label: t('admin.links'), value: fmt.number(data?.links) },
          { label: t('admin.linksLast7Days'), value: fmt.number(data?.linksLast7Days) },
          { label: t('admin.lockedLinks'), value: fmt.number(data?.lockedLinks) },
          { label: t('admin.blockedDomains'), value: fmt.number(data?.blockedDomains) },
          { label: t('admin.totalClicks'), value: fmt.number(data?.totalClicks) },
        ]}
      />
      <p className="max-w-[65ch] text-slate-600">{t('admin.overviewHint')}</p>
    </div>
  );
}
