import {
  memberRejectMessage,
  REJECT_REASONS,
  type RejectReason,
  RejectReasonLabel,
} from './receipts';

/** How one reject reason is shown (editable on the Settings page). */
export interface RejectReasonSetting {
  /** What staff see when choosing. */
  label: string;
  /** What the member sees in LINE. */
  memberMessage: string;
  /** Hidden from the list when off (OTHER is always on). */
  enabled: boolean;
  sortOrder: number;
}

/** Everything on the Settings page that is stored in the database. */
export interface SettingsValues {
  /** Automatic resend of points that failed to reach LOGA. */
  transferRetry: { maxAttempts: number; intervalMinutes: number };
  /** Text the member sees in LOGA; {code} = receipt code, {shop} = shop name. */
  transferRemark: string;
  /** Can be lowered, never above 10 MB / 10 files. */
  uploadLimits: { maxFileMb: number; maxFiles: number };
  /** Pre-filled "send within N days" for new point rules; null = no limit. */
  defaultClaimDays: number | null;
  /** Shown to members who need help (LINE flow). */
  supportContact: { phone: string | null; lineId: string | null };
  rejectReasons: Record<RejectReason, RejectReasonSetting>;
}

export type SettingKey = keyof SettingsValues;
export const SETTING_KEYS: SettingKey[] = [
  'transferRetry',
  'transferRemark',
  'uploadLimits',
  'defaultClaimDays',
  'supportContact',
  'rejectReasons',
];

/** Hard limits the settings can't exceed. */
export const UPLOAD_LIMIT_CAPS = { maxFileMb: 10, maxFiles: 10 };
export const RETRY_LIMIT_CAPS = { maxAttempts: 20, intervalMinutes: 1440 };

export const DEFAULT_REMARK = 'สะสมแต้มจากใบเสร็จ {code} · {shop}';

export const DEFAULT_SETTINGS: SettingsValues = {
  transferRetry: { maxAttempts: 5, intervalMinutes: 5 },
  transferRemark: DEFAULT_REMARK,
  uploadLimits: { ...UPLOAD_LIMIT_CAPS },
  defaultClaimDays: 30,
  supportContact: { phone: null, lineId: null },
  rejectReasons: Object.fromEntries(
    REJECT_REASONS.map((reason, i) => [
      reason,
      {
        label: RejectReasonLabel[reason],
        memberMessage: memberRejectMessage(reason),
        enabled: true,
        sortOrder: i + 1,
      },
    ]),
  ) as Record<RejectReason, RejectReasonSetting>,
};

/** Remark text for one receipt, e.g. "สะสมแต้มจากใบเสร็จ GP001 · ร้านกาแฟ A" (max 200 chars). */
export function renderRemark(template: string, values: { code: string; shop: string }): string {
  return template
    .replaceAll('{code}', values.code)
    .replaceAll('{shop}', values.shop)
    .trim()
    .slice(0, 200);
}

/** Enabled reasons in their display order (OTHER always included, last if not ordered). */
export function orderedRejectReasons(
  reasons: Record<RejectReason, RejectReasonSetting>,
): (RejectReasonSetting & { reason: RejectReason })[] {
  return REJECT_REASONS.map((reason) => ({ reason, ...reasons[reason] }))
    .filter((r) => r.enabled || r.reason === 'OTHER')
    .sort((a, b) => a.sortOrder - b.sortOrder);
}
