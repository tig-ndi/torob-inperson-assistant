import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react';
import { initialWorkspace, workspaceReducer, type WorkspaceAction, type WorkspaceState } from './model.ts';

const Workspace = createContext<{ state: WorkspaceState; dispatch: Dispatch<WorkspaceAction> } | null>(null);
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(workspaceReducer, undefined, initialWorkspace);
  return <Workspace.Provider value={{ state, dispatch }}>{children}</Workspace.Provider>;
}
export function useWorkspace() {
  const workspace = useContext(Workspace);
  if (!workspace) throw new Error('WorkspaceProvider is required');
  return workspace;
}
