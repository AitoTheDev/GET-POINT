import { useNavigate } from 'react-router-dom';
import { ChevronIcon, GiftIcon } from '../icons';
import { useReady } from '../sessionContext';
import { Card, Page, PillButton } from '../ui';

/** วิธีใช้งาน */
export function HelpPage() {
  const { config } = useReady();
  const navigate = useNavigate();
  const { phone, lineId } = config.supportContact;
  return (
    <Page
      title="วิธีใช้งาน"
      subtitle="สะสมแต้มง่าย ๆ ใน 3 ขั้นตอน"
      footer={
        <PillButton onClick={() => navigate('/scan')} trailing={<ChevronIcon />}>
          เริ่มสแกนใบเสร็จ
        </PillButton>
      }
    >
      <Card>
        <ol className="how-to">
          <li>
            <strong>สมัครสมาชิก</strong>
            <span>กรอกเบอร์มือถือและชื่อ ครั้งเดียวใช้ได้ตลอด</span>
          </li>
          <li>
            <strong>สแกนใบเสร็จ</strong>
            <span>
              ถ่ายภาพหรือเลือกไฟล์ใบเสร็จ (JPG, PNG, PDF) ได้ครั้งละไม่เกิน{' '}
              {config.uploadLimits.maxFiles} ใบ ให้เห็นชื่อร้าน วันที่ และยอดชำระชัดเจน
            </span>
          </li>
          <li>
            <strong>รับแต้ม</strong>
            <span>เจ้าหน้าที่ตรวจสอบใบเสร็จ แล้วเพิ่มแต้มให้ ดูผลได้ที่ "คะแนนของฉัน"</span>
          </li>
        </ol>
      </Card>
      {(phone || lineId) && (
        <Card title="ติดต่อเจ้าหน้าที่">
          {phone && (
            <p>
              โทร <a href={`tel:${phone.replace(/[^\d]/g, '')}`}>{phone}</a>
            </p>
          )}
          {lineId && <p>LINE {lineId}</p>}
        </Card>
      )}
    </Page>
  );
}

/** สิทธิพิเศษ: not designed yet (no mockup or rules) — a friendly placeholder. */
export function PrivilegesPage() {
  return (
    <Page title="สิทธิพิเศษ">
      <Card>
        <div className="coming-soon">
          <GiftIcon />
          <strong>เร็ว ๆ นี้</strong>
          <span>สิทธิพิเศษสำหรับสมาชิก GET POINT กำลังจะมา ติดตามได้ที่นี่</span>
        </div>
      </Card>
    </Page>
  );
}
