import { SearchOutlined, SettingOutlined, ShopOutlined } from '@ant-design/icons';
import { Button, Card, Empty, Flex, Input, Select, Skeleton, Typography } from 'antd';
import type { Community, Location } from '../../api/org';
import { StatusPill } from '../../components/StatusPill';
import { colors } from '../../theme';

interface LocationListProps {
  locations: Location[] | undefined;
  loading: boolean;
  communities: Community[] | undefined;
  communityId: string | undefined;
  onCommunityChange: (id: string | undefined) => void;
  search: string;
  onSearchChange: (value: string) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onManageCommunities: () => void;
}

/** Left "สถานที่" card: search + selectable location cards. */
export function LocationList(props: LocationListProps) {
  const { locations, loading, communities, selectedId } = props;
  const showCommunityFilter = (communities?.length ?? 0) > 1;

  return (
    <Card styles={{ body: { padding: 24 } }} style={{ height: '100%' }}>
      <Flex justify="space-between" align="center" style={{ marginBottom: 16 }}>
        <Typography.Title level={3} style={{ margin: 0 }}>
          สถานที่
        </Typography.Title>
        <Button icon={<SettingOutlined />} onClick={props.onManageCommunities}>
          Community
        </Button>
      </Flex>

      {showCommunityFilter && (
        <Select
          aria-label="กรองตาม Community"
          allowClear
          placeholder="ทุก Community"
          value={props.communityId}
          onChange={props.onCommunityChange}
          options={communities?.map((c) => ({ value: c.id, label: c.name }))}
          style={{ width: '100%', marginBottom: 12 }}
        />
      )}
      <Input
        allowClear
        prefix={<SearchOutlined />}
        placeholder="ค้นหาสถานที่"
        value={props.search}
        onChange={(e) => props.onSearchChange(e.target.value)}
        style={{ marginBottom: 16 }}
      />

      {loading && !locations ? (
        <Skeleton active />
      ) : !locations?.length ? (
        <Empty description="ไม่พบสถานที่" />
      ) : (
        <Flex vertical gap={12}>
          {locations.map((location) => {
            const selected = location.id === selectedId;
            return (
              <button
                key={location.id}
                type="button"
                aria-pressed={selected}
                onClick={() => props.onSelect(location.id)}
                style={{
                  all: 'unset',
                  cursor: 'pointer',
                  padding: '16px 20px',
                  borderRadius: 14,
                  border: `${selected ? 2 : 1}px solid ${selected ? colors.ink : colors.border}`,
                  background: selected ? colors.sidebarActiveBg : '#fff',
                }}
              >
                <Flex justify="space-between" align="flex-start" gap={8}>
                  <Typography.Text strong style={{ fontSize: 17 }}>
                    {location.name}
                  </Typography.Text>
                  {location.status === 'ACTIVE' ? (
                    <StatusPill tone="success">เปิดใช้งาน</StatusPill>
                  ) : (
                    <StatusPill tone="neutral">ปิดใช้งาน</StatusPill>
                  )}
                </Flex>
                <Typography.Text type="secondary" style={{ display: 'block' }}>
                  {location.code}
                  {showCommunityFilter && ` · ${location.community.name}`}
                </Typography.Text>
                <Typography.Text type="secondary">
                  <ShopOutlined /> ร้านค้า {location.shopCount} ร้าน
                </Typography.Text>
              </button>
            );
          })}
        </Flex>
      )}
    </Card>
  );
}
