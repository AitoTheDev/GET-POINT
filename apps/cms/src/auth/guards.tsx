import type { Menu } from '@getpoint/shared';
import { Button, Flex, Result, Spin } from 'antd';
import type { ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { allNav } from '../navigation';
import { useAuth } from './useAuth';

export function FullPageSpinner() {
  return (
    <Flex align="center" justify="center" style={{ minHeight: '100vh' }}>
      <Spin size="large" />
    </Flex>
  );
}

/** Logged-in users only; users with a temporary password are sent to change it first. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }
  if (user?.mustChangePassword && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />;
  }
  return <>{children}</>;
}

/** Login/forgot-password pages: skip them when already logged in. */
export function RedirectIfAuthenticated({ children }: { children: ReactNode }) {
  const { status } = useAuth();
  if (status === 'loading') return <FullPageSpinner />;
  if (status === 'authenticated') return <Navigate to="/" replace />;
  return <>{children}</>;
}

/** Shown when a page's menu is not granted. The API enforces the same rule. */
export function RequireMenu({ menu, children }: { menu: Menu; children: ReactNode }) {
  const { can } = useAuth();
  const navigate = useNavigate();
  if (can(menu, 'view')) return <>{children}</>;

  const firstAllowed = allNav.find((nav) => can(nav.menu, 'view'));
  return (
    <Result
      status="403"
      title="ไม่มีสิทธิ์เข้าถึงหน้านี้"
      subTitle="กรุณาติดต่อผู้ดูแลระบบหากต้องการสิทธิ์เพิ่มเติม"
      extra={
        firstAllowed && (
          <Button type="primary" onClick={() => navigate(firstAllowed.path)}>
            ไปที่ {firstAllowed.label}
          </Button>
        )
      }
    />
  );
}
