/**
 * 套餐二级页面用到的界面文案（四语言）。
 * 与菜单数据里的四语字段同源：这里的字都是顾客直接看到的，缺一种语言就会回退中文。
 */
export interface ComboText {
  /** 每组选一项 */
  pick: string;
  /** 该选项已含在套餐价内 */
  included: string;
  /** 套餐合计 */
  total: string;
  /** 返回 */
  back: string;
  /** 加入购物车 */
  add: string;
  /** 重新选择 */
  reselect: string;
  /** 第 {n} / {m} 步 */
  step: string;
  /** 已选内容 */
  summary: string;
  /** 关闭 */
  close: string;
  /** 菜单卡上套餐按钮的文字 */
  select: string;
  /** 还差 {n} 项 */
  remaining: string;
}

const ZH: ComboText = {
  select: '选择',
  remaining: '还差 {n} 项',
  pick: '每组选 1 项',
  included: '已含',
  total: '套餐合计',
  back: '返回',
  add: '加入购物车',
  reselect: '重新选择',
  step: '第 {n} / {m} 步',
  summary: '已选内容',
  close: '关闭',
};

const JA: ComboText = {
  select: '選ぶ',
  remaining: 'あと {n} 項目',
  pick: '各グループから1つ選択',
  included: '込み',
  total: '合計',
  back: '戻る',
  add: 'カートに入れる',
  reselect: '選び直す',
  step: '{m} 中 {n} 番目',
  summary: '選択内容',
  close: '閉じる',
};

const EN: ComboText = {
  select: 'Select',
  remaining: '{n} left to pick',
  pick: 'Pick one per group',
  included: 'Included',
  total: 'Set total',
  back: 'Back',
  add: 'Add to cart',
  reselect: 'Choose again',
  step: 'Step {n} of {m}',
  summary: 'Your picks',
  close: 'Close',
};

const KO: ComboText = {
  select: '선택',
  remaining: '{n}개 남음',
  pick: '그룹마다 1개 선택',
  included: '포함',
  total: '세트 합계',
  back: '뒤로',
  add: '장바구니에 담기',
  reselect: '다시 고르기',
  step: '{m}개 중 {n}번째',
  summary: '선택 내역',
  close: '닫기',
};

export const COMBO_TEXT: Record<string, ComboText> = { zh: ZH, ja: JA, en: EN, ko: KO };

/** 取当前语言文案，未知语言回退中文 */
export function comboTextOf(lang: string): ComboText {
  return COMBO_TEXT[lang] ?? ZH;
}
