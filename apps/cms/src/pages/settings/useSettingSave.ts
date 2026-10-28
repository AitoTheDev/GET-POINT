import type { SettingKey, SettingsValues } from '@getpoint/shared';
import { App } from 'antd';
import { useState } from 'react';
import { errorMessage } from '../../api/client';
import { useSaveSetting } from '../../api/settings';

/** Save one Settings item, with a success message and the error kept for its card. */
export function useSettingSave<K extends SettingKey>(key: K) {
  const { message } = App.useApp();
  const mutation = useSaveSetting();
  const [error, setError] = useState<string | null>(null);

  const save = async (value: SettingsValues[K]) => {
    setError(null);
    try {
      await mutation.mutateAsync({ key, value });
      message.success('บันทึกการตั้งค่าแล้ว');
      return true;
    } catch (err) {
      setError(errorMessage(err));
      return false;
    }
  };
  return { save, saving: mutation.isPending, error };
}
