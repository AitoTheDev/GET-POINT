import type { ComponentType, ReactNode } from 'react';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { DevLoginPage } from './pages/DevLoginPage';
import { HomePage } from './pages/HomePage';
import { HelpPage, PrivilegesPage } from './pages/InfoPages';
import { PointsPage } from './pages/PointsPage';
import { RegisterPage } from './pages/RegisterPage';
import { ScanPage } from './pages/ScanPage';
import { ScanDonePage, ScanFailedPage } from './pages/ScanResultPages';
import { ScanFilesProvider } from './scanFiles';
import { useSession } from './sessionContext';
import { PillButton, ResultScreen, Spinner } from './ui';
import { RetryIcon } from './icons';

/**
 * Member app. The router starts only after sign-in: in LINE, the LIFF SDK first moves the page
 * to the rich-menu path (e.g. /scan), and the router must read the URL after that.
 */
export function App({
  Router = BrowserRouter,
}: {
  /** Tests pass a MemoryRouter. */
  Router?: ComponentType<{ children: ReactNode }>;
}) {
  const { state } = useSession();
  if (state.status === 'loading') return <Spinner label="กำลังเข้าสู่ระบบ…" />;
  return (
    <Router>
      <Screens />
    </Router>
  );
}

/**
 * Screens. Rich-menu links: /register (สมัครเลย), /scan (สแกนเลย), /privileges,
 * /points (คะแนนของฉัน), /help (วิธีใช้งาน).
 */
function Screens() {
  const { state, signIn } = useSession();

  if (state.status === 'loading') return null;
  if (state.status === 'dev-login') return <DevLoginPage />;
  if (state.status === 'error') {
    return (
      <ResultScreen
        tone="error"
        title="เปิดหน้านี้ไม่สำเร็จ"
        action={
          <PillButton icon={<RetryIcon />} onClick={() => void signIn()}>
            ลองใหม่
          </PillButton>
        }
      >
        <p className="subtitle">{state.message}</p>
      </ResultScreen>
    );
  }

  return (
    <ScanFilesProvider>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/scan" element={<ScanPage />} />
        <Route path="/scan/done" element={<ScanDonePage />} />
        <Route path="/scan/failed" element={<ScanFailedPage />} />
        <Route path="/points" element={<PointsPage />} />
        <Route path="/help" element={<HelpPage />} />
        <Route path="/privileges" element={<PrivilegesPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ScanFilesProvider>
  );
}
