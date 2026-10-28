import { formatRate, formatThaiDateTime, RoundingModeLabel } from '@getpoint/shared';
import { Alert, Modal, Table } from 'antd';
import { errorMessage } from '../../api/client';
import { type PointRule, type RuleVersion, useRuleVersions } from '../../api/pointRules';
import { StatusPill } from '../../components/StatusPill';
import { claimLabel, placeLabels, rangeLabel } from './ruleDisplay';

/** Every saved version of a rule, newest first. */
export function VersionsModal({ rule, onClose }: { rule: PointRule; onClose: () => void }) {
  const versions = useRuleVersions(rule.id);
  const { place, shop } = placeLabels(rule);

  return (
    <Modal
      open
      width={900}
      title={`ประวัติการแก้ไข: ${place} · ${shop}`}
      footer={null}
      onCancel={onClose}
    >
      {versions.isError && <Alert type="error" showIcon message={errorMessage(versions.error)} />}
      <Table<RuleVersion>
        rowKey="id"
        size="small"
        scroll={{ x: 'max-content' }}
        loading={versions.isLoading}
        dataSource={versions.data}
        pagination={false}
        columns={[
          { title: 'เวอร์ชัน', dataIndex: 'version', width: 80 },
          { title: 'อัตราให้แต้ม', render: (_, v) => formatRate(v) },
          { title: 'การปัดเศษ', render: (_, v) => RoundingModeLabel[v.rounding] },
          { title: 'สูงสุด/ใบเสร็จ', render: (_, v) => v.maxPoints ?? '-' },
          { title: 'ส่งได้ภายใน', render: (_, v) => claimLabel(v.claimDays) },
          { title: 'ช่วงวันที่', render: (_, v) => rangeLabel(v) },
          {
            title: 'สถานะ',
            render: (_, v) =>
              v.status === 'ACTIVE' ? (
                <StatusPill tone="success">เปิดใช้งาน</StatusPill>
              ) : (
                <StatusPill tone="neutral">ปิดใช้งาน</StatusPill>
              ),
          },
          { title: 'แก้ไขโดย', render: (_, v) => v.changedBy?.name ?? '-' },
          { title: 'เมื่อ', render: (_, v) => formatThaiDateTime(v.createdAt) },
        ]}
      />
    </Modal>
  );
}
