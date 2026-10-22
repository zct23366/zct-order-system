import { useState, useCallback, useEffect } from 'react';
import { Upload, X, Check, RefreshCw, Printer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { usePaymentConfig, usePrintConfig } from '@/hooks/useData';
import { updatePaymentConfig, uploadImage, fetchDefaultLang, updateDefaultLang, updatePrintConfig } from '@/services/api';
import { PAYMENT_METHOD_LABELS } from '@/types/types';
import type { PaymentMethod, RateKey } from '@/types/types';
import { useLanguage } from '@/contexts/LanguageContext';
import { LANG_LABELS, LANG_EMOJIS, type Lang } from '@/i18n/translations';

type QRKey = 'wechat_qrcode_url' | 'alipay_qrcode_url' | 'paypay_qrcode_url';
type EnabledKey = 'wechat_enabled' | 'alipay_enabled' | 'paypay_enabled' | 'cash_enabled';

export default function AdminPaymentPage() {
  const { config, loading, reload } = usePaymentConfig();
  const { config: printCfg, reload: reloadPrint } = usePrintConfig();
  const { t } = useLanguage();
  const tp = t.adminPayment;
  const [uploadingKey, setUploadingKey] = useState<QRKey | null>(null);
  const [uploadPct, setUploadPct] = useState(0);
  const [newPassword, setNewPassword] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);
  const [rateDrafts, setRateDrafts] = useState<Record<string, string>>({});
  // 打印配置本地草稿
  const [printW, setPrintW] = useState('');
  const [printH, setPrintH] = useState('');
  const [savingPrint, setSavingPrint] = useState(false);
  // 默认语言
  const [defaultLang, setDefaultLang] = useState<Lang>('zh');
  const [savingLang, setSavingLang] = useState(false);
  const LANGS: Lang[] = ['zh', 'ja', 'en', 'ko'];

  useEffect(() => {
    fetchDefaultLang().then(l => setDefaultLang(l as Lang)).catch(() => {});
  }, []);

  // 同步打印配置草稿
  useEffect(() => {
    setPrintW(String(printCfg.print_width_mm));
    setPrintH(String(printCfg.print_height_mm));
  }, [printCfg.print_width_mm, printCfg.print_height_mm]);

  const handlePrintToggle = async (key: 'print_auto', value: boolean) => {
    try {
      await updatePrintConfig({ [key]: value });
      toast.success('已保存');
      reloadPrint();
    } catch { toast.error('保存失败'); }
  };

  const handlePrintCopies = async (val: number) => {
    if (val < 1 || val > 5) return;
    try {
      await updatePrintConfig({ print_copies: val });
      toast.success('已保存');
      reloadPrint();
    } catch { toast.error('保存失败'); }
  };

  const handleSavePaperSize = async () => {
    const w = parseInt(printW, 10);
    const h = parseInt(printH, 10);
    if (isNaN(w) || isNaN(h) || w < 20 || h < 20) {
      toast.error('纸张尺寸最小 20mm');
      return;
    }
    setSavingPrint(true);
    try {
      await updatePrintConfig({ print_width_mm: w, print_height_mm: h });
      toast.success('纸张尺寸已保存');
      reloadPrint();
    } catch { toast.error('保存失败'); }
    finally { setSavingPrint(false); }
  };

  const PAYMENT_CONFIG: {
    method: PaymentMethod;
    label: string;
    enabledKey: EnabledKey;
    qrKey?: QRKey;
    rateKey: RateKey;
  }[] = [
    { method: 'wechat', label: tp.wechat, enabledKey: 'wechat_enabled', qrKey: 'wechat_qrcode_url', rateKey: 'wechat_rate' },
    { method: 'alipay', label: tp.alipay, enabledKey: 'alipay_enabled', qrKey: 'alipay_qrcode_url', rateKey: 'alipay_rate' },
    { method: 'paypay', label: tp.paypay, enabledKey: 'paypay_enabled', qrKey: 'paypay_qrcode_url', rateKey: 'paypay_rate' },
    { method: 'cash', label: tp.cash, enabledKey: 'cash_enabled', rateKey: 'cash_rate' },
  ];

  const getRateDraft = (rateKey: RateKey): string => {
    if (rateKey in rateDrafts) return rateDrafts[rateKey];
    return config ? String(config[rateKey] ?? 1) : '1';
  };

  const handleRateBlur = async (rateKey: RateKey) => {
    if (!config) return;
    const raw = rateDrafts[rateKey];
    if (raw === undefined) return;
    const val = parseFloat(raw);
    if (isNaN(val) || val <= 0) {
      toast.error(tp.rateInvalid ?? '汇率必须为正数');
      setRateDrafts(d => ({ ...d, [rateKey]: String(config[rateKey] ?? 1) }));
      return;
    }
    const rounded = Math.round(val * 10000) / 10000;
    try {
      await updatePaymentConfig(config.id, { [rateKey]: rounded });
      toast.success(tp.saveSuccess);
      setRateDrafts(d => { const next = { ...d }; delete next[rateKey]; return next; });
      reload();
    } catch {
      toast.error(tp.saveFailed);
    }
  };

  const handleToggle = async (enabledKey: EnabledKey, value: boolean) => {
    if (!config) return;
    try {
      await updatePaymentConfig(config.id, { [enabledKey]: value });
      toast.success(tp.saveSuccess);
      reload();
    } catch {
      toast.error(tp.saveFailed);
    }
  };

  const handleQRUpload = useCallback(async (qrKey: QRKey, file: File) => {
    if (!file.type.startsWith('image/')) {
      toast.error(tp.uploadFailed);
      return;
    }
    if (!config) return;
    setUploadingKey(qrKey);
    setUploadPct(0);
    try {
      const url = await uploadImage('payment-qrcodes', file, pct => setUploadPct(pct));
      await updatePaymentConfig(config.id, { [qrKey]: url });
      toast.success(tp.uploadSuccess);
      reload();
    } catch {
      toast.error(tp.uploadFailed);
    } finally {
      setUploadingKey(null);
    }
  }, [config, reload, tp]);

  const handleRemoveQR = async (qrKey: QRKey) => {
    if (!config) return;
    try {
      await updatePaymentConfig(config.id, { [qrKey]: null });
      toast.success(tp.saveSuccess);
      reload();
    } catch {
      toast.error(tp.saveFailed);
    }
  };

  const handleSavePassword = async () => {
    if (!newPassword.trim()) return;
    if (newPassword.trim().length < 6) { toast.warning(tp.passwordShort); return; }
    if (!config) return;
    setSavingPwd(true);
    try {
      const { supabase } = await import('@/db/supabase');
      const { error } = await supabase.from('admin_config').update({ password: newPassword.trim() }).neq('id', '');
      if (error) throw error;
      toast.success(tp.passwordChanged);
      setNewPassword('');
    } catch {
      toast.error(tp.saveFailed);
    } finally {
      setSavingPwd(false);
    }
  };

  const handleSaveLang = async (l: Lang) => {
    setDefaultLang(l);
    setSavingLang(true);
    try {
      await updateDefaultLang(l);
      toast.success(tp.defaultLangSaved ?? '默认语言已保存');
    } catch (error) {
      // 失败原因大多是请求被拒（例如缺少 WHERE 的 400），打个日志方便现场排查
      console.error('[default-lang] 保存失败', error);
      toast.error(tp.saveFailed);
    } finally {
      setSavingLang(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64 text-muted-foreground animate-pulse text-sm">
        {tp.save}…
      </div>
    );
  }

  if (!config) {
    return (
      <div className="p-6 flex items-center justify-center h-64 text-muted-foreground text-sm">
        {tp.saveFailed}
      </div>
    );
  }

  return (
    <div className="p-5 md:p-7 flex flex-col gap-6 page-enter">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl text-foreground" style={{ fontFamily: "'Noto Serif SC','STSong',serif" }}>{tp.title}</h1>
        <Button variant="ghost" size="icon" onClick={reload} className="h-10 w-10 text-muted-foreground hover:text-foreground">
          <RefreshCw className="w-5 h-5" />
        </Button>
      </div>

      {/* 各支付方式 */}
      <div className="flex flex-col gap-4">
      {PAYMENT_CONFIG.map(({ method, label, enabledKey, qrKey, rateKey }) => {
          const enabled = config[enabledKey] as boolean;
          const qrUrl = qrKey ? (config[qrKey] as string | null) : null;
          const isUploading = uploadingKey === qrKey;
          const rateVal = getRateDraft(rateKey);

          return (
            <div key={method} className="glass-card relative rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(234,215,178,0.07)' }}>
                <span className="text-base font-medium text-foreground">{label}</span>
                <Switch checked={enabled} onCheckedChange={v => handleToggle(enabledKey, v)} />
              </div>
              {/* 汇率 */}
              <div className="px-5 pt-4 pb-2 flex items-center gap-3">
                <span className="text-sm text-muted-foreground shrink-0">{tp.rate ?? '汇率'}</span>
                <Input
                  type="number"
                  min="0.0001"
                  step="0.01"
                  value={rateVal}
                  onChange={e => setRateDrafts(d => ({ ...d, [rateKey]: e.target.value }))}
                  onBlur={() => handleRateBlur(rateKey)}
                  className="h-9 w-28 px-3 text-sm font-mono"
                  style={{ background: 'rgba(234,215,178,0.05)', border: '1px solid rgba(234,215,178,0.12)' }}
                />
                <span className="text-xs text-muted-foreground">{tp.rateHint ?? '× 标价 = 实付'}</span>
              </div>
              {qrKey && (
                <div className="px-5 py-4 flex flex-col gap-3">
                  <div className="flex items-center gap-4">
                    <div className="w-24 h-24 rounded-xl flex items-center justify-center overflow-hidden shrink-0 relative"
                      style={{ border: '1px solid rgba(234,215,178,0.12)', background: 'rgba(234,215,178,0.03)' }}>
                      {qrUrl ? (
                        <>
                          <img src={qrUrl} alt={`${label} QR`} className="w-full h-full object-contain" />
                          <button className="absolute top-1 right-1 bg-black/50 text-white rounded-full p-1 hover:bg-black/70"
                            onClick={() => handleRemoveQR(qrKey)}>
                            <X className="w-3 h-3" />
                          </button>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground text-center leading-tight px-2">{tp.qrcodeHint}</span>
                      )}
                    </div>
                    <div className="flex flex-col gap-2.5 flex-1">
                      <p className="text-sm text-muted-foreground">{qrUrl ? tp.qrcodeUpload : tp.qrcodeHint}</p>
                      <Label htmlFor={`qr-${method}`}
                        className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl cursor-pointer hover:text-foreground transition-colors w-fit text-sm"
                        style={{ border: '1px solid rgba(234,215,178,0.12)', background: 'rgba(234,215,178,0.04)', color: 'hsl(var(--foreground))' }}>
                        <Upload className="w-4 h-4" />
                        {qrUrl ? tp.qrcodeUpload : tp.qrcodeUpload}
                      </Label>
                      <input id={`qr-${method}`} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                        onChange={e => e.target.files?.[0] && handleQRUpload(qrKey, e.target.files[0])} />
                      {isUploading && <Progress value={uploadPct} className="h-1.5 w-28" />}
                      {qrUrl && !isUploading && (
                        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                          <Check className="w-3.5 h-3.5 text-primary" />
                          {tp.uploadSuccess}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* 打印设置 */}
      <div className="glass-card relative rounded-2xl overflow-hidden">
        <div className="px-5 py-4 flex items-center gap-3" style={{ borderBottom: '1px solid rgba(234,215,178,0.07)' }}>
          <Printer className="w-4 h-4 text-primary" />
          <span className="text-base font-medium text-foreground">打印机设置</span>
        </div>

        {/* 自动打印开关 */}
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(234,215,178,0.05)' }}>
          <div className="flex flex-col gap-0.5">
            <span className="text-sm text-foreground">新订单自动打印</span>
            <span className="text-xs text-muted-foreground">PC 管理后台检测到新订单时自动弹出打印</span>
          </div>
          <Switch checked={printCfg.print_auto} onCheckedChange={v => handlePrintToggle('print_auto', v)} />
        </div>

        {/* 打印份数 */}
        <div className="px-5 py-4 flex items-center gap-4" style={{ borderBottom: '1px solid rgba(234,215,178,0.05)' }}>
          <span className="text-sm text-foreground shrink-0">打印份数</span>
          <div className="flex items-center gap-2">
            <button
              className="w-8 h-8 rounded-lg flex items-center justify-center text-lg font-medium transition-colors"
              style={{ border: '1px solid rgba(234,215,178,0.15)', background: 'rgba(234,215,178,0.04)' }}
              onClick={() => handlePrintCopies(printCfg.print_copies - 1)}
              disabled={printCfg.print_copies <= 1}
            >−</button>
            <span className="w-8 text-center font-mono text-base">{printCfg.print_copies}</span>
            <button
              className="w-8 h-8 rounded-lg flex items-center justify-center text-lg font-medium transition-colors"
              style={{ border: '1px solid rgba(234,215,178,0.15)', background: 'rgba(234,215,178,0.04)' }}
              onClick={() => handlePrintCopies(printCfg.print_copies + 1)}
              disabled={printCfg.print_copies >= 5}
            >+</button>
          </div>
        </div>

        {/* 纸张尺寸 */}
        <div className="px-5 py-4 flex flex-col gap-3">
          <span className="text-sm text-foreground">纸张尺寸（毫米）</span>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground shrink-0">宽</span>
              <Input
                type="number" min={20} max={200}
                value={printW}
                onChange={e => setPrintW(e.target.value)}
                className="h-9 w-20 px-3 text-sm font-mono text-center"
                style={{ background: 'rgba(234,215,178,0.05)', border: '1px solid rgba(234,215,178,0.12)' }}
              />
            </div>
            <span className="text-muted-foreground">×</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground shrink-0">高</span>
              <Input
                type="number" min={20} max={400}
                value={printH}
                onChange={e => setPrintH(e.target.value)}
                className="h-9 w-20 px-3 text-sm font-mono text-center"
                style={{ background: 'rgba(234,215,178,0.05)', border: '1px solid rgba(234,215,178,0.12)' }}
              />
            </div>
            <Button size="sm" className="h-9 px-4 bg-primary text-primary-foreground hover:bg-secondary text-sm shrink-0"
              onClick={handleSavePaperSize} disabled={savingPrint}>
              {savingPrint ? '保存中…' : '保存'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">默认 50 × 70 mm（热敏票据纸）。如使用 80mm 热敏纸请改为 80 × 100</p>

          {/* 纸张预览 */}
          <div className="flex items-start gap-4 pt-1">
            <div
              className="shrink-0 bg-white rounded border"
              style={{
                width: `${Math.round(parseInt(printW || '50') * 1.5)}px`,
                height: `${Math.round(parseInt(printH || '70') * 1.5)}px`,
                maxWidth: '150px',
                maxHeight: '210px',
                minWidth: '30px',
                minHeight: '30px',
                border: '1.5px dashed rgba(217,152,59,0.45)',
                background: 'rgba(255,255,255,0.06)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '3px',
              }}
            >
              <div className="w-3/4 h-1 rounded-full" style={{ background: 'rgba(217,152,59,0.3)' }} />
              <div className="w-2/4 h-0.5 rounded-full" style={{ background: 'rgba(217,152,59,0.2)' }} />
              <div className="w-3/4 h-0.5 rounded-full" style={{ background: 'rgba(217,152,59,0.15)' }} />
              <div className="w-3/4 h-0.5 rounded-full" style={{ background: 'rgba(217,152,59,0.15)' }} />
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed pt-1">
              预览：{printW || 50} × {printH || 70} mm<br />
              比例仅供参考，实际以打印机纸张为准
            </p>
          </div>
        </div>
      </div>

      {/* 默认语言 */}
      <div className="glass-card relative rounded-2xl overflow-hidden">
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(234,215,178,0.07)' }}>
          <span className="text-base font-medium text-foreground">{tp.defaultLang ?? '默认语言'}</span>
          {savingLang && <span className="text-xs text-muted-foreground animate-pulse">{tp.saving}</span>}
        </div>
        <div className="px-5 py-4 grid grid-cols-2 gap-3">
          {LANGS.map(l => {
            const active = defaultLang === l;
            return (
              <button
                key={l}
                onClick={() => handleSaveLang(l)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl transition-all btn-press"
                style={{
                  background: active ? 'rgba(217,152,59,0.12)' : 'rgba(234,215,178,0.04)',
                  border: active ? '1px solid rgba(217,152,59,0.45)' : '1px solid rgba(234,215,178,0.10)',
                }}
              >
                <span className="text-xl leading-none">{LANG_EMOJIS[l]}</span>
                <span className={`text-sm ${active ? 'text-primary font-medium' : 'text-foreground/70'}`}>
                  {LANG_LABELS[l]}
                </span>
                {active && <span className="ml-auto w-2 h-2 rounded-full bg-primary shrink-0" />}
              </button>
            );
          })}
        </div>
        <p className="px-5 pb-4 text-xs text-muted-foreground">{tp.defaultLangHint ?? '顾客打开页面时将默认显示该语言'}</p>
      </div>

      {/* 修改密码 */}
      <div className="glass-card relative rounded-2xl overflow-hidden">
        <div className="px-5 py-4" style={{ borderBottom: '1px solid rgba(234,215,178,0.07)' }}>
          <span className="text-base font-medium text-foreground">{tp.passwordSection}</span>
        </div>
        <div className="px-5 py-5 flex flex-col gap-4">
          <div className="flex gap-3">
            <Input
              type="password"
              placeholder={tp.newPassword}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              className="flex-1 h-12 px-4 text-base placeholder:text-muted-foreground"
              style={{ background: 'rgba(234,215,178,0.05)', border: '1px solid rgba(234,215,178,0.12)' }}
              onKeyDown={e => e.key === 'Enter' && handleSavePassword()}
            />
            <Button className="shrink-0 h-12 px-5 bg-primary text-primary-foreground hover:bg-secondary text-base"
              onClick={handleSavePassword} disabled={savingPwd}>
              {savingPwd ? tp.saving : tp.changePassword}
            </Button>
          </div>
        </div>
      </div>

      <p className="text-sm text-muted-foreground text-center">
        {PAYMENT_METHOD_LABELS.wechat && ''}使用静态二维码，系统不生成动态金额二维码
      </p>
    </div>
  );
}
