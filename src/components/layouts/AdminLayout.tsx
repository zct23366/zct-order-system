import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useAdmin } from '@/contexts/AdminContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Button } from '@/components/ui/button';
import { ShoppingBag, UtensilsCrossed, Monitor, BarChart2, CreditCard, LogOut, Printer } from 'lucide-react';

export default function AdminLayout() {
  const { logout } = useAdmin();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const tl = t.adminLayout;

  const navItems = [
    { to: '/admin/orders', label: tl.nav.orders, icon: ShoppingBag },
    { to: '/admin/menu', label: tl.nav.menu, icon: UtensilsCrossed },
    { to: '/admin/display', label: tl.nav.display, icon: Monitor },
    { to: '/admin/stats', label: tl.nav.stats, icon: BarChart2 },
    { to: '/admin/payment', label: tl.nav.payment, icon: CreditCard },
    { to: '/admin/print-station', label: tl.nav.printStation, icon: Printer },
  ];

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="flex app-page w-full bg-background">
      {/* ✨ 散景光斑 */}
      <div className="ambient-lights" aria-hidden="true">
        <div className="ambient-light bokeh--gold-mid" />
        <div className="ambient-light bokeh--cream-soft" />
        <div className="ambient-light bokeh--copper-small" />
      </div>

      {/* 侧边导航 */}
      <aside className="admin-nav hidden md:flex flex-col w-60 shrink-0 relative z-10">
        <div className="flex items-center gap-3 px-5 py-5" style={{ borderBottom: '1px solid rgba(200,150,100,0.08)' }}>
          <UtensilsCrossed className="w-5 h-5 text-primary" style={{ filter: 'drop-shadow(0 0 6px rgba(217,152,59,0.4))' }} />
          <span className="text-base text-foreground" style={{ fontFamily: "'Noto Serif SC','STSong',serif" }}>{tl.title}</span>
        </div>
        <nav className="flex-1 py-4 px-3 flex flex-col gap-1">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `admin-nav-item flex items-center gap-3 px-4 py-3.5 rounded-xl text-base ${isActive ? 'active' : ''}`
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>
        <div className="p-3" style={{ borderTop: '1px solid rgba(200,150,100,0.08)' }}>
          <Button variant="ghost" className="w-full justify-start gap-2 text-base text-muted-foreground hover:text-foreground" onClick={handleLogout}>
            <LogOut className="w-4 h-4" />
            {tl.logout}
          </Button>
        </div>
      </aside>

      {/* 主内容区 */}
      <div className="flex flex-col flex-1 min-w-0 relative z-10">
        {/* 移动端顶部栏 */}
        <header className="md:hidden flex items-center gap-3 px-4 py-3"
          style={{
            background: 'rgba(20,12,8,0.92)',
            backdropFilter: 'blur(20px)',
            borderBottom: '1px solid rgba(200,150,100,0.08)',
            paddingTop: 'calc(0.75rem + env(safe-area-inset-top))',
          }}>
          <UtensilsCrossed className="w-5 h-5 text-primary" />
          <span className="text-base flex-1 text-foreground" style={{ fontFamily: "'Noto Serif SC','STSong',serif" }}>{tl.title}</span>
          <Button variant="ghost" size="sm" onClick={handleLogout} className="gap-1 text-sm text-muted-foreground hover:text-foreground">
            <LogOut className="w-4 h-4" />
            {tl.logoutShort}
          </Button>
        </header>

        <main className="flex-1 min-w-0 overflow-x-hidden pb-20 md:pb-0">
          <Outlet />
        </main>

        {/* 移动端底部标签栏 */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 flex z-40"
          style={{
            background: 'hsl(20 28% 6% / 0.94)',
            backdropFilter: 'blur(24px)',
            borderTop: '1px solid rgba(200,150,100,0.08)',
            paddingBottom: 'env(safe-area-inset-bottom)',
          }}>
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex-1 flex flex-col items-center gap-1 py-3 text-xs transition-colors ${isActive ? 'text-primary' : 'text-muted-foreground hover:text-foreground'}`
              }
            >
              <Icon className="w-5 h-5" />
              {label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
