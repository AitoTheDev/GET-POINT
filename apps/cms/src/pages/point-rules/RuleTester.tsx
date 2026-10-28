import { ExperimentOutlined } from '@ant-design/icons';
import { formatNumber, formatRate, PointRuleLevelLabel } from '@getpoint/shared';
import { Alert, Button, Card, DatePicker, Flex, Select, Typography } from 'antd';
import dayjs, { type Dayjs } from 'dayjs';
import { useState } from 'react';
import { AddonNumber } from '../../components/AddonNumber';
import { errorMessage } from '../../api/client';
import { type Resolution, resolveRule, type RuleOptions, useRuleShops } from '../../api/pointRules';
import { placeLabels, rangeLabel, todayInBangkok } from './ruleDisplay';

/**
 * "ทดสอบเงื่อนไขกับใบเสร็จ": which saved rule a receipt from a shop on a date would use
 * (Shop → Location → Community) and its points. Not in the mockup; added to check rules.
 */
export function RuleTester({ options }: { options: RuleOptions | undefined }) {
  const [locationId, setLocationId] = useState<string>();
  const [shopId, setShopId] = useState<string>();
  const [date, setDate] = useState<Dayjs | null>(dayjs(todayInBangkok()));
  const [amount, setAmount] = useState<number | null>(680);
  const [result, setResult] = useState<Resolution | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const shops = useRuleShops(locationId);

  const check = async () => {
    if (!shopId || !date || amount === null) return;
    setChecking(true);
    setError(null);
    try {
      setResult(await resolveRule({ shopId, date: date.format('YYYY-MM-DD'), amount }));
    } catch (err) {
      setResult(null);
      setError(errorMessage(err));
    } finally {
      setChecking(false);
    }
  };

  const rule = result?.rule;
  return (
    <Card styles={{ body: { padding: 24 } }}>
      <Typography.Title level={4} style={{ marginTop: 0 }}>
        <ExperimentOutlined /> ทดสอบเงื่อนไขกับใบเสร็จ
      </Typography.Title>
      <Typography.Paragraph type="secondary">
        ดูว่าใบเสร็จจะใช้เงื่อนไขไหน (ร้านค้า → สถานที่ → Community)
      </Typography.Paragraph>
      <Flex vertical gap={10}>
        <Select
          aria-label="สถานที่ที่ทดสอบ"
          placeholder="เลือกสถานที่"
          value={locationId}
          onChange={(id) => {
            setLocationId(id);
            setShopId(undefined);
            setResult(null);
          }}
          options={options?.locations.map((l) => ({ value: l.id, label: l.name }))}
        />
        <Select
          aria-label="ร้านค้าที่ทดสอบ"
          placeholder="เลือกร้านค้า"
          value={shopId}
          onChange={(id) => {
            setShopId(id);
            setResult(null);
          }}
          disabled={!locationId}
          loading={shops.isLoading}
          showSearch
          optionFilterProp="label"
          options={shops.data?.map((s) => ({ value: s.id, label: `${s.name} (${s.code})` }))}
        />
        <Flex gap={10}>
          <DatePicker
            aria-label="วันที่บนใบเสร็จ"
            format="DD/MM/BBBB"
            value={date}
            onChange={setDate}
            allowClear={false}
            style={{ flex: 1 }}
          />
          <AddonNumber
            aria-label="ยอดใบเสร็จที่ทดสอบ"
            after="บาท"
            min={0}
            precision={2}
            value={amount}
            onChange={setAmount}
            style={{ flex: 1 }}
          />
        </Flex>
        <Button onClick={check} loading={checking} disabled={!shopId || !date || amount === null}>
          ตรวจสอบ
        </Button>
      </Flex>

      {error && <Alert type="error" showIcon message={error} style={{ marginTop: 16 }} />}
      {result && !rule && (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 16 }}
          message="ไม่มีเงื่อนไขที่ใช้ได้ในวันที่นี้"
          description="ใบเสร็จนี้จะคำนวณแต้มไม่ได้และอนุมัติไม่ได้ จนกว่าจะตั้งเงื่อนไข"
        />
      )}
      {result && !result.shop.participating && (
        <Alert
          type="info"
          showIcon
          style={{ marginTop: 16 }}
          message="ร้านค้านี้ไม่ได้ร่วมสะสมแต้ม"
        />
      )}
      {rule && result.calculation && (
        <Alert
          type="success"
          showIcon
          style={{ marginTop: 16 }}
          message={`${formatNumber(result.calculation.points)} แต้ม`}
          description={
            <>
              ใช้เงื่อนไขระดับ{PointRuleLevelLabel[rule.level]}: {placeLabels(rule).place}
              {rule.shop && ` / ${rule.shop.name}`}
              <br />
              {formatRate(rule)} · {rangeLabel(rule)}
            </>
          }
        />
      )}
    </Card>
  );
}
