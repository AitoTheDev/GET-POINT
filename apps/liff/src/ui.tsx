import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import logo from './assets/logo.png';
import { BackIcon } from './icons';

/** Page frame: back arrow, logo, then the page title and subtitle (mockup image 65). */
export function Page({
  title,
  subtitle,
  back = '/',
  children,
  footer,
}: {
  title?: string;
  subtitle?: string;
  /** Where the back arrow goes; null = no arrow. */
  back?: string | null;
  children: ReactNode;
  /** Sticky bottom area (the main action). */
  footer?: ReactNode;
}) {
  const navigate = useNavigate();
  return (
    <div className="page">
      <header className="topbar">
        {back !== null && (
          <button
            type="button"
            className="icon-btn back"
            aria-label="ย้อนกลับ"
            onClick={() => navigate(back)}
          >
            <BackIcon />
          </button>
        )}
        <img src={logo} alt="GET POINT" className="topbar-logo" />
      </header>
      <main className="sheet">
        {title && <h1>{title}</h1>}
        {subtitle && <p className="subtitle">{subtitle}</p>}
        {children}
      </main>
      {footer && <div className="footer">{footer}</div>}
    </div>
  );
}

/** Dark pill button with the red edge (the mockups' main action). */
export function PillButton({
  children,
  icon,
  trailing,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon?: ReactNode; trailing?: ReactNode }) {
  return (
    <button type="button" className="pill" {...props}>
      {icon && <span className="pill-icon">{icon}</span>}
      <span className="pill-label">{children}</span>
      {trailing && <span className="pill-trailing">{trailing}</span>}
    </button>
  );
}

export function Card({
  title,
  children,
  extra,
}: {
  title?: ReactNode;
  children: ReactNode;
  extra?: ReactNode;
}) {
  return (
    <section className="card">
      {(title || extra) && (
        <div className="card-head">
          {title && <h2>{title}</h2>}
          {extra}
        </div>
      )}
      {children}
    </section>
  );
}

/** Full-screen result (mockups 66 and 67): big icon, title, text, one action. */
export function ResultScreen({
  tone,
  title,
  children,
  action,
}: {
  tone: 'success' | 'error';
  title: string;
  children?: ReactNode;
  action: ReactNode;
}) {
  return (
    <div className="page result" role={tone === 'error' ? 'alert' : 'status'}>
      <img src={logo} alt="GET POINT" className="result-logo" />
      <div className={`result-art ${tone}`} aria-hidden>
        <svg viewBox="0 0 120 120" width="150" height="150">
          <path d="M44 14 L50 30 L66 36 L50 42 L44 58 L38 42 L22 36 L38 30 Z" fill="#e3141b" />
          <path
            d="M40 38h40l10 10v52l-6-4-6 4-6-4-6 4-6-4-6 4-6-4-6 4-6-4V42a4 4 0 0 1 4-4z"
            fill="#fff"
            stroke="#3a3f4a"
            strokeWidth="4"
            strokeLinejoin="round"
          />
          <path
            d="M50 56h28M50 66h28M50 76h18"
            stroke="#9aa0aa"
            strokeWidth="5"
            strokeLinecap="round"
          />
          <circle cx="88" cy="88" r="17" fill={tone === 'success' ? '#22a45d' : '#e3141b'} />
          {tone === 'success' ? (
            <path
              d="M80 88l6 6 11-12"
              stroke="#fff"
              strokeWidth="5"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : (
            <path d="M88 79v11M88 96v1" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
          )}
        </svg>
      </div>
      <h1>{title}</h1>
      {children}
      <div className="result-action">{action}</div>
    </div>
  );
}

export function Spinner({ label = 'กำลังโหลด…' }: { label?: string }) {
  return (
    <div className="center" role="status">
      <span className="spinner" aria-hidden />
      <span>{label}</span>
    </div>
  );
}
