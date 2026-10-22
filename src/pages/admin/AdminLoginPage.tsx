import { useState, useRef } from 'react';
import { useNavigate, useLocation, Navigate } from 'react-router-dom';
import { UtensilsCrossed, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useAdmin } from '@/contexts/AdminContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { verifyAdminPassword } from '@/services/api';

export default function AdminLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const fromMenu = !!(location.state as { fromMenu?: boolean } | null)?.fromMenu;
  // 登录后回哪：AdminGuard 会把原目标塞进 ?next=，桌面出餐屏靠它落到 /admin/display?kiosk=1。
  // 只认后台路径，避免被构造成站外跳转。
  const nextParam = new URLSearchParams(location.search).get('next');
  const afterLogin = nextParam && /^\/admin(\/|\?|$)/.test(nextParam) ? nextParam : '/admin/orders';
  const { isLoggedIn, login } = useAdmin();
  const { t } = useLanguage();
  const tl = t.adminLogin;
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showLogin, setShowLogin] = useState(fromMenu);

  const clickCount = useRef(0);
  const clickTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (isLoggedIn) {
    return <Navigate to={afterLogin} replace />;
  }

  const handleClick = () => {
    clickCount.current += 1;
    if (clickTimer.current) clearTimeout(clickTimer.current);
    clickTimer.current = setTimeout(() => { clickCount.current = 0; }, 5000);
    if (clickCount.current >= 15) {
      clickCount.current = 0;
      if (clickTimer.current) clearTimeout(clickTimer.current);
      setShowLogin(true);
    }
  };

  const handleLogin = async () => {
    if (!password.trim()) return;
    setLoading(true);
    try {
      const ok = await verifyAdminPassword(password.trim());
      if (ok) {
        login();
        navigate(afterLogin, { replace: true });
      } else {
        toast.error(tl.error);
        setPassword('');
      }
    } catch {
      toast.error(tl.error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="app-page flex items-center justify-center relative overflow-hidden bg-background page-enter">
      <div className="ambient-lights" aria-hidden="true">
        <div className="ambient-light bokeh--gold-primary" />
        <div className="ambient-light bokeh--amber-large" />
        <div className="ambient-light bokeh--gold-mid" />
        <div className="ambient-light bokeh--cream-soft" />
        <div className="ambient-light bokeh--copper-small" />
      </div>

      <div className="absolute top-20 right-20 w-48 h-48 rounded-full z-0 tech-grid"
        style={{ border: '1px solid rgba(200,150,100,0.06)' }} />
      <div className="absolute bottom-24 left-16 w-32 h-32 rounded-full z-0"
        style={{ border: '1px solid rgba(200,150,100,0.05)' }} />
      <div className="absolute top-1/3 right-1/4 w-16 h-16 rounded-full z-0 animate-float"
        style={{ border: '1px solid rgba(217,152,59,0.08)', animationDelay: '-2s' }} />

      <div className="relative z-10 w-full max-w-[calc(100%-2rem)] md:max-w-sm">
        {!showLogin ? (
          <div className="flex flex-col items-center gap-12 text-center">
            <div className="flex flex-col items-center gap-5">
              <div className="relative">
                <div className="absolute inset-0 w-20 h-20 rounded-full animate-pulse-glow mx-auto"
                  style={{ background: 'rgba(217,152,59,0.06)', transform: 'scale(1.6)', marginLeft: '-50%', marginTop: '-50%', left: '50%', top: '50%' }} />
                <UtensilsCrossed className="w-14 h-14 text-primary relative z-10"
                  style={{ filter: 'drop-shadow(0 0 16px rgba(217,152,59,0.4))' }} />
              </div>
              <div>
                <h1 className="text-3xl text-foreground tracking-widest"
                  style={{ fontFamily: "'Noto Serif SC','STSong',serif", letterSpacing: '0.1em' }}>
                  {t.appTitle}
                </h1>
                <p className="text-sm text-muted-foreground mt-2 tracking-widest"
                  style={{ letterSpacing: '0.12em' }}>
                  {tl.kiosk}
                </p>
              </div>
              <p className="text-base text-muted-foreground mt-1">{tl.customerHint}</p>
            </div>
            <div className="tech-divider w-full" />
            <button
              className="glass-card relative flex flex-col items-center gap-4 px-12 py-8 rounded-2xl text-muted-foreground hover:text-foreground transition-all select-none cursor-default overflow-hidden group"
              onClick={handleClick}
            >
              <div className="w-14 h-14 rounded-full flex items-center justify-center transition-all group-hover:scale-105"
                style={{ background: 'rgba(217,152,59,0.06)', border: '1px solid rgba(217,152,59,0.15)' }}>
                <Lock className="w-6 h-6 text-primary opacity-60 group-hover:opacity-90 transition-opacity" />
              </div>
              <span className="text-sm tracking-wider" style={{ letterSpacing: '0.08em' }}>{tl.adminEntrance}</span>
            </button>
          </div>
        ) : (
          <div className="glass-card rounded-2xl p-8 flex flex-col gap-6 overflow-hidden animate-fade-in-scale">
            <div className="flex flex-col items-center gap-3 text-center">
              <div className="w-16 h-16 rounded-full flex items-center justify-center animate-pulse-glow"
                style={{ background: 'rgba(217,152,59,0.10)', border: '1px solid rgba(217,152,59,0.35)' }}>
                <Lock className="w-7 h-7 text-primary" />
              </div>
              <h2 className="text-xl text-foreground" style={{ fontFamily: "'Noto Serif SC','STSong',serif" }}>
                {tl.title}
              </h2>
              <p className="text-sm text-muted-foreground">{tl.subtitle}</p>
            </div>
            <div className="flex flex-col gap-3">
              <Input
                type="password"
                placeholder={tl.passwordPlaceholder}
                value={password}
                onChange={e => setPassword(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleLogin()}
                className="h-13 px-4 text-base placeholder:text-muted-foreground"
                style={{ background: 'rgba(234,215,178,0.04)', border: '1px solid rgba(200,150,100,0.14)', borderRadius: '14px' }}
                autoFocus
              />
              <Button
                className="h-13 w-full bg-primary text-primary-foreground hover:bg-secondary text-base font-medium rounded-2xl btn-press"
                style={{ boxShadow: '0 4px 16px rgba(8,4,2,0.30), 0 0 16px rgba(217,152,59,0.08)' }}
                onClick={handleLogin}
                disabled={loading}
              >
                {loading ? tl.submitting : tl.submit}
              </Button>
              <Button variant="ghost" className="text-muted-foreground hover:text-foreground text-base btn-press"
                onClick={() => { setShowLogin(false); setPassword(''); }}>
                {t.checkout.back}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
