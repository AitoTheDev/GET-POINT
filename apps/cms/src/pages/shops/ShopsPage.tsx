import {
  EnvironmentOutlined,
  FileExcelOutlined,
  PlusOutlined,
  ShopOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { Menu } from '@getpoint/shared';
import { App, Button, Card, Col, Empty, Flex, Row } from 'antd';
import { useDeferredValue, useState } from 'react';
import { apiDownload, errorMessage } from '../../api/client';
import { type Location, useCommunities, useLocations, useOrgSummary } from '../../api/org';
import { useAuth } from '../../auth/useAuth';
import { PageHeader } from '../../components/PageHeader';
import { StatCard } from '../../components/StatCard';
import { CommunitiesModal } from './CommunitiesModal';
import { LocationList } from './LocationList';
import { LocationModal } from './LocationModal';
import { ShopsPanel } from './ShopsPanel';

/** "ร้านค้าและสถานที่" page (mockup image 57). */
export function ShopsPage() {
  const { can } = useAuth();
  const { message } = App.useApp();
  const canManage = can(Menu.SHOPS, 'manage');

  const [communityId, setCommunityId] = useState<string>();
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [locationModal, setLocationModal] = useState<Location | 'new' | null>(null);
  const [communitiesOpen, setCommunitiesOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  const summary = useOrgSummary();
  const communities = useCommunities();
  const locations = useLocations({ communityId, search: deferredSearch || undefined });
  const allLocations = useLocations();

  // Default to the first location in the list.
  const list = locations.data ?? [];
  const selected = list.find((l) => l.id === selectedId) ?? list[0] ?? null;
  const canAddLocation = canManage && Boolean(communities.data?.some((c) => c.canManage));

  const exportExcel = async () => {
    setExporting(true);
    try {
      const date = new Date().toISOString().slice(0, 10);
      await apiDownload('/shops/export', `ร้านค้า-${date}.xlsx`);
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      <PageHeader
        title="ร้านค้าและสถานที่"
        extra={
          <Flex gap={12} wrap>
            <Button
              size="large"
              icon={<FileExcelOutlined />}
              onClick={exportExcel}
              loading={exporting}
            >
              Export Excel
            </Button>
            {canAddLocation && (
              <Button
                type="primary"
                size="large"
                icon={<PlusOutlined />}
                onClick={() => setLocationModal('new')}
              >
                เพิ่มสถานที่
              </Button>
            )}
          </Flex>
        }
      />

      <Row gutter={[20, 20]} style={{ marginBottom: 20 }}>
        <Col xs={24} md={8}>
          <StatCard
            icon={<EnvironmentOutlined />}
            label="สถานที่ทั้งหมด"
            value={summary.data?.locations}
            loading={summary.isLoading}
          />
        </Col>
        <Col xs={24} md={8}>
          <StatCard
            icon={<ShopOutlined />}
            label="ร้านค้าทั้งหมด"
            value={summary.data?.shops}
            loading={summary.isLoading}
          />
        </Col>
        <Col xs={24} md={8}>
          <StatCard
            icon={<TeamOutlined />}
            label="ร้านค้าที่ร่วมรายการ"
            value={summary.data?.participatingShops}
            loading={summary.isLoading}
          />
        </Col>
      </Row>

      <Row gutter={[20, 20]}>
        <Col xs={24} xl={8}>
          <LocationList
            locations={locations.data}
            loading={locations.isLoading}
            communities={communities.data}
            communityId={communityId}
            onCommunityChange={setCommunityId}
            search={search}
            onSearchChange={setSearch}
            selectedId={selected?.id ?? null}
            onSelect={setSelectedId}
            onManageCommunities={() => setCommunitiesOpen(true)}
          />
        </Col>
        <Col xs={24} xl={16}>
          {selected ? (
            <ShopsPanel
              key={selected.id}
              location={selected}
              locations={allLocations.data ?? []}
              onEditLocation={() => setLocationModal(selected)}
            />
          ) : (
            <Card>
              <Empty
                description={
                  locations.isLoading ? 'กำลังโหลด...' : 'ยังไม่มีสถานที่ เพิ่มสถานที่เพื่อเริ่มต้น'
                }
              />
            </Card>
          )}
        </Col>
      </Row>

      {locationModal && (
        <LocationModal
          open
          location={locationModal === 'new' ? null : locationModal}
          onClose={() => setLocationModal(null)}
          onSaved={(saved) => {
            setLocationModal(null);
            setSelectedId(saved.id);
          }}
        />
      )}
      <CommunitiesModal open={communitiesOpen} onClose={() => setCommunitiesOpen(false)} />
    </>
  );
}
