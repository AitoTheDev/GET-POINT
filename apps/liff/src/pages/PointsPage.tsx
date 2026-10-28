import { formatMoney, formatThaiDateTime } from '@getpoint/shared';
import { useQuery } from '@tanstack/react-query';
import { Navigate } from 'react-router-dom';
import { api, errorText, type MyReceipt } from '../api';
import { useReady } from '../sessionContext';
import { Card, Page, Spinner } from '../ui';

const STATUS: Record<MyReceipt['status'], { label: string; tone: string }> = {
  PENDING_REVIEW: { label: 'รอตรวจสอบ', tone: 'warning' },
  APPROVED: { label: 'อนุมัติแล้ว', tone: 'success' },
  REJECTED: { label: 'ไม่อนุมัติ', tone: 'danger' },
};

/** คะแนนของฉัน: live LOGA points and what happened to each receipt sent. */
export function PointsPage() {
  const { member } = useReady();
  const points = useQuery({
    queryKey: ['points'],
    queryFn: () => api<{ status: 'OK' | 'UNAVAILABLE'; points: number | null }>('/points'),
    enabled: Boolean(member),
  });
  const receipts = useQuery({
    queryKey: ['receipts'],
    queryFn: () => api<MyReceipt[]>('/receipts'),
    enabled: Boolean(member),
  });
  if (!member) return <Navigate to="/register" replace />;

  return (
    <Page title="คะแนนของฉัน" subtitle={`รหัสสมาชิก ${member.code} · ${member.community.name}`}>
      <section className="points-hero" aria-live="polite">
        <span>แต้มสะสม</span>
        {points.isLoading ? (
          <span className="spinner" aria-label="กำลังโหลด" />
        ) : points.data?.status === 'OK' ? (
          <strong>{(points.data.points ?? 0).toLocaleString('en-US')}</strong>
        ) : (
          <small>ดูแต้มไม่ได้ในขณะนี้ กรุณาลองใหม่ภายหลัง</small>
        )}
        <span className="points-unit">แต้ม</span>
      </section>

      <Card title="ใบเสร็จที่ส่งล่าสุด">
        {receipts.isLoading && <Spinner />}
        {receipts.isError && <p className="form-error">{errorText(receipts.error)}</p>}
        {receipts.data?.length === 0 && (
          <p className="hint">ยังไม่มีใบเสร็จ เริ่มสแกนใบเสร็จแรกได้เลย</p>
        )}
        <ul className="receipt-list">
          {receipts.data?.map((r) => (
            <li key={r.code}>
              <div className="receipt-row">
                <span>
                  <strong>{r.code}</strong>
                  <small>{formatThaiDateTime(r.submittedAt)}</small>
                </span>
                <span className={`chip ${STATUS[r.status].tone}`}>{STATUS[r.status].label}</span>
              </div>
              {r.status === 'APPROVED' && (
                <p className="receipt-detail">
                  {[r.shop, r.amount !== null && `${formatMoney(r.amount)} บาท`]
                    .filter(Boolean)
                    .join(' · ')}
                  {r.points !== null && (
                    <>
                      {' · '}
                      <strong>+{r.points} แต้ม</strong>
                      {!r.pointsAdded && ' (กำลังเพิ่มแต้ม)'}
                    </>
                  )}
                </p>
              )}
              {r.rejectMessage && <p className="receipt-detail bad">{r.rejectMessage}</p>}
            </li>
          ))}
        </ul>
      </Card>
    </Page>
  );
}
