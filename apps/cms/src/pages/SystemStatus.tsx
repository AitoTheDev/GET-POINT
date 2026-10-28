import { formatThaiDateTime } from '@getpoint/shared';
import { useQuery } from '@tanstack/react-query';
import { Card, Descriptions } from 'antd';
import { apiFetch, ApiRequestError } from '../api/client';
import { StatusPill } from '../components/StatusPill';

interface Health {
  status: 'ok' | 'error';
  database: 'up' | 'down';
  timestamp: string;
}

function ConnectionStatus({ ok, loading }: { ok: boolean; loading?: boolean }) {
  if (loading) return <StatusPill tone="loading">กำลังตรวจสอบ</StatusPill>;
  return ok ? (
    <StatusPill tone="success">เชื่อมต่อแล้ว</StatusPill>
  ) : (
    <StatusPill tone="danger">เชื่อมต่อไม่ได้</StatusPill>
  );
}

/** Session 0 check that CMS → API → PostgreSQL is wired up. */
export function SystemStatus() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: async () => {
      try {
        return await apiFetch<Health>('/health');
      } catch (err) {
        // A 503 from /health means the API is up but the database is not; it still carries the health body.
        if (err instanceof ApiRequestError && err.status === 503 && err.body) {
          return err.body as Health;
        }
        throw err;
      }
    },
    refetchInterval: 10_000,
    retry: false,
  });

  const apiUp = health.isSuccess;
  const dbUp = health.data?.database === 'up';

  return (
    <Card title="สถานะระบบ" style={{ marginBottom: 24 }}>
      <Descriptions column={1}>
        <Descriptions.Item label="API">
          <ConnectionStatus ok={apiUp} loading={health.isLoading} />
        </Descriptions.Item>
        <Descriptions.Item label="ฐานข้อมูล">
          <ConnectionStatus ok={dbUp} loading={health.isLoading} />
        </Descriptions.Item>
        <Descriptions.Item label="ตรวจสอบล่าสุด">
          {health.data ? formatThaiDateTime(health.data.timestamp) : '-'}
        </Descriptions.Item>
      </Descriptions>
    </Card>
  );
}
