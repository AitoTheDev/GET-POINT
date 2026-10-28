import { useQueryClient } from '@tanstack/react-query';
import { App } from 'antd';
import { useEffect } from 'react';
import { ApiRequestError, errorMessage } from '../api/client';

/**
 * Safety net: a data load that fails shows a message, so a failed list never just looks empty.
 * One message at a time (same key), and none for 401 (the login flow handles it).
 */
export function QueryErrorNotifier() {
  const client = useQueryClient();
  const { message } = App.useApp();

  useEffect(
    () =>
      client.getQueryCache().subscribe((event) => {
        if (event.type !== 'updated' || event.action.type !== 'error') return;
        const err = event.action.error;
        if (err instanceof ApiRequestError && err.status === 401) return;
        message.error({
          key: 'query-error',
          content:
            err instanceof ApiRequestError && err.status === 0
              ? 'ไม่สามารถเชื่อมต่อเซิร์ฟเวอร์ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่'
              : `โหลดข้อมูลไม่สำเร็จ: ${errorMessage(err)}`,
          duration: 6,
        });
      }),
    [client, message],
  );
  return null;
}
