import { Suspense, type ReactNode } from 'react';
import WorkspaceGate from '../../components/workspace-gate';
import { WorkspaceLoader } from '../../components/workspace-loader';

export default function WorkspaceLayout({ children }: { children: ReactNode }) {
  return <Suspense fallback={<WorkspaceLoader />}><WorkspaceGate>{children}</WorkspaceGate></Suspense>;
}
