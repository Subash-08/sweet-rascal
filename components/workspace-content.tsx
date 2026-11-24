'use client';

import { createContext, useContext, type ReactNode } from 'react';

export const WorkspaceContentContext = createContext<ReactNode>(null);
export default function WorkspaceContent() {
  return useContext(WorkspaceContentContext);
}
