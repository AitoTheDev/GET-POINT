import { Link } from 'react-router-dom';
import logo from '../assets/logo.png';
import {
  CardIcon,
  CheckIcon,
  ChevronIcon,
  CoinsIcon,
  GiftIcon,
  HelpIcon,
  ReceiptIcon,
} from '../icons';
import { useReady } from '../sessionContext';

/**
 * Start page. Same choices as the LINE rich menu (mockup image 64), so the app also works
 * when opened directly; the rich-menu buttons link straight to /register, /scan, /points…
 */
export function HomePage() {
  const { displayName, member, config, switchMockUser } = useReady();
  return (
    <div className="page home">
      <header className="home-head">
        <img src={logo} alt="GET POINT" className="home-logo" />
        <p className="tagline">ทุกใบเสร็จ เปลี่ยนเป็นแต้มและสิทธิพิเศษ</p>
        {displayName && <p className="hello">สวัสดี {displayName}</p>}
      </header>

      <div className="steps">
        {member ? (
          <div className="step done">
            <span className="step-no">1</span>
            <strong>สมาชิกแล้ว</strong>
            <span className="step-sub">รหัส {member.code}</span>
            <span className="step-art" aria-hidden>
              <CheckIcon />
            </span>
          </div>
        ) : (
          <Link to="/register" className="step">
            <span className="step-no">1</span>
            <strong>สมัครสมาชิก</strong>
            <span className="step-sub">สมัครสมาชิกก่อนเริ่มใช้งาน</span>
            <span className="step-art" aria-hidden>
              <CardIcon />
            </span>
            <span className="step-go">
              สมัครเลย <ChevronIcon />
            </span>
          </Link>
        )}
        <Link to="/scan" className="step">
          <span className="step-no">2</span>
          <strong>สแกนใบเสร็จ</strong>
          <span className="step-sub">รับแต้มจากทุกการใช้จ่าย</span>
          <span className="step-art" aria-hidden>
            <ReceiptIcon />
          </span>
          <span className="step-go">
            สแกนเลย <ChevronIcon />
          </span>
        </Link>
      </div>

      <nav className="tiles" aria-label="เมนูอื่น">
        <Link to="/privileges" className="tile">
          <GiftIcon /> สิทธิพิเศษ <ChevronIcon />
        </Link>
        <Link to="/points" className="tile">
          <CoinsIcon /> คะแนนของฉัน <ChevronIcon />
        </Link>
        <Link to="/help" className="tile">
          <HelpIcon /> วิธีใช้งาน <ChevronIcon />
        </Link>
      </nav>

      {config.lineMode === 'mock' && (
        <p className="dev-note">
          โหมดทดสอบ (LINE จำลอง) ·{' '}
          <button type="button" className="link-btn" onClick={switchMockUser}>
            เปลี่ยนผู้ใช้ทดสอบ
          </button>
        </p>
      )}
    </div>
  );
}
