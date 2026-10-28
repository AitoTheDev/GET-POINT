import { normalizeThaiMobile, THAI_MOBILE_MESSAGE } from '@getpoint/shared';
import { type FormEvent, useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { ApiError, errorText, type MemberView, post } from '../api';
import { ChevronIcon, PhoneIcon } from '../icons';
import { useReady } from '../sessionContext';
import { Card, Page, PillButton, ResultScreen } from '../ui';

interface Form {
  communityId: string;
  phone: string;
  firstName: string;
  lastName: string;
  code: string;
}

/** สมัครสมาชิก (no mockup; same style as the scan page). */
export function RegisterPage() {
  const { config, member, setMember } = useReady();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next') === '/scan' ? '/scan' : '/';
  const [form, setForm] = useState<Form>({
    communityId: config.communities.length === 1 ? config.communities[0].id : '',
    phone: '',
    firstName: '',
    lastName: '',
    code: '',
  });
  const [errors, setErrors] = useState<Partial<Record<keyof Form | 'form', string>>>({});
  const [saving, setSaving] = useState(false);
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);
  const [done, setDone] = useState<{ linkedExisting: boolean } | null>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  if (done) {
    return (
      <ResultScreen
        tone="success"
        title={done.linkedExisting ? 'เชื่อมบัญชีสำเร็จ' : 'สมัครสมาชิกสำเร็จ'}
        action={
          <PillButton onClick={() => navigate('/scan')} trailing={<ChevronIcon />}>
            สแกนใบเสร็จ
          </PillButton>
        }
      >
        <p className="subtitle">
          {done.linkedExisting
            ? 'พบสมาชิกเบอร์นี้ในระบบแล้ว เชื่อมกับบัญชี LINE ของคุณเรียบร้อย'
            : 'เริ่มส่งใบเสร็จเพื่อสะสมแต้มได้เลย'}
        </p>
      </ResultScreen>
    );
  }
  if (member) return <Navigate to={next} replace />;

  const set = (key: keyof Form) => (value: string) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined, form: undefined }));
  };
  const phone = normalizeThaiMobile(form.phone);

  const sendCode = async () => {
    if (!phone) {
      setErrors((e) => ({ ...e, phone: THAI_MOBILE_MESSAGE }));
      return;
    }
    try {
      const res = await post<{ phone: string; resendAfterSeconds: number }>('/phone-code', {
        phone,
      });
      setCodeSentTo(res.phone);
      setResendIn(res.resendAfterSeconds);
    } catch (err) {
      setErrors((e) => ({ ...e, code: errorText(err) }));
    }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const problems: typeof errors = {};
    if (!form.communityId) problems.communityId = 'กรุณาเลือก Community';
    if (!phone) problems.phone = THAI_MOBILE_MESSAGE;
    if (!form.firstName.trim()) problems.firstName = 'กรุณากรอกชื่อ';
    if (config.verifyPhone && !/^\d{6}$/.test(form.code))
      problems.code = 'กรุณากรอกรหัส 6 หลักจาก SMS';
    setErrors(problems);
    if (Object.keys(problems).length) return;

    setSaving(true);
    try {
      const res = await post<{ linkedExisting: boolean; member: MemberView }>('/register', {
        communityId: form.communityId,
        phone,
        firstName: form.firstName,
        lastName: form.lastName || null,
        ...(config.verifyPhone && { code: form.code }),
      });
      setDone({ linkedExisting: res.linkedExisting });
      setMember(res.member);
    } catch (err) {
      const code = err instanceof ApiError ? err.code : undefined;
      if (code?.startsWith('CODE_')) setErrors({ code: errorText(err) });
      else setErrors({ form: errorText(err) });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Page
      title="สมัครสมาชิก"
      subtitle="กรอกข้อมูลเพื่อเริ่มสะสมแต้มจากใบเสร็จ"
      footer={
        <PillButton type="submit" form="register" disabled={saving} trailing={<ChevronIcon />}>
          {saving ? 'กำลังสมัคร…' : 'สมัครสมาชิก'}
        </PillButton>
      }
    >
      <form id="register" onSubmit={submit} noValidate>
        <Card>
          {config.communities.length > 1 && (
            <Field id="reg-community" label="Community" error={errors.communityId}>
              <select
                id="reg-community"
                value={form.communityId}
                onChange={(e) => set('communityId')(e.target.value)}
              >
                <option value="">เลือก Community</option>
                {config.communities.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field
            id="reg-phone"
            label="เบอร์โทรศัพท์"
            error={errors.phone}
            hint="ใช้เบอร์มือถือที่ใช้กับร้านค้า"
          >
            <div className="input-addon">
              <span className="addon">
                <PhoneIcon />
              </span>
              <input
                id="reg-phone"
                type="tel"
                inputMode="numeric"
                autoComplete="tel"
                placeholder="กรอกเบอร์โทร 10 หลัก"
                maxLength={12}
                value={form.phone}
                onChange={(e) => set('phone')(e.target.value)}
              />
            </div>
          </Field>
          {config.verifyPhone && (
            <Field
              id="reg-code"
              label="รหัสยืนยันจาก SMS"
              error={errors.code}
              hint={codeSentTo ? `ส่งรหัสไปที่ ${codeSentTo} แล้ว (ใช้ได้ 5 นาที)` : undefined}
            >
              <div className="input-addon">
                <input
                  id="reg-code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="รหัส 6 หลัก"
                  maxLength={6}
                  value={form.code}
                  onChange={(e) => set('code')(e.target.value.replace(/\D/g, ''))}
                />
                <button
                  type="button"
                  className="addon-btn"
                  disabled={resendIn > 0}
                  onClick={sendCode}
                >
                  {resendIn > 0 ? `ส่งใหม่ (${resendIn})` : codeSentTo ? 'ส่งรหัสใหม่' : 'ส่งรหัส'}
                </button>
              </div>
            </Field>
          )}
          <Field id="reg-first" label="ชื่อ" error={errors.firstName}>
            <input
              id="reg-first"
              autoComplete="given-name"
              maxLength={100}
              value={form.firstName}
              onChange={(e) => set('firstName')(e.target.value)}
            />
          </Field>
          <Field id="reg-last" label="นามสกุล (ไม่บังคับ)">
            <input
              id="reg-last"
              autoComplete="family-name"
              maxLength={100}
              value={form.lastName}
              onChange={(e) => set('lastName')(e.target.value)}
            />
          </Field>
        </Card>
        {errors.form && (
          <p className="form-error" role="alert">
            {errors.form}
          </p>
        )}
        <p className="fine-print">
          ข้อมูลนี้ใช้เพื่อสะสมแต้มกับ GET POINT และร้านค้าที่ร่วมรายการเท่านั้น
        </p>
      </form>
    </Page>
  );
}

function Field({
  id,
  label,
  error,
  hint,
  children,
}: {
  /** id of the input inside, so the label names it. */
  id: string;
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={`field${error ? ' has-error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? (
        <small className="error" role="alert">
          {error}
        </small>
      ) : (
        hint && <small className="hint">{hint}</small>
      )}
    </div>
  );
}
