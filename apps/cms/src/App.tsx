import { Menu } from '@getpoint/shared';
import type { ReactElement } from 'react';
import { Route, Routes } from 'react-router-dom';
import { RedirectIfAuthenticated, RequireAuth, RequireMenu } from './auth/guards';
import { AppLayout } from './layout/AppLayout';
import { allNav } from './navigation';
import { ChangePasswordPage } from './pages/auth/ChangePasswordPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { LoginPage } from './pages/auth/LoginPage';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage';
import { MembersPage } from './pages/members/MembersPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { PointRulesPage } from './pages/point-rules/PointRulesPage';
import { HistoryPage } from './pages/receipts/HistoryPage';
import { ReviewPage } from './pages/receipts/ReviewPage';
import { PlaceholderPage } from './pages/PlaceholderPage';
import { ShopsPage } from './pages/shops/ShopsPage';
import { UsersPage } from './pages/users/UsersPage';

/** Pages built so far; every other menu shows a placeholder naming its session. */
const pages: Partial<Record<Menu, ReactElement>> = {
  [Menu.USERS]: <UsersPage />,
  [Menu.SHOPS]: <ShopsPage />,
  [Menu.MEMBERS]: <MembersPage />,
  [Menu.POINT_RULES]: <PointRulesPage />,
  [Menu.RECEIPT_REVIEW]: <ReviewPage />,
  [Menu.RECEIPT_HISTORY]: <HistoryPage />,
};

export function AppRoutes() {
  return (
    <Routes>
      <Route
        path="/login"
        element={
          <RedirectIfAuthenticated>
            <LoginPage />
          </RedirectIfAuthenticated>
        }
      />
      <Route
        path="/forgot-password"
        element={
          <RedirectIfAuthenticated>
            <ForgotPasswordPage />
          </RedirectIfAuthenticated>
        }
      />
      <Route path="/reset-password" element={<ResetPasswordPage />} />
      <Route
        path="/change-password"
        element={
          <RequireAuth>
            <ChangePasswordPage />
          </RequireAuth>
        }
      />

      <Route
        element={
          <RequireAuth>
            <AppLayout />
          </RequireAuth>
        }
      >
        {allNav.map((item) => (
          <Route
            key={item.path}
            path={item.path}
            element={
              <RequireMenu menu={item.menu}>{pages[item.menu] ?? <PlaceholderPage />}</RequireMenu>
            }
          />
        ))}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
