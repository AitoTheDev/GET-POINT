import '@fontsource/noto-sans-thai-looped/400.css';
import '@fontsource/noto-sans-thai-looped/600.css';
import '@fontsource/noto-sans-thai-looped/700.css';
import '@fontsource/noto-sans-thai-looped/800.css';
import './styles.css';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { App as AntApp, ConfigProvider } from 'antd';
import thTH from 'antd/locale/th_TH';
import dayjs from 'dayjs';
import 'dayjs/locale/th';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ApiRequestError } from './api/client';
import { AppRoutes } from './App';
import { AuthProvider } from './auth/AuthProvider';
import { theme } from './theme';

dayjs.locale('th');

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // A 4xx (no permission, not found, bad filter) won't change on retry; try a network or
      // server error once more, then report it.
      retry: (failures, err) =>
        failures < 1 && !(err instanceof ApiRequestError && err.status >= 400 && err.status < 500),
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ConfigProvider theme={theme} locale={thTH}>
      <AntApp>
        <QueryClientProvider client={queryClient}>
          <BrowserRouter>
            <AuthProvider>
              <AppRoutes />
            </AuthProvider>
          </BrowserRouter>
        </QueryClientProvider>
      </AntApp>
    </ConfigProvider>
  </StrictMode>,
);
