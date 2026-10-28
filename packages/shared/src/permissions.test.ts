import { describe, expect, it } from 'vitest';
import { hasPermission, Menu, type MenuPermission } from './permissions';

describe('hasPermission', () => {
  const perms: MenuPermission[] = [
    { menu: Menu.MEMBERS, canView: true, canManage: false },
    { menu: Menu.RECEIPT_REVIEW, canView: false, canManage: true },
  ];

  it('grants view when view is set', () => {
    expect(hasPermission(perms, Menu.MEMBERS, 'view')).toBe(true);
    expect(hasPermission(perms, Menu.MEMBERS, 'manage')).toBe(false);
  });

  it('treats manage as implying view', () => {
    expect(hasPermission(perms, Menu.RECEIPT_REVIEW, 'view')).toBe(true);
    expect(hasPermission(perms, Menu.RECEIPT_REVIEW, 'manage')).toBe(true);
  });

  it('denies menus with no grant', () => {
    expect(hasPermission(perms, Menu.USERS, 'view')).toBe(false);
  });
});
