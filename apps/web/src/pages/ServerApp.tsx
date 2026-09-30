import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router';
import { AuthGate } from '../auth/AuthGate';
import { useAuth, useWorkspace } from '../server/api';
import { AdminPage } from './AdminPage';
import { HomePage } from './HomePage';
import { MineHistoryPage } from './MineHistoryPage';
import { MinePage } from './MinePage';
import { PlatformPage } from './PlatformPage';
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
          <Route path="/mines/:mineId/history" element={<MineHistoryPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/platform" element={<PlatformPage />} />
          <Route path="/projects/:projectId" element={<ProjectEditor />} />
          <Route path="/projects/:projectId/versions/:number" element={<ProjectEditor />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthGate>
    </BrowserRouter>
  );
}

/** La empresa de la sesión pasa al espacio de trabajo (y con ella, sus minas). */
function WorkspaceLoader() {
  const organization = useAuth((s) => s.organization);
  const setOrganization = useWorkspace((s) => s.setOrganization);
  useEffect(() => {
    void setOrganization(organization);
  }, [organization, setOrganization]);
  return null;
}
