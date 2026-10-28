import { ReloadOutlined } from '@ant-design/icons';
import { Button, Result } from 'antd';
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface State {
  failed: boolean;
}

/**
 * If a page crashes while rendering, show a friendly screen instead of a blank one.
 * Give it key={pathname} so moving to another page starts fresh.
 */
export class PageErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page crashed', error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <Result
        status="error"
        title="หน้านี้แสดงผลไม่สำเร็จ"
        subTitle="เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาโหลดหน้าใหม่ หากยังพบปัญหาให้แจ้งผู้ดูแลระบบ"
        extra={
          <Button type="primary" icon={<ReloadOutlined />} onClick={() => window.location.reload()}>
            โหลดหน้าใหม่
          </Button>
        }
      />
    );
  }
}
