import { EditOutlined, HistoryOutlined, InfoCircleOutlined } from '@ant-design/icons';
import { formatRate, Menu, type PointFormula } from '@getpoint/shared';
import { Button, Card, Col, Empty, Flex, Form, Row, Select, Table, Typography } from 'antd';
import { useState } from 'react';
import { errorMessage } from '../../api/client';
import { type PointRule, usePointRules, useRuleOptions } from '../../api/pointRules';
import { useAuth } from '../../auth/useAuth';
import { PageHeader } from '../../components/PageHeader';
import { StatusPill } from '../../components/StatusPill';
import { colors } from '../../theme';
import { PreviewCard } from './PreviewCard';
import { RuleForm } from './RuleForm';
import { type RuleFormValues, valuesOf } from './ruleFormValues';
import { claimLabel, placeLabels, rangeLabel } from './ruleDisplay';
import { RuleTester } from './RuleTester';
import { VersionsModal } from './VersionsModal';

/** "เงื่อนไขการให้แต้ม" page (mockup image 57). */
export function PointRulesPage() {
  const { can } = useAuth();
  const canManage = can(Menu.POINT_RULES, 'manage');
  const [form] = Form.useForm<RuleFormValues>();
  const [editing, setEditing] = useState<PointRule | null>(null);
  const [history, setHistory] = useState<PointRule | null>(null);
  const [locationId, setLocationId] = useState<string>();

  const options = useRuleOptions();
  const rules = usePointRules({ locationId });

  // Live preview follows the form while it is being filled in.
  const spendAmount = Form.useWatch('spendAmount', form);
  const points = Form.useWatch('points', form);
  const rounding = Form.useWatch('rounding', form);
  const capEnabled = Form.useWatch('capEnabled', form);
  const maxPoints = Form.useWatch('maxPoints', form);
  const formula: PointFormula | null =
    spendAmount && points
      ? {
          spendAmount,
          points,
          rounding: rounding ?? 'FLOOR',
          maxPoints: capEnabled && maxPoints ? maxPoints : null,
        }
      : null;

  const startEdit = (rule: PointRule) => {
    setEditing(rule);
    form.setFieldsValue(valuesOf(rule));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <>
      <PageHeader title="เงื่อนไขการให้แต้ม" />

      <Row gutter={[20, 20]} style={{ marginBottom: 20 }}>
        {canManage && (
          <Col xs={24} xl={16}>
            <RuleForm
              form={form}
              options={options.data}
              editing={editing}
              onDone={() => setEditing(null)}
            />
          </Col>
        )}
        <Col xs={24} xl={canManage ? 8 : 24}>
          <Flex vertical gap={20}>
            {canManage && <PreviewCard formula={formula} />}
            <Card styles={{ body: { padding: '20px 24px' } }} style={{ background: '#F0F1F3' }}>
              <Flex gap={16} align="flex-start">
                <InfoCircleOutlined style={{ fontSize: 30, marginTop: 4 }} />
                <div>
                  <Typography.Text strong style={{ fontSize: 17 }}>
                    การเพิ่ม–ลดแต้มสมาชิกดำเนินการใน Loga
                  </Typography.Text>
                  <br />
                  <Typography.Text type="secondary">
                    หน้านี้ใช้ตั้งเงื่อนไขการคำนวณแต้มเท่านั้น
                  </Typography.Text>
                </div>
              </Flex>
            </Card>
            <RuleTester options={options.data} />
          </Flex>
        </Col>
      </Row>

      <Card styles={{ body: { padding: 24 } }}>
        <Flex justify="space-between" align="center" gap={16} wrap style={{ marginBottom: 16 }}>
          <Typography.Title level={3} style={{ margin: 0 }}>
            เงื่อนไขที่ตั้งไว้
          </Typography.Title>
          <Select
            aria-label="กรองตามสถานที่"
            allowClear
            placeholder="ทุกสถานที่"
            value={locationId}
            onChange={setLocationId}
            options={options.data?.locations.map((l) => ({ value: l.id, label: l.name }))}
            style={{ minWidth: 220 }}
          />
        </Flex>
        <Table<PointRule>
          rowKey="id"
          scroll={{ x: 'max-content' }}
          loading={rules.isFetching}
          dataSource={rules.data}
          pagination={false}
          rowClassName={(r) => (r.id === editing?.id ? 'ant-table-row-selected' : '')}
          locale={{
            emptyText: (
              <Empty
                description={
                  rules.isError ? errorMessage(rules.error) : 'ยังไม่มีเงื่อนไขการให้แต้ม'
                }
              />
            ),
          }}
          columns={[
            { title: 'สถานที่', render: (_, r) => placeLabels(r).place },
            { title: 'ร้านค้า', render: (_, r) => placeLabels(r).shop },
            {
              title: 'อัตราให้แต้ม',
              render: (_, r) => (
                <>
                  {formatRate(r)}
                  {r.maxPoints !== null && (
                    <Typography.Text type="secondary" style={{ display: 'block', fontSize: 13 }}>
                      สูงสุด {r.maxPoints.toLocaleString('en-US')} แต้ม/ใบเสร็จ
                    </Typography.Text>
                  )}
                  <Typography.Text type="secondary" style={{ display: 'block', fontSize: 13 }}>
                    {claimLabel(r.claimDays)}
                  </Typography.Text>
                </>
              ),
            },
            { title: 'ช่วงวันที่', render: (_, r) => rangeLabel(r) },
            {
              title: 'สถานะ',
              render: (_, r) =>
                r.status === 'ACTIVE' ? (
                  <StatusPill tone="success">เปิดใช้งาน</StatusPill>
                ) : (
                  <StatusPill tone="neutral">ปิดใช้งาน</StatusPill>
                ),
            },
            {
              title: 'จัดการ',
              width: 210,
              render: (_, r) => (
                <Flex gap={8}>
                  {canManage && r.canManage && (
                    <Button
                      icon={<EditOutlined />}
                      onClick={() => startEdit(r)}
                      aria-label={`แก้ไขเงื่อนไข ${placeLabels(r).place} ${placeLabels(r).shop}`}
                    >
                      แก้ไข
                    </Button>
                  )}
                  <Button
                    type="text"
                    icon={<HistoryOutlined />}
                    onClick={() => setHistory(r)}
                    aria-label={`ประวัติ ${placeLabels(r).place} ${placeLabels(r).shop}`}
                    style={{ color: colors.textMuted }}
                  >
                    v{r.version}
                  </Button>
                </Flex>
              ),
            },
          ]}
        />
      </Card>

      {history && <VersionsModal rule={history} onClose={() => setHistory(null)} />}
    </>
  );
}
