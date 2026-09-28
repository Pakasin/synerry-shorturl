import { useEffect, useState } from 'react';
import type { Paged } from '../../api';
import { useDebounced, useResource } from '../../hooks';

export const ADMIN_PAGE_SIZE = 20;

export function usePagedList<T>(endpoint: string, filters: Record<string, string> = {}) {
  const [search, setSearch] = useState('');
  const q = useDebounced(search);
  const [page, setPage] = useState(1);
  const filterKey = JSON.stringify(filters);

  useEffect(() => setPage(1), [q, filterKey]);

  const params = new URLSearchParams({ page: String(page), pageSize: String(ADMIN_PAGE_SIZE), ...filters });
  if (q) params.set('q', q);
  const resource = useResource<Paged<T>>(`${endpoint}?${params}`);

  return { ...resource, search, setSearch, page, setPage };
}
