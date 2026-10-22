import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAdmin } from '@/contexts/AdminContext';
import type { ReactNode } from 'react';

interface Props {
  children?: ReactNode;
}

export default function AdminGuard({ children }: Props) {
  const { isLoggedIn } = useAdmin();
  const location = useLocation();
  if (!isLoggedIn) {
    // 带上原目标，登录后回到这一页——桌面出餐屏直接从 /admin/display?kiosk=1 启动，
    // 登完就该回到出餐展示，而不是统一跳到订单管理。
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/admin/login?next=${next}`} replace />;
  }
  return children ? <>{children}</> : <Outlet />;
}
