import { useNavigate } from 'react-router-dom';
import { Languages } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { LANG_LABELS, LANG_EMOJIS } from '@/i18n/translations';
import type { Lang } from '@/i18n/translations';

const LANGS: Lang[] = ['zh', 'ja', 'en', 'ko'];

export default function LanguageSelectPage() {
  const navigate = useNavigate();
  // lang 即当前已切换的语言，点击语言直接调 setLang 实现实时切换
  const { lang, setLang, t } = useLanguage();

  const handleSelect = (l: Lang) => {
    setLang(l);
  };

  return (
    <div className="app-page bg-background flex items-center justify-center px-6 page-enter relative overflow-hidden">
      {/* 散景光斑 */}
      <div className="ambient-lights" aria-hidden="true">
        <div className="ambient-light bokeh--gold-mid" />
        <div className="ambient-light bokeh--cream-soft" />
        <div className="ambient-light bokeh--copper-small" />
      </div>

      <div className="relative z-10 w-full max-w-sm flex flex-col items-center gap-8">
        {/* 图标 */}
        <div
          className="w-20 h-20 rounded-full flex items-center justify-center"
          style={{
            background: 'rgba(217,152,59,0.08)',
            border: '1px solid rgba(217,152,59,0.30)',
            boxShadow: '0 0 40px rgba(217,152,59,0.10)',
          }}
        >
          <Languages
            className="w-9 h-9 text-primary"
            style={{ filter: 'drop-shadow(0 0 8px rgba(217,152,59,0.4))' }}
          />
        </div>

        {/* 标题 — 随语言实时更新 */}
        <div className="text-center flex flex-col gap-2">
          <h1
            className="text-3xl text-foreground"
            style={{ fontFamily: "'Noto Serif SC','STSong',serif", letterSpacing: '0.06em' }}
          >
            {t.langSelect.title}
          </h1>
          <p className="text-base text-muted-foreground">{t.langSelect.subtitle}</p>
        </div>

        {/* 语言选项 — 点击立即切换 */}
        <div className="w-full flex flex-col gap-3">
          {LANGS.map(l => {
            const active = lang === l;
            return (
              <button
                key={l}
                onClick={() => handleSelect(l)}
                className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl transition-all btn-press"
                style={{
                  background: active ? 'rgba(217,152,59,0.12)' : 'rgba(234,215,178,0.04)',
                  border: active
                    ? '1px solid rgba(217,152,59,0.45)'
                    : '1px solid rgba(234,215,178,0.10)',
                  boxShadow: active ? '0 0 18px rgba(217,152,59,0.08)' : 'none',
                }}
              >
                <span className="text-2xl leading-none select-none">{LANG_EMOJIS[l]}</span>
                <span
                  className={`text-lg ${active ? 'text-primary font-medium' : 'text-foreground/80'}`}
                  style={{ fontFamily: l === 'zh' ? "'Noto Serif SC','STSong',serif" : undefined }}
                >
                  {LANG_LABELS[l]}
                </span>
                {active && (
                  <span
                    className="ml-auto w-2.5 h-2.5 rounded-full bg-primary"
                    style={{ boxShadow: '0 0 6px rgba(217,152,59,0.6)' }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {/* 提示 */}
        <p className="text-sm text-muted-foreground text-center">{t.langSelect.hint}</p>

        {/* 进入菜单 — 仅负责导航，不再切换语言 */}
        <button
          onClick={() => navigate('/', { replace: true })}
          className="w-full h-14 rounded-2xl text-lg font-medium text-primary-foreground btn-primary-neon btn-press flex items-center justify-center gap-2"
        >
          {t.langSelect.confirm}
        </button>
      </div>
    </div>
  );
}
