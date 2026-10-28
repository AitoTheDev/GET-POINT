import { formatThaiMobile } from '@getpoint/shared';
import { type ChangeEvent, useRef, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api, errorText } from '../api';
import {
  AlertIcon,
  CameraIcon,
  CheckIcon,
  ChevronIcon,
  FileIcon,
  FolderIcon,
  InfoIcon,
  PhoneIcon,
  PlusIcon,
  TrashIcon,
  UploadIcon,
} from '../icons';
import { useScanFiles } from '../scanFilesContext';
import { useReady } from '../sessionContext';
import { fileSize } from '../format';
import { Card, Page, PillButton } from '../ui';

const ACCEPT = 'image/jpeg,image/png,application/pdf,.jpg,.jpeg,.png,.pdf';

/** สแกนใบเสร็จ (mockup image 65): each file is one receipt. */
export function ScanPage() {
  const { config, member } = useReady();
  const navigate = useNavigate();
  const { files, add, remove, clear, setResult } = useScanFiles();
  const [sending, setSending] = useState(false);
  const cameraInput = useRef<HTMLInputElement>(null);
  const pickInput = useRef<HTMLInputElement>(null);
  const { maxFiles, maxFileMb } = config.uploadLimits;

  if (!member) return <Navigate to="/register?next=/scan" replace />;
  if (member.status !== 'ACTIVE') {
    return (
      <Page title="สแกนใบเสร็จ">
        <Card>
          <p role="alert" className="form-error">
            บัญชีสมาชิกถูกระงับ ไม่สามารถส่งใบเสร็จได้ กรุณาติดต่อเจ้าหน้าที่
          </p>
        </Card>
      </Page>
    );
  }

  const ready = files.filter((f) => !f.problem);
  const tooMany = files.length > maxFiles;
  const canSend = ready.length > 0 && !tooMany && ready.length === files.length && !sending;

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = ''; // picking the same file again still fires change
    if (!picked.length) return;
    add(picked, maxFileMb);
  };

  const send = async () => {
    setSending(true);
    const form = new FormData();
    for (const f of ready) form.append('files', f.file, f.file.name);
    try {
      const res = await api<{ receipts: { code: string }[] }>('/receipts', {
        method: 'POST',
        body: form,
      });
      clear();
      setResult({ codes: res.receipts.map((r) => r.code) });
      navigate('/scan/done');
    } catch (err) {
      setResult({ error: errorText(err) });
      navigate('/scan/failed');
    } finally {
      setSending(false);
    }
  };

  let summary = `ส่งได้สูงสุด ${maxFiles} ใบ ใบละไม่เกิน ${maxFileMb} MB`;
  if (tooMany) summary = `เลือกได้สูงสุด ${maxFiles} ใบ กรุณาลบออก ${files.length - maxFiles} ใบ`;
  else if (files.length !== ready.length) summary = 'กรุณาลบไฟล์ที่ส่งไม่ได้ก่อน';

  return (
    <Page
      title="สแกนใบเสร็จ"
      subtitle="เพิ่มใบเสร็จ แล้วรับแต้มจากการช้อป"
      footer={
        <>
          <PillButton onClick={send} disabled={!canSend} trailing={<ChevronIcon />}>
            {sending ? 'กำลังส่ง…' : 'ส่งใบเสร็จสะสมแต้ม'}
          </PillButton>
          <p className="footer-note">รับแต้มหลังตรวจสอบใบเสร็จ</p>
        </>
      }
    >
      <Card title="เบอร์โทรศัพท์">
        <div className="input-addon readonly">
          <span className="addon">
            <PhoneIcon />
          </span>
          <input value={formatThaiMobile(member.phone)} readOnly aria-label="เบอร์โทรศัพท์" />
        </div>
        <small className="hint">ใช้เบอร์เดียวกันที่สมัครสมาชิก</small>
      </Card>

      <Card title="เพิ่มใบเสร็จ">
        <button type="button" className="dropzone" onClick={() => pickInput.current?.click()}>
          <span className="dropzone-icon">
            <UploadIcon />
          </span>
          <span>
            <strong>เลือกหลายใบพร้อมกัน</strong>
            <small>รองรับไฟล์ JPG, PNG และ PDF</small>
          </span>
        </button>
        <div className="two-buttons">
          <button
            type="button"
            className="outline-btn"
            onClick={() => cameraInput.current?.click()}
          >
            <CameraIcon /> ถ่ายภาพ
          </button>
          <button type="button" className="outline-btn" onClick={() => pickInput.current?.click()}>
            <FolderIcon /> เลือกจากมือถือ
          </button>
        </div>
        <input
          ref={cameraInput}
          type="file"
          accept="image/*"
          capture="environment"
          hidden
          data-testid="camera-input"
          onChange={onPick}
        />
        <input
          ref={pickInput}
          type="file"
          accept={ACCEPT}
          multiple
          hidden
          data-testid="file-input"
          onChange={onPick}
        />
      </Card>

      {files.length > 0 && (
        <Card
          title={
            <>
              ใบเสร็จที่เลือก <span className="count">{files.length} ใบ</span>
            </>
          }
        >
          <ul className="file-list">
            {files.map((f, i) => (
              <li key={f.id} className={f.problem ? 'bad' : undefined}>
                <span className="thumb">{f.url ? <img src={f.url} alt="" /> : <FileIcon />}</span>
                <span className="file-name">
                  <strong>ใบเสร็จ {String(i + 1).padStart(2, '0')}</strong>
                  <small>{fileSize(f.file.size)}</small>
                </span>
                {f.problem ? (
                  <span className="file-status bad">
                    <AlertIcon /> {f.problem}
                  </span>
                ) : (
                  <span className="file-status ok">
                    <span className="ok-dot">
                      <CheckIcon />
                    </span>
                    พร้อมส่ง
                  </span>
                )}
                <button
                  type="button"
                  className="icon-btn trash"
                  aria-label={`ลบใบเสร็จ ${i + 1}`}
                  onClick={() => remove(f.id)}
                >
                  <TrashIcon />
                </button>
              </li>
            ))}
          </ul>
          {files.length < maxFiles && (
            <button type="button" className="add-more" onClick={() => pickInput.current?.click()}>
              <PlusIcon /> เพิ่มใบเสร็จ
            </button>
          )}
        </Card>
      )}

      <p className={`tip${tooMany || files.length !== ready.length ? ' warn' : ''}`}>
        <InfoIcon /> {files.length ? summary : 'ให้เห็นชื่อร้านค้า และยอดชำระชัดเจน'}
      </p>
    </Page>
  );
}
