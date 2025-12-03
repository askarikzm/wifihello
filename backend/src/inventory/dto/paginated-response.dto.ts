export interface PaginationMeta {
  total: number;
  totalPages: number;
  page: number;
  limit: number;
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: PaginationMeta;
}
