import {
  BarChartOutlined,
  FileExcelOutlined,
  FileTextOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { App, Button, Tabs } from 'antd';
import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { apiDownload, errorMessage } from '../../api/client';
import {
  exportQuery,
  type LogaReportFilters,
  type MembersReportFilters,
  type ReceiptsReportFilters,
} from '../../api/reports';
import { type RangeValue, thisMonth } from '../../components/dateRange';
import { PageHeader } from '../../components/PageHeader';
import { LogaReportTab } from './LogaReportTab';
import { MembersReportTab } from './MembersReportTab';
import { ReceiptsReportTab } from './ReceiptsReportTab';

type Tab = 'receipts' | 'members' | 'loga';
const TABS: Tab[] = ['receipts', 'members', 'loga'];
const TITLES: Record<Tab, string> = {
  receipts: 'รายงาน',
  members: 'รายงานสมาชิก',
  loga: 'รายงานแต้มที่ส่งไป Loga',
};

/** "รายงาน" (mockups 59–61): three reports, each with its own filters and Excel export. */
export function ReportsPage() {
  const { message } = App.useApp();
  const [params, setParams] = useSearchParams();
  const tabParam = params.get('tab') as Tab | null;
  const tab: Tab = tabParam && TABS.includes(tabParam) ? tabParam : 'receipts';
  const [exporting, setExporting] = useState(false);

  // Each tab keeps its last applied filters while switching between tabs.
  const [initial] = useState(thisMonth);
  const base = { from: initial.from, to: initial.to };
  const [ranges, setRanges] = useState<Record<Tab, RangeValue>>({
    receipts: initial,
    members: initial,
    loga: initial,
  });
  const [receipts, setReceipts] = useState<ReceiptsReportFilters>({ ...base, status: 'APPROVED' });
  const [members, setMembers] = useState<MembersReportFilters>({ ...base, page: 1, pageSize: 20 });
  const [loga, setLoga] = useState<LogaReportFilters>({ ...base, page: 1, pageSize: 20 });
  const keepRange = (t: Tab, range?: RangeValue) =>
    range && setRanges((r) => ({ ...r, [t]: range }));

  const exportExcel = async () => {
    const query =
      tab === 'receipts'
        ? exportQuery(receipts)
        : tab === 'members'
          ? exportQuery({ ...members, status: undefined, memberStatus: members.status })
          : exportQuery(loga);
    const range = tab === 'receipts' ? receipts : tab === 'members' ? members : loga;
    setExporting(true);
    try {
      await apiDownload(
        `/reports/${tab}/export?${query}`,
        `report-${tab}-${range.from}-${range.to}.xlsx`,
      );
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader
        title={TITLES[tab]}
        extra={
          <Button
            size="large"
            icon={<FileExcelOutlined />}
            loading={exporting}
            onClick={exportExcel}
          >
            Export Excel
          </Button>
        }
      />
      <Tabs
        type="card"
        size="large"
        activeKey={tab}
        onChange={(key) => setParams({ tab: key }, { replace: true })}
        items={[
          {
            key: 'receipts',
            icon: <FileTextOutlined />,
            label: 'รายงานใบเสร็จ',
            children: (
              <ReceiptsReportTab
                range={ranges.receipts}
                filters={receipts}
                onApply={(f, range) => {
                  setReceipts(f);
                  keepRange('receipts', range);
                }}
              />
            ),
          },
          {
            key: 'members',
            icon: <TeamOutlined />,
            label: 'รายงานสมาชิก',
            children: (
              <MembersReportTab
                range={ranges.members}
                filters={members}
                onChange={(f, range) => {
                  setMembers(f);
                  keepRange('members', range);
                }}
              />
            ),
          },
          {
            key: 'loga',
            icon: <BarChartOutlined />,
            label: 'รายงานแต้มที่ส่งไป Loga',
            children: (
              <LogaReportTab
                range={ranges.loga}
                filters={loga}
                onChange={(f, range) => {
                  setLoga(f);
                  keepRange('loga', range);
                }}
              />
            ),
          },
        ]}
      />
    </>
  );
}
