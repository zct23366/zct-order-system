import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, X } from 'lucide-react';
import type { ComboGroup, ComboOption, Lang, Product } from '@/types/types';
import { getLocalizedGroupTitle, getLocalizedName } from '@/types/types';
import type { ComboText } from '@/i18n/comboText';

interface ComboPageProps {
  product: Product;
  groups: ComboGroup[];
  options: ComboOption[];
  text: ComboText;
  lang: Lang;
  onClose: () => void;
  /** 选完后回传每一项的选择，由调用方写进购物车 */
  onConfirm: (picked: ComboOption[]) => void;
}

/**
 * 价格标签：每组第一个选项（定价基准）显示「已含」，
 * 其余一律显示 +¥N——同价或更便宜的也显示 +¥0，不再统统写成「已含」。
 */
function deltaLabel(delta: number, isAnchor: boolean, text: ComboText): string {
  if (isAnchor) return text.included;
  return `+¥${delta.toFixed(0)}`;
}

/**
 * 套餐二级页面：按分组逐步选择，每组 2 列卡片。
 * 选中后高亮 380ms 再过渡到下一组；全部选完展示已选清单与合计。
 */
export default function ComboPage({ product, groups, options, text, lang, onClose, onConfirm }: ComboPageProps) {
  const [step, setStep] = useState(0);
  const [animKey, setAnimKey] = useState(0);
  const [picks, setPicks] = useState<Record<string, ComboOption>>({});

  const total = useMemo(
    () => product.price + Object.values(picks).reduce((sum, o) => sum + o.price_delta, 0),
    [picks, product.price],
  );

  const done = step >= groups.length;
  const current = done ? null : groups[step];
  const currentOptions = useMemo(
    () => (current ? options.filter(o => o.group_id === current.id) : []),
    [current, options],
  );
  const allPicked = groups.every(g => !!picks[g.id]);

  /** 每组第一个选项是定价基准，显示「已含」；其余显示 +¥N（含 +¥0） */
  const anchorIdOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const g of groups) {
      const first = options.filter(o => o.group_id === g.id).sort((a, b) => a.sort_order - b.sort_order)[0];
      if (first) map.set(g.id, first.id);
    }
    return map;
  }, [groups, options]);

  // 回到这一步时清掉该组之后的选择，避免出现「已选但看不到」的错位
  useEffect(() => {
    if (step >= groups.length) return;
    const stale = groups.slice(step + 1).map(g => g.id);
    if (stale.some(id => picks[id])) {
      setPicks(prev => {
        const next = { ...prev };
        for (const id of stale) delete next[id];
        return next;
      });
    }
  }, [step, groups, picks]);

  const choose = (option: ComboOption) => {
    if (!current) return;
    setPicks(prev => ({ ...prev, [current.id]: option }));
    window.setTimeout(() => {
      setStep(s => Math.min(s + 1, groups.length));
      setAnimKey(k => k + 1);
    }, 380);
  };

  const goBack = () => {
    if (step === 0) {
      onClose();
      return;
    }
    setStep(s => Math.max(0, s - 1));
    setAnimKey(k => k + 1);
  };

  const confirm = () => {
    onConfirm(groups.map(g => picks[g.id]).filter(Boolean));
  };

  const pickedList = groups.map(g => ({ group: g, option: picks[g.id] })).filter(x => !!x.option);

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center"
      style={{
        background: 'hsl(20 26% 5% / 0.72)',
        backdropFilter: 'blur(18px) saturate(110%)',
        WebkitBackdropFilter: 'blur(18px) saturate(110%)',
        animation: 'fadeIn 0.22s ease',
      }}>
      <div className="relative w-full h-full flex flex-col overflow-hidden"
        style={{
          background: 'hsl(20 26% 7%)',
          borderBottom: '1px solid rgba(200,150,100,0.08)',
          animation: 'slideUpModal 0.28s cubic-bezier(0.22,1,0.36,1)',
        }}>

        {/* ── 顶部：返回 + 名称 + 合计 ── */}
        <div className="shrink-0 px-4 pt-4 pb-3 lg:px-8"
          style={{ borderBottom: '1px solid rgba(200,150,100,0.08)' }}>
          <div className="flex items-center gap-3">
            <button onClick={goBack} aria-label={text.back}
              className="btn-press shrink-0 h-10 w-10 flex items-center justify-center rounded-full text-foreground"
              style={{ background: 'rgba(234,215,178,0.06)', border: '1px solid rgba(234,215,178,0.14)' }}>
              <ArrowLeft className="w-5 h-5" />
            </button>

            <div className="flex-1 min-w-0">
              <h2 className="text-xl lg:text-2xl text-foreground truncate"
                style={{ fontFamily: "'Noto Serif SC','STSong',serif", letterSpacing: '0.04em' }}>
                {getLocalizedName(product, lang)}
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {done
                  ? text.summary
                  : text.step.replace('{n}', String(step + 1)).replace('{m}', String(groups.length))}
              </p>
            </div>

            <div className="text-right shrink-0">
              <p className="text-[11px] text-muted-foreground">{text.total}</p>
              <p className="text-2xl font-medium text-primary highlight-number leading-tight">¥{total.toFixed(2)}</p>
            </div>

            <button onClick={onClose} aria-label={text.close}
              className="btn-press shrink-0 h-9 w-9 flex items-center justify-center rounded-full text-muted-foreground"
              style={{ background: 'rgba(234,215,178,0.05)', border: '1px solid rgba(234,215,178,0.10)' }}>
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* 步骤条 */}
          <div className="flex items-center gap-2 mt-3 overflow-x-auto">
            {groups.map((g, i) => {
              const picked = picks[g.id];
              const active = i === step;
              return (
                <button key={g.id}
                  onClick={() => { setStep(i); setAnimKey(k => k + 1); }}
                  className="shrink-0 flex items-center gap-1.5 px-3 h-8 rounded-full text-xs transition-colors"
                  style={{
                    background: active ? 'rgba(217,152,59,0.16)' : 'rgba(234,215,178,0.04)',
                    border: active ? '1px solid rgba(245,190,100,0.45)' : '1px solid rgba(200,150,100,0.12)',
                    color: active ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))',
                  }}>
                  {picked && !active ? <Check className="w-3 h-3" /> : <span className="opacity-60">{i + 1}</span>}
                  {getLocalizedGroupTitle(g, lang)}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── 主体：当前分组的两列卡片 / 已选清单 ── */}
        <div className="flex-1 min-h-0 flex flex-col px-4 pt-3 pb-2 lg:px-8">
          {!done && current && (
            <>
              <div className="flex items-center gap-2 mb-2 shrink-0">
                <div className="w-1 h-4 rounded-full bg-primary" style={{ boxShadow: '0 0 8px rgba(217,152,59,0.4)' }} />
                <span className="text-base text-foreground">{getLocalizedGroupTitle(current, lang)}</span>
                <span className="text-xs text-muted-foreground">· {text.pick}</span>
              </div>

              <div key={animKey} className="combo-step grid grid-cols-2 gap-2.5 lg:gap-3 content-center flex-1 min-h-0 overflow-y-auto">
                {currentOptions.map(option => {
                  const selected = picks[current.id]?.id === option.id;
                  return (
                    <button key={option.id} type="button" onClick={() => choose(option)}
                      className="btn-press relative flex items-stretch overflow-hidden rounded-2xl text-left h-[104px] lg:h-[116px] transition-all duration-300"
                      style={{
                        background: selected ? 'rgba(217,152,59,0.14)' : 'rgba(234,215,178,0.03)',
                        border: selected ? '1px solid rgba(245,190,100,0.65)' : '1px solid rgba(200,150,100,0.10)',
                        boxShadow: selected ? '0 0 22px rgba(217,152,59,0.28), inset 0 0 18px rgba(217,152,59,0.10)' : 'none',
                      }}>
                      <div className="w-[42%] shrink-0 overflow-hidden">
                        {option.product.image_url
                          ? <img src={option.product.image_url} alt={getLocalizedName(option.product, lang)}
                              className="w-full h-full object-cover" />
                          : <div className="w-full h-full bg-muted" />}
                      </div>
                      <div className="flex-1 min-w-0 flex flex-col justify-center gap-1 px-3">
                        <p className="text-sm lg:text-base text-foreground line-clamp-2 leading-snug">
                          {getLocalizedName(option.product, lang)}
                        </p>
                        <span className="text-xs font-medium"
                          style={{ color: option.price_delta === 0 ? 'hsl(var(--muted-foreground))' : 'hsl(var(--primary))' }}>
                          {deltaLabel(option.price_delta, anchorIdOf.get(current.id) === option.id, text)}
                        </span>
                      </div>
                      {selected && (
                        <span className="absolute top-1.5 right-1.5 h-5 w-5 rounded-full flex items-center justify-center"
                          style={{ background: 'hsl(var(--primary))', color: 'hsl(var(--primary-foreground))' }}>
                          <Check className="w-3 h-3" />
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {done && (
            <div key={animKey} className="combo-step flex-1 min-h-0 flex flex-col gap-2 overflow-y-auto">
              {pickedList.map(({ group, option }) => (
                <div key={group.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl"
                  style={{ background: 'rgba(234,215,178,0.04)', border: '1px solid rgba(200,150,100,0.10)' }}>
                  <div className="w-12 h-12 rounded-lg overflow-hidden shrink-0">
                    {option.product.image_url
                      ? <img src={option.product.image_url} alt="" className="w-full h-full object-cover" />
                      : <div className="w-full h-full bg-muted" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-muted-foreground">{getLocalizedGroupTitle(group, lang)}</p>
                    <p className="text-sm text-foreground truncate">{getLocalizedName(option.product, lang)}</p>
                  </div>
                  <span className="text-xs shrink-0"
                    style={{ color: option.price_delta === 0 ? 'hsl(var(--muted-foreground))' : 'hsl(var(--primary))' }}>
                    {deltaLabel(option.price_delta, anchorIdOf.get(group.id) === option.id, text)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── 底部操作：没选完不出现「加入购物车」，只提示还差几项 ── */}
        <div className="shrink-0 px-4 pt-2 pb-4 lg:px-8 flex items-center gap-3">
          <button onClick={() => { setStep(0); setAnimKey(k => k + 1); }}
            className="btn-press shrink-0 h-12 px-5 rounded-full text-sm text-muted-foreground"
            style={{ background: 'rgba(234,215,178,0.04)', border: '1px solid rgba(200,150,100,0.12)' }}>
            {text.reselect}
          </button>

          {allPicked ? (
            <button onClick={confirm}
              className="btn-press flex-1 h-12 rounded-full text-base font-medium"
              style={{
                background: 'rgba(217,152,59,0.92)',
                border: '1px solid rgba(245,190,100,0.55)',
                color: 'hsl(24 40% 9%)',
              }}>
              {text.add}
            </button>
          ) : (
            <div aria-disabled="true"
              className="flex-1 h-12 rounded-full flex items-center justify-center text-sm"
              style={{
                background: 'rgba(234,215,178,0.04)',
                border: '1px dashed rgba(200,150,100,0.16)',
                color: 'hsl(var(--muted-foreground))',
                cursor: 'not-allowed',
              }}>
              {text.remaining.replace('{n}', String(groups.filter(g => !picks[g.id]).length))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
