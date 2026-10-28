import {
  CheckCircleOutlined,
  EditOutlined,
  LinkOutlined,
  ReloadOutlined,
  StopOutlined,
} from '@ant-design/icons';
import {
  formatThaiDate,
  formatThaiDateTime,
  formatThaiMobile,
  LogaLinkStatusLabel,
  MemberChannelLabel,
  Menu,
  memberFullName,
} from '@getpoint/shared';
import {
  Alert,
  App,
  Button,
  Card,
  Descriptions,
  Drawer,
  Flex,
  Popconfirm,
  Skeleton,
  Typography,
} from 'antd';
import { useState } from 'react';
import { errorMessage } from '../../api/client';
import {
  type Member,
  useLinkMember,
  useMember,
  useMemberCommunities,
  useMemberLoga,
  useUpdateMember,
} from '../../api/members';
import { useAuth } from '../../auth/useAuth';
import { StatusPill } from '../../components/StatusPill';
import { colors } from '../../theme';
import { MemberModal } from './MemberModal';
import { MemberAvatar, MemberStatusPill } from './memberDisplay';

interface MemberDrawerProps {
  memberId: string;
  onClose: () => void;
}

/** Member detail ("ดูรายละเอียด"): profile, live LOGA data and staff actions. */
export function MemberDrawer({ memberId, onClose }: MemberDrawerProps) {
  const { can } = useAuth();
  const { message } = App.useApp();
  const canManage = can(Menu.MEMBERS, 'manage');
  const member = useMember(memberId);
  const communities = useMemberCommunities();
  const update = useUpdateMember();
  const [editing, setEditing] = useState(false);
  const m = member.data;

  const setStatus = async (status: Member['status']) => {
    try {
      await update.mutateAsync({ id: memberId, status });
      message.success(status === 'SUSPENDED' ? 'ระงับสมาชิกแล้ว' : 'เปิดใช้งานสมาชิกแล้ว');
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  return (
    <Drawer
      open
      width="min(560px, 100vw)"
      onClose={onClose}
      title={m ? `สมาชิก ${m.code}` : 'สมาชิก'}
      extra={
        m &&
        canManage && (
          <Flex gap={8}>
            <Button icon={<EditOutlined />} onClick={() => setEditing(true)}>
              แก้ไข
            </Button>
            {m.status === 'ACTIVE' ? (
              <Popconfirm
                title="ระงับสมาชิกนี้?"
                description="สมาชิกที่ถูกระงับจะส่งใบเสร็จสะสมแต้มไม่ได้"
                okText="ระงับ"
                cancelText="ยกเลิก"
                okButtonProps={{ danger: true }}
                onConfirm={() => setStatus('SUSPENDED')}
              >
                <Button danger icon={<StopOutlined />} loading={update.isPending}>
                  ระงับ
                </Button>
              </Popconfirm>
            ) : (
              <Button
                icon={<CheckCircleOutlined />}
                loading={update.isPending}
                onClick={() => setStatus('ACTIVE')}
              >
                เปิดใช้งาน
              </Button>
            )}
          </Flex>
        )
      }
    >
      {member.isError && <Alert type="error" showIcon message={errorMessage(member.error)} />}
      {member.isLoading && <Skeleton active avatar paragraph={{ rows: 6 }} />}
      {m && (
        <Flex vertical gap={20}>
          <Flex gap={16} align="center">
            <MemberAvatar name={m.firstName} size={64} />
            <div style={{ flex: 1 }}>
              <Typography.Title level={3} style={{ margin: 0 }}>
                {memberFullName(m)}
              </Typography.Title>
              <Typography.Text type="secondary">
                {m.code} · {m.community.name}
              </Typography.Text>
            </div>
            <MemberStatusPill status={m.status} />
          </Flex>

          <LogaCard member={m} canManage={canManage} />

          <Descriptions
            column={1}
            bordered
            size="middle"
            styles={{ label: { width: 170 } }}
            items={[
              { label: 'เบอร์โทรศัพท์', children: formatThaiMobile(m.phone) },
              { label: 'Community', children: m.community.name },
              { label: 'ช่องทางสมัคร', children: MemberChannelLabel[m.channel] },
              { label: 'LINE', children: m.lineLinked ? 'เชื่อมแล้ว' : 'ยังไม่เชื่อม' },
              { label: 'วันที่สมัคร', children: formatThaiDateTime(m.createdAt) },
              { label: 'เพิ่มโดย', children: m.createdBy?.name ?? '-' },
              { label: 'ใบเสร็จ', children: `${m.receiptCount} ใบ` },
              {
                label: 'หมายเหตุ',
                children: <span style={{ whiteSpace: 'pre-wrap' }}>{m.note ?? '-'}</span>,
              },
            ]}
          />
        </Flex>
      )}

      {editing && m && (
        <MemberModal
          open
          member={m}
          communities={communities.data ?? []}
          onClose={() => setEditing(false)}
          onSaved={() => setEditing(false)}
        />
      )}
    </Drawer>
  );
}

/** LOGA's date format isn't documented: show it as-is if it isn't a date we can read. */
function thaiDateOrRaw(value: string) {
  const formatted = formatThaiDate(value);
  return formatted === 'Invalid Date' ? value : formatted;
}

/** Live data from LOGA, or the link status with a retry button. */
function LogaCard({ member, canManage }: { member: Member; canManage: boolean }) {
  const { message } = App.useApp();
  const linked = member.logaLinkStatus === 'LINKED';
  const loga = useMemberLoga(member.id, linked);
  const link = useLinkMember();

  const retry = async () => {
    try {
      const saved = await link.mutateAsync(member.id);
      if (saved.logaLinkStatus === 'LINKED') message.success('เชื่อม LOGA เรียบร้อยแล้ว');
      else message.error(saved.logaLinkError ?? 'เชื่อม LOGA ไม่สำเร็จ');
    } catch (err) {
      message.error(errorMessage(err));
    }
  };

  const title = (
    <Flex justify="space-between" align="center" gap={8}>
      <span>ข้อมูลจาก LOGA</span>
      <StatusPill
        tone={linked ? 'success' : member.logaLinkStatus === 'ERROR' ? 'danger' : 'neutral'}
      >
        {LogaLinkStatusLabel[member.logaLinkStatus]}
      </StatusPill>
    </Flex>
  );

  if (!linked) {
    return (
      <Card title={title} size="small">
        <Alert
          type={member.logaLinkStatus === 'ERROR' ? 'error' : 'info'}
          showIcon
          message={
            member.logaLinkStatus === 'ERROR'
              ? (member.logaLinkError ?? 'เชื่อม LOGA ไม่สำเร็จ')
              : 'สมาชิกนี้ยังไม่ได้เชื่อมกับ LOGA จึงยังไม่มีแต้ม'
          }
          description={
            member.logaCheckedAt && `ลองเชื่อมล่าสุด ${formatThaiDateTime(member.logaCheckedAt)}`
          }
          action={
            canManage && (
              <Button icon={<LinkOutlined />} loading={link.isPending} onClick={retry}>
                {member.logaLinkStatus === 'ERROR' ? 'ลองอีกครั้ง' : 'เชื่อม LOGA'}
              </Button>
            )
          }
        />
      </Card>
    );
  }

  const customer = loga.data?.customer;
  return (
    <Card
      title={title}
      size="small"
      extra={
        <Button
          type="text"
          size="small"
          icon={<ReloadOutlined />}
          aria-label="โหลดข้อมูล LOGA ใหม่"
          loading={loga.isFetching}
          onClick={() => loga.refetch()}
        />
      }
    >
      {loga.isLoading && <Skeleton active paragraph={{ rows: 2 }} />}
      {loga.isError && <Alert type="warning" showIcon message={errorMessage(loga.error)} />}
      {loga.data?.status === 'UNAVAILABLE' && (
        <Alert
          type="warning"
          showIcon
          message="ไม่สามารถดึงข้อมูลจาก LOGA ได้ในขณะนี้ ลองใหม่ภายหลัง"
        />
      )}
      {loga.data?.status === 'NOT_FOUND' && (
        <Alert type="warning" showIcon message={`LOGA ไม่พบรหัสสมาชิก ${member.logaId}`} />
      )}
      {customer && (
        <Flex gap={24} wrap align="center">
          <div>
            <Typography.Text type="secondary">แต้มคงเหลือ</Typography.Text>
            <div style={{ fontSize: 36, fontWeight: 800, color: colors.ink, lineHeight: 1.2 }}>
              {customer.points?.toLocaleString('en-US') ?? '-'}
              <span style={{ fontSize: 18, marginLeft: 6 }}>แต้ม</span>
            </div>
          </div>
          <Descriptions
            column={1}
            size="small"
            style={{ flex: 1, minWidth: 220 }}
            items={[
              { label: 'ระดับสมาชิก', children: customer.level ?? '-' },
              {
                label: 'วันเกิด',
                children: customer.birthday ? thaiDateOrRaw(customer.birthday) : '-',
              },
              { label: 'รหัส LOGA', children: member.logaId },
            ]}
          />
        </Flex>
      )}
    </Card>
  );
}
