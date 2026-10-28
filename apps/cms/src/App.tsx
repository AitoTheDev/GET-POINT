import { Route, Routes } from 'react-router-dom';
import { AppLayout } from './layout/AppLayout';
import { mainNav, settingsNav } from './navigation';
import { NotFoundPage } from './pages/NotFoundPage';
import { PlaceholderPage } from './pages/PlaceholderPage';

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        {[...mainNav, settingsNav].map((item) => (
          <Route key={item.path} path={item.path} element={<PlaceholderPage />} />
        ))}
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
