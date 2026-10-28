import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { SystemStatus } from './SystemStatus';

const jsonResponse = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status }));

function renderWithFetch(fetchImpl: () => Promise<Response>) {
  vi.stubGlobal('fetch', vi.fn(fetchImpl));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <SystemStatus />
    </QueryClientProvider>,
  );
}

/** Status text shown next to a label ("API" / "ฐานข้อมูล"). */
const statusOf = async (label: string) => {
  const row = (await screen.findByText(label)).closest('tr')!;
  return within(row);
};

afterEach(() => vi.unstubAllGlobals());

describe('SystemStatus', () => {
  it('shows API and database connected', async () => {
    renderWithFetch(() =>
      jsonResponse(200, { status: 'ok', database: 'up', timestamp: '2026-10-10T07:32:00Z' }),
    );
    expect(await (await statusOf('API')).findByText('เชื่อมต่อแล้ว')).toBeInTheDocument();
    expect(await (await statusOf('ฐานข้อมูล')).findByText('เชื่อมต่อแล้ว')).toBeInTheDocument();
    expect(await screen.findByText('10 ต.ค. 2569 14:32')).toBeInTheDocument();
  });

  it('keeps the API connected when only the database is down (HTTP 503)', async () => {
    renderWithFetch(() =>
      jsonResponse(503, { status: 'error', database: 'down', timestamp: '2026-10-10T07:32:00Z' }),
    );
    expect(await (await statusOf('API')).findByText('เชื่อมต่อแล้ว')).toBeInTheDocument();
    expect(await (await statusOf('ฐานข้อมูล')).findByText('เชื่อมต่อไม่ได้')).toBeInTheDocument();
  });

  it('shows both down when the API cannot be reached', async () => {
    renderWithFetch(() => Promise.reject(new TypeError('Failed to fetch')));
    expect(await (await statusOf('API')).findByText('เชื่อมต่อไม่ได้')).toBeInTheDocument();
    expect(await (await statusOf('ฐานข้อมูล')).findByText('เชื่อมต่อไม่ได้')).toBeInTheDocument();
  });
});
