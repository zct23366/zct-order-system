import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Share, SquareArrowOutUpRight, X } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useStandalone } from '@/hooks/use-standalone';
import { isMobileDevice } from '@/lib/standalone';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

/** 「不再提示」的记忆键：同一台 iPad 关掉一次就不再出现。 */
const DISMISS_KEY = 'zct-order:a2hs-dismissed';

/** 结账、付款、下单成功这些流程页不弹；后台运营页面也不弹。 */
const HIDDEN_PATHS = [/^\/admin/, /^\/checkout/, /^\/payment/, /^\/order-success/];

/** Chrome / Android 的安装事件（Safari 没有，iPadOS 上只能走引导）。 */
type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
};

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    // iOS 无痕模式下 localStorage 会抛错，当作没关过处理，不影响点餐
    return false;
  }
}

function persistDismissed(): void {
  try {
    window.localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    // 同上：存不下就只在本次会话里保持隐藏
  }
}

/**
 * 「添加到主屏幕」引导。
 *
 * iPadOS 的 Safari 不提供安装接口，独窗只能由用户手动添加，所以这里给一条引导：
 * 浏览器态下左下角浮一个胶囊，点开是三步说明；独立窗口里自己消失。
 * Chrome / Android 有 beforeinstallprompt 时，点胶囊直接调原生安装。
 */
export default function AddToHomeScreen() {
  const { t } = useLanguage();
  const { standalone, ios } = useStandalone();
  const { pathname } = useLocation();
  const [dismissed, setDismissed] = useState(readDismissed);
  const [mobileDevice] = useState(isMobileDevice);
  const [open, setOpen] = useState(false);
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);

  const copy = t.pwa;

  useEffect(() => {
    const onPrompt = (event: Event) => {
      // 有原生安装能力时拦下来，改由胶囊触发，避免浏览器自带的迷你提示条
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  const onProcessPage = HIDDEN_PATHS.some(pattern => pattern.test(pathname));
  // 原生安装按钮只在手机上给：桌面浏览器（收银台 kiosk）不希望角落里冒出安装提示
  const canInstallNatively = installEvent !== null && mobileDevice;

  if (standalone || dismissed || onProcessPage || (!ios && !canInstallNatively)) return null;

  const dismiss = () => {
    persistDismissed();
    setDismissed(true);
    setOpen(false);
  };

  const install = () => {
    void installEvent?.prompt();
    setInstallEvent(null);
    setOpen(false);
  };

  return (
    <>
      <div
        className="fixed z-30 left-4 flex items-center rounded-full"
        style={{
          bottom: 'calc(16px + env(safe-area-inset-bottom))',
          background: 'rgba(20,14,10,0.92)',
          border: '1px solid rgba(217,152,59,0.32)',
          boxShadow: '0 6px 22px rgba(8,4,2,0.5)',
          backdropFilter: 'blur(18px)',
        }}
      >
        <button
          type="button"
          data-testid="add-to-home-screen"
          onClick={() => (canInstallNatively ? install() : setOpen(true))}
          className="flex items-center gap-2 pl-3.5 pr-2 py-2 text-sm text-foreground/85 transition-colors hover:text-foreground"
        >
          <SquareArrowOutUpRight className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
          {canInstallNatively ? copy.install : copy.pill}
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label={copy.dismiss}
          className="w-9 h-9 mr-1 flex items-center justify-center rounded-full text-muted-foreground/70 hover:text-foreground transition-colors"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-[calc(100%-2rem)] sm:max-w-md"
          style={{ background: 'hsl(20 26% 8%)', border: '1px solid rgba(217,152,59,0.18)' }}
        >
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground">
              <Share className="w-5 h-5 text-primary" />
              {copy.title}
            </DialogTitle>
            <DialogDescription className="text-muted-foreground leading-relaxed">
              {copy.intro}
            </DialogDescription>
          </DialogHeader>

          <ol className="mt-1 flex flex-col gap-3">
            {[copy.stepShare, copy.stepAdd, copy.stepConfirm].map((step, index) => (
              <li key={step} className="flex items-start gap-3">
                <span
                  className="shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-xs text-primary"
                  style={{ background: 'rgba(217,152,59,0.12)', border: '1px solid rgba(217,152,59,0.3)' }}
                  aria-hidden="true"
                >
                  {index + 1}
                </span>
                <span className="text-sm text-foreground/85 leading-relaxed">{step}</span>
              </li>
            ))}
          </ol>

          <p className="text-xs text-muted-foreground/70 leading-relaxed">{copy.safariHint}</p>

          <div className="flex items-center justify-between gap-3 mt-1">
            <button
              type="button"
              onClick={dismiss}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              {copy.dismiss}
            </button>
            <Button variant="secondary" className="h-11 px-6" onClick={() => setOpen(false)}>
              {copy.gotIt}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
