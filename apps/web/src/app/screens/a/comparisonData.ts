import type { CatalogueProduct } from '../../base/domain/contracts.ts';

export type ComparisonValue = { sourceIndex: number; value: string | null };
export type ComparisonRow = {
  id: string; section: string | null; key: string | null; aligned: boolean;
  cells: ComparisonValue[][];
  difference: 'same' | 'different' | 'unknown';
};

/** Exact source section/key only. Duplicate rows and unknown values remain independent evidence. */
export function comparisonRows(products: readonly CatalogueProduct[]): ComparisonRow[] {
  const rows = new Map<string, ComparisonRow>();
  products.forEach((product, column) => {
    product.specs.forEach((spec, sourceIndex) => {
      const aligned = Boolean(spec.section?.trim() && spec.key?.trim());
      const id = aligned ? JSON.stringify([spec.section, spec.key]) : JSON.stringify([product.product_id, sourceIndex, spec.section, spec.key]);
      let row = rows.get(id);
      if (!row) {
        row = { id, section: spec.section, key: spec.key, aligned,
          cells: Array.from({ length: products.length }, () => []), difference: 'unknown' };
        rows.set(id, row);
      }
      row.cells[column]?.push({ sourceIndex, value: spec.value });
    });
  });
  return [...rows.values()].map(row => {
    if (!row.aligned || row.cells.some(cell => !cell.length || cell.some(item => !item.value?.trim()))) return row;
    // Compare literal value sets, without guessing units, quality or equivalence of numeral styles.
    const signatures = row.cells.map(cell => JSON.stringify([...new Set(cell.map(item => item.value))].sort()));
    return { ...row, difference: new Set(signatures).size === 1 ? 'same' : 'different' };
  });
}
