import { useEffect, useRef } from 'react';
import { searchCatalogue } from '../../base/domain/client.ts';
import type { CataloguePage } from '../../base/domain/contracts.ts';
import { useCommand } from '../../base/state/hooks.ts';
import { appendProductPage, catalogueSearchForWorkspace, catalogueSearchKey } from '../../base/state/model.ts';
import { useWorkspace } from '../../base/state/Workspace.tsx';
import { nextProductSearch } from './pagination.ts';

export function useProductPages() {
  const { state, dispatch } = useWorkspace();
  const command = useCommand<CataloguePage>();
  const current = useRef(state);
  current.current = state;
  const busy = useRef<string | null>(null);

  useEffect(() => { busy.current = null; command.cancel(); }, [state.revision, state.productResults, command.cancel]);

  const more = async () => {
    const before = current.current;
    const base = before.productResults;
    if (busy.current || !base?.page.has_more ||
      catalogueSearchKey(base.search) !== catalogueSearchKey(catalogueSearchForWorkspace(before))) return;
    const token = crypto.randomUUID();
    busy.current = token;
    dispatch({ type: 'beginProductResults', token });
    try {
      const page = await command.run(async signal => {
        const next = await searchCatalogue(nextProductSearch(base), signal);
        appendProductPage(base, next); // Validate cross-page provenance before reaching the reducer.
        return next;
      });
      if (!page || current.current.revision !== before.revision || current.current.productResults !== base ||
        current.current.productResultsRequest !== token) return;
      dispatch({ type: 'moreProducts', base, page, expectedRevision: before.revision, expectedResultsRequest: token });
    } finally { if (busy.current === token) busy.current = null; }
  };
  return { ...command, more };
}
