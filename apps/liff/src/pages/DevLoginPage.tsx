import { type FormEvent, useState } from 'react';
import { randomLineUserId, setMockUser } from '../line';
import { useSession } from '../sessionContext';
import { Card, Page, PillButton } from '../ui';

/**
 * Development only (LINE_MODE=mock): stands in for "Log in with LINE". The API refuses mock
 * logins in production, so this screen can never be used there.
 */
export function DevLoginPage() {
  const { signIn } = useSession();
  const [displayName, setDisplayName] = useState('ผู้ทดสอบ');
  const [lineUserId, setLineUserId] = useState(randomLineUserId);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setMockUser({ lineUserId: lineUserId.trim(), displayName: displayName.trim() });
    void signIn();
  };

  return (
    <Page
      title="เข้าสู่ระบบ LINE (จำลอง)"
      subtitle="สำหรับทดสอบเท่านั้น ใช้แทนการเข้าสู่ระบบด้วย LINE จริง"
      back={null}
    >
      <form onSubmit={submit}>
        <Card>
          <div className="field">
            <label htmlFor="dev-name">ชื่อที่แสดงใน LINE</label>
            <input
              id="dev-name"
              value={displayName}
              maxLength={60}
              onChange={(e) => setDisplayName(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="dev-id">LINE User ID</label>
            <input
              id="dev-id"
              value={lineUserId}
              pattern="[A-Za-z0-9_\-]{1,64}"
              required
              onChange={(e) => setLineUserId(e.target.value)}
            />
            <small className="hint">
              ผู้ใช้ใหม่ทุกครั้งที่สุ่ม · ใช้ ID เดิมเพื่อกลับมาเป็นคนเดิม
            </small>
          </div>
          <button
            type="button"
            className="link-btn"
            onClick={() => setLineUserId(randomLineUserId())}
          >
            สุ่ม ID ใหม่
          </button>
        </Card>
        <PillButton type="submit">เข้าสู่ระบบ</PillButton>
      </form>
    </Page>
  );
}
