import { Button, Result } from 'antd';
import { useNavigate } from 'react-router-dom';

export function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <Result
      status="404"
      title="ไม่พบหน้าที่ต้องการ"
      extra={
        <Button type="primary" onClick={() => navigate('/')}>
          กลับไปหน้า Dashboard
        </Button>
      }
    />
  );
}
