import { Navigate, useNavigate } from 'react-router-dom';
import { HomeIcon, RetryIcon } from '../icons';
import { useScanFiles } from '../scanFilesContext';
import { useReady } from '../sessionContext';
import { PillButton, ResultScreen } from '../ui';

/** ส่งใบเสร็จสำเร็จ (mockup image 66). */
export function ScanDonePage() {
  const navigate = useNavigate();
  const { result } = useScanFiles();
  if (!result || !('codes' in result)) return <Navigate to="/scan" replace />;
  return (
    <ResultScreen
      tone="success"
      title="ส่งใบเสร็จสำเร็จ"
      action={
        <PillButton icon={<HomeIcon />} onClick={() => navigate('/')}>
          กลับไปหน้าหลัก
        </PillButton>
      }
    >
      <p className="subtitle">
        ได้รับใบเสร็จ {result.codes.length} ใบ ({result.codes.join(', ')})
        <br />
        เจ้าหน้าที่จะตรวจสอบและเพิ่มแต้มให้ ดูสถานะได้ที่ "คะแนนของฉัน"
      </p>
    </ResultScreen>
  );
}

/** ส่งใบเสร็จไม่สำเร็จ (mockup image 67): the chosen files are kept for "ส่งใหม่". */
export function ScanFailedPage() {
  const navigate = useNavigate();
  const { config } = useReady();
  const { result } = useScanFiles();
  if (!result || !('error' in result)) return <Navigate to="/scan" replace />;
  const support = [
    config.supportContact.phone && `โทร ${config.supportContact.phone}`,
    config.supportContact.lineId && `LINE ${config.supportContact.lineId}`,
  ].filter(Boolean);
  return (
    <ResultScreen
      tone="error"
      title="ส่งใบเสร็จไม่สำเร็จ"
      action={
        <PillButton icon={<RetryIcon />} onClick={() => navigate('/scan')}>
          ส่งใหม่
        </PillButton>
      }
    >
      <p className="subtitle">{result.error}</p>
      <p className="subtitle small">กรุณาลองส่งใบเสร็จอีกครั้ง</p>
      {support.length > 0 && (
        <p className="subtitle small">ติดต่อเจ้าหน้าที่: {support.join(' · ')}</p>
      )}
    </ResultScreen>
  );
}
