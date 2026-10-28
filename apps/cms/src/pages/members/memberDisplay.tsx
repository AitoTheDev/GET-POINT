import { type MemberStatus, MemberStatusLabel } from '@getpoint/shared';
import { Flex } from 'antd';
import { StatusPill } from '../../components/StatusPill';
import { colors } from '../../theme';

/** First letter for the round avatar; skips Thai leading vowels (เ แ โ ใ ไ) like the mockup. */
function initial(name: string): string {
  const letter = [...name.trim()].find((ch) => !'เแโใไ'.includes(ch));
  return (letter ?? '?').toUpperCase();
}

export function MemberAvatar({ name, size = 40 }: { name: string; size?: number }) {
  return (
    <Flex
      align="center"
      justify="center"
      aria-hidden
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: '#F0F1F3',
        color: colors.ink,
        fontWeight: 700,
        fontSize: size * 0.42,
        flex: 'none',
      }}
    >
      {initial(name)}
    </Flex>
  );
}

export function MemberStatusPill({ status }: { status: MemberStatus }) {
  return (
    <StatusPill tone={status === 'ACTIVE' ? 'success' : 'danger'}>
      {MemberStatusLabel[status]}
    </StatusPill>
  );
}
