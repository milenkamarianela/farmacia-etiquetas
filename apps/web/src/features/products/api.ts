import type {
  CategoryDto,
  Paginated,
  PriceChangeDto,
  ProductData,
  ProductDto,
  ProductListQuery,
} from '@etiquetas/shared';
import { api } from '../../lib/api';

function toSearchParams(query: ProductListQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== '') params.set(key, String(value));
  }
  return params.toString();
}

export const productKeys = {
  all: ['products'] as const,
  list: (query: ProductListQuery) => ['products', 'list', query] as const,
  priceChanges: (id: number) => ['products', id, 'price-changes'] as const,
};

export const productsApi = {
  list: (query: ProductListQuery) => api.get<Paginated<ProductDto>>(`/products?${toSearchParams(query)}`),
  ids: (query: ProductListQuery) => api.get<{ ids: number[] }>(`/products/ids?${toSearchParams(query)}`),
  create: (data: ProductData) => api.post<ProductDto>('/products', data),
  update: (id: number, data: ProductData) => api.put<ProductDto>(`/products/${id}`, data),
  setActive: (ids: number[], active: boolean) =>
    api.post<{ updated: number }>('/products/bulk-status', { ids, active }),
  priceChanges: (id: number) => api.get<PriceChangeDto[]>(`/products/${id}/price-changes`),
  categories: () => api.get<CategoryDto[]>('/categories'),
};
