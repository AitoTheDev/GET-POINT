import {
  EnvironmentOutlined,
  PlusOutlined,
  RightOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import {
  formatMoney,
  formatThaiDateTime,
  maskThaiMobile,
  type ReceiptStatus,
  Menu,
} from '@getpoint/shared';
import {
  Button,
  Card,
  Col,
  Empty,
  Flex,
  Input,
  Pagination,
  Row,
  Segmented,
  Select,
  Spin,
  Typography,
} from 'antd';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { errorMessage } from '../../api/client';
import {
  type Receipt,
  type ReceiptFilters,
  useReceiptConfig,
  useReceiptLocations,
  useReceipts,
  useReceiptSummary,
} from '../../api/receipts';
import { useAuth } from '../../auth/useAuth';
import { PageHeader } from '../../components/PageHeader';
import { colors } from '../../theme';
import { AddReceiptModal } from './AddReceiptModal';
import { ReceiptThumb } from './receiptDisplay';
import { ReceiptViewer } from './ReceiptViewer';
import { ReviewForm } from './ReviewForm';

const TABS: { status: ReceiptStatus; label: string }[] = [
  { status: 'PENDING_REVIEW', label: 'รอตรวจสอบ' },
  { status: 'NEEDS_CHECK', label: 'ต้องตรวจเพิ่ม' },
  { status: 'APPROVED', label: 'อนุมัติแล้ว' },
  { status: 'REJECTED', label: 'ไม่อนุมัติ' },
];

/** "ตรวจสอบใบเสร็จ" (mockup image 53): queue, receipt image, review form. */
export function ReviewPage() {
  const { can } = useAuth();
  const canDecide = can(Menu.RECEIPT_REVIEW, 'manage');
  const [adding, setAdding] = useState(false);
  // ?code=GP002&status=NEEDS_CHECK opens one receipt (links from the Dashboard).
  const [params] = useSearchParams();
  const linkedCode = params.get('code') ?? '';
  const linkedStatus = params.get('status') === 'NEEDS_CHECK' ? 'NEEDS_CHECK' : 'PENDING_REVIEW';
  const [filters, setFilters] = useState<ReceiptFilters>({
    status: linkedStatus,
    search: linkedCode || undefined,
    page: 1,
    pageSize: 20,
  });
  const [searchText, setSearchText] = useState(linkedCode);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const summary = useReceiptSummary();
  // Load reject reasons and upload limits now, so the dialogs open with them ready.
  useReceiptConfig();
  const locations = useReceiptLocations();
  const list = useReceipts(filters);

  const items = list.data?.items ?? [];
  const selected = items.find((r) => r.id === selectedId) ?? items[0] ?? null;
  const index = selected ? items.indexOf(selected) : -1;
  const next = index >= 0 ? (items[index + 1] ?? null) : null;

  const update = (patch: Partial<ReceiptFilters>) => {
    setSelectedId(null);
    setFilters((f) => ({ ...f, page: 1, ...patch }));
  };

  /** After a decision the receipt leaves this tab: carry on with the next one. */
  const afterDecision = (saved: Receipt) => {
    setSelectedId(saved.status === filters.status ? saved.id : (next?.id ?? null));
  };

  return (
    <>
      <PageHeader
        title="ตรวจสอบใบเสร็จ"
        extra={
          <Flex gap={12} wrap style={{ width: '100%', maxWidth: 760 }}>
            <Input
              size="large"
              allowClear
              prefix={<SearchOutlined />}
              placeholder="ค้นหาเลขรายการหรือเบอร์โทร"
              value={searchText}
              onChange={(e) => {
                setSearchText(e.target.value);
                if (!e.target.value) update({ search: undefined });
              }}
              onPressEnter={() => update({ search: searchText.trim() || undefined })}
              style={{ flex: '2 1 240px' }}
            />
            <Select
              size="large"
              aria-label="กรองตามสถานที่"
              allowClear
              placeholder="ทุกสถานที่"
              suffixIcon={<EnvironmentOutlined />}
              value={filters.locationId}
              onChange={(locationId) => update({ locationId })}
              options={locations.data?.map((l) => ({ value: l.id, label: l.name }))}
              style={{ flex: '1 1 180px' }}
            />
            {canDecide && (
              <Button
                type="primary"
                size="large"
                icon={<PlusOutlined />}
                onClick={() => setAdding(true)}
              >
                เพิ่มใบเสร็จ
              </Button>
            )}
          </Flex>
        }
      />

      {/* The four tabs scroll sideways on a phone instead of widening the page. */}
      <div style={{ overflowX: 'auto', marginBottom: 20 }}>
        <Segmented<ReceiptStatus>
          size="large"
          value={filters.status}
          onChange={(status) => update({ status })}
          options={TABS.map((t) => ({
            value: t.status,
            label: (
              <span style={{ padding: '0 8px' }}>
                {t.label}
                {summary.data && summary.data[t.status] > 0 && (
                  <span style={{ marginLeft: 8, fontWeight: 700, color: colors.warning }}>
                    {summary.data[t.status].toLocaleString('en-US')}
                  </span>
                )}
              </span>
            ),
          }))}
        />
      </div>

      <Row gutter={[20, 20]}>
        <Col xs={24} xl={7}>
          <Card
            title={
              <Typography.Title level={3} style={{ margin: 0 }}>
                รายการใบเสร็จ{' '}
                <Typography.Text type="secondary" style={{ fontSize: 22 }}>
                  ({list.data?.total ?? 0})
                </Typography.Text>
              </Typography.Title>
            }
            styles={{ body: { padding: 12 } }}
          >
            {list.isLoading ? (
              <Flex justify="center" style={{ padding: 40 }}>
                <Spin />
              </Flex>
            ) : items.length === 0 ? (
              <Empty
                description={list.isError ? errorMessage(list.error) : 'ไม่มีใบเสร็จในรายการนี้'}
                style={{ padding: 40 }}
              />
            ) : (
              <Flex vertical gap={10}>
                {items.map((r) => (
                  <QueueItem
                    key={r.id}
                    receipt={r}
                    selected={r.id === selected?.id}
                    onClick={() => setSelectedId(r.id)}
                  />
                ))}
                {(list.data?.total ?? 0) > filters.pageSize && (
                  <Pagination
                    size="small"
                    align="center"
                    current={filters.page}
                    pageSize={filters.pageSize}
                    total={list.data?.total}
                    showSizeChanger={false}
                    onChange={(page) => {
                      setSelectedId(null);
                      setFilters((f) => ({ ...f, page }));
                    }}
                  />
                )}
              </Flex>
            )}
          </Card>
        </Col>
        <Col xs={24} xl={8}>
          {selected ? (
            <ReceiptViewer key={selected.id} id={selected.id} mime={selected.imageMime} />
          ) : (
            <Card>
              <Empty description="เลือกใบเสร็จจากรายการ" />
            </Card>
          )}
        </Col>
        <Col xs={24} xl={9}>
          {selected && (
            <ReviewForm
              key={selected.id}
              receipt={selected}
              onDecided={afterDecision}
              onNext={next ? () => setSelectedId(next.id) : null}
            />
          )}
        </Col>
      </Row>
      {adding && (
        <AddReceiptModal
          onClose={() => setAdding(false)}
          onAdded={(saved) => {
            setAdding(false);
            // Show the new receipt in its tab.
            setFilters((prev) => ({ ...prev, status: saved.status, page: 1, search: undefined }));
            setSearchText('');
            setSelectedId(saved.id);
          }}
        />
      )}
    </>
  );
}

function QueueItem({
  receipt: r,
  selected,
  onClick,
}: {
  receipt: Receipt;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={selected}
      aria-label={`ใบเสร็จ ${r.code}`}
      style={{
        display: 'flex',
        gap: 14,
        alignItems: 'center',
        width: '100%',
        textAlign: 'left',
        padding: 12,
        borderRadius: 12,
        cursor: 'pointer',
        font: 'inherit',
        color: 'inherit',
        background: selected ? '#F2F3F5' : '#fff',
        border: `1px solid ${selected ? colors.ink : colors.border}`,
      }}
    >
      <ReceiptThumb id={r.id} mime={r.imageMime} size={56} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <Flex justify="space-between" gap={8}>
          <Typography.Text strong style={{ fontSize: 17 }}>
            #{r.code}
          </Typography.Text>
          {r.amount !== null && (
            <Typography.Text strong>{formatMoney(r.amount)} บาท</Typography.Text>
          )}
        </Flex>
        <Typography.Text type="secondary" style={{ display: 'block' }}>
          {formatThaiDateTime(r.submittedAt)}
        </Typography.Text>
        <Typography.Text type="secondary">
          {maskThaiMobile(r.member.phone)}
          {r.submission.count > 1 && ` · ใบที่ ${r.sequence}/${r.submission.count}`}
        </Typography.Text>
      </div>
      <RightOutlined style={{ color: colors.textMuted }} />
    </button>
  );
}
