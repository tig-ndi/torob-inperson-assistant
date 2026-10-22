import type { AssistantMessage } from '../../../api.ts';
import type { AssistantInput } from '../domain/client.ts';
import { ContractError } from '../domain/validation.ts';
import type { WorkspaceState } from './model.ts';

/** Keep complete user/assistant pairs; never truncate a message or manufacture one. */
export function conversationInput(state: WorkspaceState, message: string): AssistantInput {
  if (!message.trim() || message.length > 1000) throw new ContractError('پیام باید بین ۱ تا ۱۰۰۰ نویسه باشد.');
  const history: AssistantMessage[] = state.history.slice(-4);
  while (history.length && history.reduce((n, m) => n + m.content.length, message.length) > 3000) history.splice(0, 2);
  return { messages: [...history, { role: 'user', content: message }], needState: state.needState, position: state.position,
    ...(state.needState?.max_price_toman !== state.filters.maxPrice ? { budgetOverride: state.filters.maxPrice } : {}),
    ...(state.needState?.offer_sort !== state.filters.sort ? { offerSortOverride: state.filters.sort } : {}) };
}
