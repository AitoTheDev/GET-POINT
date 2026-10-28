import { ArrowRightOutlined, DatabaseOutlined } from '@ant-design/icons';
import { calculatePoints, formatNumber, type PointFormula } from '@getpoint/shared';
import { Card, Flex, Typography } from 'antd';
import { useState } from 'react';
import { AddonNumber } from '../../components/AddonNumber';
import { colors } from '../../theme';

/** "ตัวอย่างการคำนวณ": live result of the formula being edited (mockup image 57, right). */
export function PreviewCard({ formula }: { formula: PointFormula | null }) {
  const [amount, setAmount] = useState<number | null>(680);
  const result = formula && amount !== null ? calculatePoints(amount, formula) : null;
  const n = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 2 });

  return (
    <Card styles={{ body: { padding: 24 } }}>
      <Typography.Title level={3} style={{ marginTop: 0 }}>
        ตัวอย่างการคำนวณ
      </Typography.Title>
      <Typography.Text strong>ยอดใบเสร็จ</Typography.Text>
      <AddonNumber
        aria-label="ยอดใบเสร็จตัวอย่าง"
        size="large"
        after="บาท"
        min={0}
        max={100_000_000}
        precision={2}
        value={amount}
        onChange={setAmount}
        style={{ width: '100%', margin: '8px 0 16px' }}
      />
      <div
        style={{
          background: colors.successBg,
          borderRadius: 14,
          padding: '20px 24px',
        }}
      >
        <Flex gap={20} align="center">
          <Flex
            align="center"
            justify="center"
            style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              background: '#D5F0E0',
              color: colors.success,
              fontSize: 32,
              flex: 'none',
            }}
          >
            <DatabaseOutlined />
          </Flex>
          <div>
            <Typography.Text>แต้มที่คำนวณได้</Typography.Text>
            <div
              data-testid="preview-points"
              style={{ fontSize: 40, fontWeight: 800, color: colors.success, lineHeight: 1.2 }}
            >
              {result ? formatNumber(result.points) : '-'} แต้ม
            </div>
          </div>
        </Flex>
        {result && formula && (
          <Typography.Paragraph
            type="secondary"
            style={{
              textAlign: 'center',
              margin: '16px 0 0',
              paddingTop: 12,
              borderTop: `1px solid ${colors.border}`,
            }}
          >
            {n(amount!)} ÷ {n(formula.spendAmount)}
            {formula.points !== 1 && ` × ${n(formula.points)}`} = {n(result.exact)}{' '}
            <ArrowRightOutlined /> {formatNumber(result.points)} แต้ม
            {result.capped && ` (สูงสุด ${formatNumber(formula.maxPoints!)} แต้มต่อใบเสร็จ)`}
          </Typography.Paragraph>
        )}
      </div>
    </Card>
  );
}
