import { Typography } from 'antd';
import type { ReactNode } from 'react';
import hero from '../../assets/login-hero.jpg';
import logo from '../../assets/logo.png';
import { colors } from '../../theme';
import './auth.css';

interface AuthShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}

/** Split layout from the login mockup: brand panel on the left, form card on the right. */
export function AuthShell({ title, subtitle, children, footer }: AuthShellProps) {
  return (
    <div className="gp-auth">
      <section className="gp-auth__brand" aria-hidden="true">
        <img src={logo} alt="" className="gp-auth__brand-logo" />
        <h1 className="gp-auth__headline">
          จัดการ<span style={{ color: colors.brandRed }}>แต้มและใบเสร็จ</span>
          <br />
          ในที่เดียว
        </h1>
        <p className="gp-auth__tagline">ระบบจัดการหลังบ้าน GET POINT</p>
        <img src={hero} alt="" className="gp-auth__hero" />
      </section>

      <main className="gp-auth__panel">
        <div className="gp-auth__card">
          <img src={logo} alt="GET POINT" className="gp-auth__card-logo" />
          <Typography.Title level={2} style={{ margin: 0, textAlign: 'center', fontWeight: 800 }}>
            {title}
          </Typography.Title>
          {subtitle && (
            <Typography.Paragraph
              type="secondary"
              style={{ textAlign: 'center', fontSize: 17, margin: '4px 0 28px' }}
            >
              {subtitle}
            </Typography.Paragraph>
          )}
          {children}
          {footer && <div className="gp-auth__footer">{footer}</div>}
        </div>
      </main>
    </div>
  );
}
