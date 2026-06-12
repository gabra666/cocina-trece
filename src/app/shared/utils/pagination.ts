export interface PaginationState {
  pageIndex: number;
  pageSize: number;
}

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];
export const DEFAULT_PAGINATION: PaginationState = { pageIndex: 0, pageSize: 10 };

export function normalizePagination(state: PaginationState, totalItems: number): PaginationState {
  const pageSize = state.pageSize > 0 ? state.pageSize : DEFAULT_PAGINATION.pageSize;
  const lastPageIndex = Math.max(Math.ceil(totalItems / pageSize) - 1, 0);

  return {
    pageIndex: Math.min(Math.max(state.pageIndex, 0), lastPageIndex),
    pageSize
  };
}

export function paginateRows<T>(rows: T[], state: PaginationState): T[] {
  const pagination = normalizePagination(state, rows.length);
  const start = pagination.pageIndex * pagination.pageSize;

  return rows.slice(start, start + pagination.pageSize);
}
