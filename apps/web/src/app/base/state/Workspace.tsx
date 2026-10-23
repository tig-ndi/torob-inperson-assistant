import { createContext, useCallback, useContext, useReducer, type Dispatch, type ReactNode } from 'react';
import { initialWorkspace, workspaceReducer, type WorkspaceAction, type WorkspaceState } from './model.ts';
import { useWorkspaceHistory } from './useWorkspaceHistory.ts';

const Workspace = createContext<{ state: WorkspaceState; dispatch: Dispatch<WorkspaceAction> } | null>(null);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, reduce] = useReducer(workspaceReducer, undefined, initialWorkspace);
  const back = useWorkspaceHistory(state, reduce);
  const dispatch: Dispatch<WorkspaceAction> = useCallback(action => {
    if (action.type === 'back' && back()) return;
    reduce(action);
  }, [back]);
  return <Workspace.Provider value={{ state, dispatch }}>{children}</Workspace.Provider>;
}
export function useWorkspace() {
  const workspace = useContext(Workspace);
  if (!workspace) throw new Error('WorkspaceProvider is required');
  return workspace;
}
