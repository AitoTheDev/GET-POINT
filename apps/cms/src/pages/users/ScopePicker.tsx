import { Checkbox, Flex, TreeSelect } from 'antd';
import { type ScopeInput, useScopeOptions } from '../../api/users';
import { communityValue, locationValue, scopeToTreeValues, treeValuesToScope } from './scope';

interface ScopePickerProps {
  value?: ScopeInput;
  onChange?: (scope: ScopeInput) => void;
  /** Admins always have every location. */
  forceAll?: boolean;
  disabled?: boolean;
}

/** "สถานที่ที่เข้าถึงได้": all locations, or any mix of whole Communities and single Locations. */
export function ScopePicker({ value, onChange, forceAll, disabled }: ScopePickerProps) {
  const options = useScopeOptions();
  const scope = value ?? { all: false, communityIds: [], locationIds: [] };
  const all = forceAll || scope.all;

  const treeData = (options.data ?? []).map((community) => ({
    title: `${community.name} (ทุกสถานที่ใน Community)`,
    value: communityValue(community.id),
    children: community.locations.map((location) => ({
      title: `${location.name} · ${location.code}`,
      value: locationValue(location.id),
    })),
  }));

  return (
    <Flex vertical gap={8}>
      <Checkbox
        checked={all}
        disabled={disabled || forceAll}
        onChange={(e) => onChange?.({ ...scope, all: e.target.checked })}
      >
        ทุกสถานที่
      </Checkbox>
      {!all && (
        <TreeSelect
          aria-label="สถานที่ที่เข้าถึงได้"
          treeData={treeData}
          // Wait for the options so the tree never receives ids it does not know yet.
          value={options.data ? scopeToTreeValues(scope) : []}
          onChange={(values: string[]) => onChange?.(treeValuesToScope(values, false))}
          treeCheckable
          // Selecting every location in a Community stores the Community itself,
          // so locations added to it later are included automatically.
          showCheckedStrategy={TreeSelect.SHOW_PARENT}
          treeDefaultExpandAll
          loading={options.isLoading}
          disabled={disabled || !options.data}
          placeholder="เลือกสถานที่"
          style={{ width: '100%' }}
          maxTagCount="responsive"
        />
      )}
    </Flex>
  );
}
