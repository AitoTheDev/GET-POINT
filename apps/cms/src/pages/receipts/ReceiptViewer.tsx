import {
  ExpandOutlined,
  RotateRightOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
} from '@ant-design/icons';
import { Alert, Button, Card, Flex, Spin, Tooltip, Typography } from 'antd';
import { useEffect, useRef, useState } from 'react';
import { errorMessage } from '../../api/client';
import { useReceiptImage } from '../../api/receipts';

const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];

/** "ภาพใบเสร็จ": the receipt file with zoom, rotate and full screen (mockup image 53, middle). */
export function ReceiptViewer({
  id,
  mime,
  height = 640,
}: {
  id: string;
  mime: string;
  height?: number;
}) {
  const image = useReceiptImage(id);
  const [zoom, setZoom] = useState(2); // index into ZOOMS → 100%
  const [rotation, setRotation] = useState(0);
  const frame = useRef<HTMLDivElement>(null);
  const [frameWidth, setFrameWidth] = useState<number | null>(null);
  const isPdf = mime === 'application/pdf';
  const sideways = rotation % 180 !== 0;

  // The frame's width is needed to fit a sideways image; follow it when the window resizes.
  useEffect(() => {
    const el = frame.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setFrameWidth(entry.contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const tools = (
    <Flex gap={4}>
      <Tooltip title="ขยาย">
        <Button
          type="text"
          icon={<ZoomInOutlined />}
          aria-label="ขยาย"
          disabled={isPdf || zoom === ZOOMS.length - 1}
          onClick={() => setZoom((z) => Math.min(z + 1, ZOOMS.length - 1))}
        />
      </Tooltip>
      <Tooltip title="ย่อ">
        <Button
          type="text"
          icon={<ZoomOutOutlined />}
          aria-label="ย่อ"
          disabled={isPdf || zoom === 0}
          onClick={() => setZoom((z) => Math.max(z - 1, 0))}
        />
      </Tooltip>
      <Tooltip title="หมุน">
        <Button
          type="text"
          icon={<RotateRightOutlined />}
          aria-label="หมุน"
          disabled={isPdf}
          onClick={() => setRotation((r) => (r + 90) % 360)}
        />
      </Tooltip>
      <Tooltip title="เต็มจอ">
        <Button
          type="text"
          icon={<ExpandOutlined />}
          aria-label="เต็มจอ"
          onClick={() => frame.current?.requestFullscreen?.()}
        />
      </Tooltip>
    </Flex>
  );

  return (
    <Card
      title={
        <Typography.Title level={3} style={{ margin: 0 }}>
          ภาพใบเสร็จ
        </Typography.Title>
      }
      extra={tools}
      styles={{ body: { padding: 16 } }}
    >
      <div
        ref={frame}
        data-testid="receipt-frame"
        style={{
          height,
          background: '#E3E5E8',
          borderRadius: 10,
          // Scrolls when zoomed in. Children are centred with margin:auto (not align/justify),
          // so a zoomed image can still be scrolled to every edge.
          overflow: 'auto',
          display: 'flex',
        }}
      >
        {image.error ? (
          <Alert
            type="error"
            showIcon
            message={errorMessage(image.error)}
            style={{ margin: 'auto' }}
          />
        ) : !image.url ? (
          <Spin style={{ margin: 'auto' }} />
        ) : isPdf ? (
          <iframe
            title="ไฟล์ PDF ใบเสร็จ"
            src={image.url}
            style={{ width: '100%', height: '100%', border: 0, background: '#fff' }}
          />
        ) : (
          <img
            src={image.url}
            alt="ภาพใบเสร็จ"
            style={{
              margin: 'auto',
              // At 100% the image fits the frame; turned sideways, width and height swap.
              maxWidth: sideways ? height : (frameWidth ?? '100%'),
              maxHeight: sideways ? (frameWidth ?? height) : height,
              // CSS zoom changes the layout size (scrollable), unlike transform: scale.
              zoom: ZOOMS[zoom],
              transform: `rotate(${rotation}deg)`,
              transition: 'transform 0.15s',
            }}
          />
        )}
      </div>
    </Card>
  );
}
