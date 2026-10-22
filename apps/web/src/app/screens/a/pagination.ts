import type { CatalogueSearch, ProductResults } from '../../base/domain/contracts.ts';

export function nextProductSearch(results: ProductResults): CatalogueSearch {
  return { ...results.search, offset: results.page.offset + results.page.limit, limit: results.page.limit,
    categoryName: results.search.categoryCleared ? null : results.page.category_name };
}

export function productHeadingId(productId: string): string {
  return `ua-product-${encodeURIComponent(productId)}`;
}
