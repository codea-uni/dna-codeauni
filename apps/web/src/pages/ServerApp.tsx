import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AuthGate } from '../auth/AuthGate';
import { useWorkspace } from '../server/api';
import { AdminPage } from './AdminPage';
import { HomePage } from './HomePage';
import { MinePage } from './MinePage';
import { ProjectEditor } from './ProjectEditor';

/**
 * App en modo servidor (D-14): login, luego empresa y minas, y el editor. En modo local se monta
 * `App` directamente, sin router ni login.
 */
export function ServerApp() {
  return (
    <BrowserRouter>
      <AuthGate>
        <WorkspaceLoader />
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/mines/:mineId" element={<MinePage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/projects/:projectId" element={<ProjectEditor />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthGate>
    </BrowserRouter>
  );
}

/** Carga las empresas del usuario al entrar. */
function WorkspaceLoader() {
  const load = useWorkspace((s) => s.loadOrganizations);
  useEffect(() => {
    void load();
  }, [load]);
  return null;
}
