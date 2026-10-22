import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { WorkspaceProvider } from './base/state/Workspace.tsx';
import { WorkspaceShell } from './base/shell/WorkspaceShell.tsx';
import './base/tokens.css';

const root = document.getElementById('root');
if (!root) throw new Error('Missing root element');
createRoot(root).render(<StrictMode><WorkspaceProvider><WorkspaceShell /></WorkspaceProvider></StrictMode>);
