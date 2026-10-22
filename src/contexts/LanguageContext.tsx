import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { TRANSLATIONS, type Lang, type Translations } from '@/i18n/translations';
import { fetchDefaultLang } from '@/services/api';

interface LanguageContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: Translations;
}

const VALID_LANGS: Lang[] = ['zh', 'ja', 'en', 'ko'];
const DEFAULT_LANG: Lang = 'zh';

const LanguageContext = createContext<LanguageContextValue>({
  lang: DEFAULT_LANG,
  setLang: () => {},
  t: TRANSLATIONS[DEFAULT_LANG],
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(DEFAULT_LANG);
  const t = TRANSLATIONS[lang];

  // 启动时从后台拉取默认语言（仅初始化一次）
  useEffect(() => {
    fetchDefaultLang().then(raw => {
      const l = raw as Lang;
      if (VALID_LANGS.includes(l)) setLang(l);
    }).catch(() => {/* 网络失败保持默认 */});
  }, []);

  // 让 <html lang> 跟着界面语言走：写死 en 时中文内容会触发 Edge/Safari 的「翻译此页」气泡，
  // 桌面出餐屏是全屏独窗，那气泡会直接糊在屏幕上。
  useEffect(() => {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : lang;
  }, [lang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextValue {
  return useContext(LanguageContext);
}
