import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import IntersectObserver from '@/components/common/IntersectObserver';
import AddToHomeScreen from '@/components/common/AddToHomeScreen';
import { Toaster } from '@/components/ui/sonner';
import { AdminProvider } from '@/contexts/AdminContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import AdminGuard from '@/components/common/AdminGuard';
import UserLayout from '@/components/layouts/UserLayout';
import AdminLayout from '@/components/layouts/AdminLayout';

const LanguageSelectPage = lazy(() => import('./pages/user/LanguageSelectPage'));
const MenuPage = lazy(() => import('./pages/user/MenuPage'));
const CheckoutPage = lazy(() => import('./pages/user/CheckoutPage'));
const PaymentPage = lazy(() => import('./pages/user/PaymentPage'));
const OrderSuccessPage = lazy(() => import('./pages/user/OrderSuccessPage'));
const AdminLoginPage = lazy(() => import('./pages/admin/AdminLoginPage'));
const AdminOrdersPage = lazy(() => import('./pages/admin/AdminOrdersPage'));
const AdminMenuPage = lazy(() => import('./pages/admin/AdminMenuPage'));
const AdminDisplayPage = lazy(() => import('./pages/admin/AdminDisplayPage'));
const AdminStatsPage = lazy(() => import('./pages/admin/AdminStatsPage'));
const AdminPaymentPage = lazy(() => import('./pages/admin/AdminPaymentPage'));
const AdminPrintStationPage = lazy(() => import('./pages/admin/AdminPrintStationPage'));

const Loading = () => (
  <div className="flex items-center justify-center min-h-screen bg-background">
    <div className="text-muted-foreground text-sm animate-pulse">加载中…</div>
  </div>
);

const App: React.FC = () => {
  return (
    <LanguageProvider>
      <Router>
        <AdminProvider>
          <IntersectObserver />
          <Suspense fallback={<Loading />}>
            <Routes>
              {/* 语言选择入口 */}
              <Route path="/lang" element={<LanguageSelectPage />} />

              {/* 用户端 */}
              <Route element={<UserLayout />}>
                <Route path="/" element={<MenuPage />} />
                <Route path="/checkout" element={<CheckoutPage />} />
                <Route path="/payment" element={<PaymentPage />} />
                <Route path="/order-success" element={<OrderSuccessPage />} />
              </Route>

              {/* 管理员登录 */}
              <Route path="/admin/login" element={<AdminLoginPage />} />

              {/* 管理员后台 */}
              <Route element={<AdminGuard><AdminLayout /></AdminGuard>}>
                <Route path="/admin" element={<Navigate to="/admin/orders" replace />} />
                <Route path="/admin/orders" element={<AdminOrdersPage />} />
                <Route path="/admin/menu" element={<AdminMenuPage />} />
                <Route path="/admin/display" element={<AdminDisplayPage />} />
                <Route path="/admin/stats" element={<AdminStatsPage />} />
                <Route path="/admin/payment" element={<AdminPaymentPage />} />
                <Route path="/admin/print-station" element={<AdminPrintStationPage />} />
              </Route>

              <Route path="*" element={<Navigate to="/lang" replace />} />
            </Routes>
          </Suspense>
          <Toaster />
          {/* iPadOS 无边框独立运行：浏览器态才提示「添加到主屏幕」，独窗里自动隐藏 */}
          <AddToHomeScreen />
        </AdminProvider>
      </Router>
    </LanguageProvider>
  );
};

export default App;
