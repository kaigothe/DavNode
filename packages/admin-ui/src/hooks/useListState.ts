import { useEffect, useMemo, useState } from 'react';

/** How long typing in a search box waits before the list is queried. */
const SEARCH_DELAY_MS = 300;

/** Page, page size and search text of a server-side paged list. */
export interface ListState {
  page: number;
  pageSize: number;
  /** What the user typed. */
  search: string;
  /** The `limit`/`offset`/`q` query parameters for the current state. */
  params: { limit: number; offset: number; q: string | undefined };
  setPage(page: number, pageSize?: number): void;
  setSearch(search: string): void;
}

/**
 * State for a table that pages and searches on the server. Typing waits a
 * moment before it changes `params`, and a new search goes back to page 1.
 */
export function useListState(initialPageSize = 20): ListState {
  const [page, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);
  const [search, setSearchText] = useState('');
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebounced(search.trim());
      setPageNumber(1);
    }, SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [search]);

  return useMemo(
    () => ({
      page,
      pageSize,
      search,
      params: {
        limit: pageSize,
        offset: (page - 1) * pageSize,
        q: debounced === '' ? undefined : debounced,
      },
      setPage: (next, size) => {
        setPageNumber(next);
        if (size !== undefined) {
          setPageSize(size);
        }
      },
      setSearch: setSearchText,
    }),
    [page, pageSize, search, debounced],
  );
}
