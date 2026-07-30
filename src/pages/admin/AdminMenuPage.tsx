import { useState, useCallback, useEffect } from 'react';
import { Plus, Pencil, Trash2, Upload, X, UtensilsCrossed, FileImage, AlignLeft, ArrowUp, ArrowDown, Globe, ChevronDown, ChevronUp, Settings2, ToggleLeft, ToggleRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { useMenu } from '@/hooks/useData';
import {
  createCategory,
  updateCategory,
  deleteCategory,
  createProduct,
  updateProduct,
  deleteProduct,
  uploadImage,
  fetchProductOptions,
  fetchGlobalDefaultOptions,
  upsertProductOption,
  softDeleteProductOption,
} from '@/services/api';
import type { Category, Product, DetailSection, ProductOption } from '@/types/types';
import { useLanguage } from '@/contexts/LanguageContext';
import { LANG_LABELS, LANG_EMOJIS, type Lang } from '@/i18n/translations';

const I18N_LANGS: Lang[] = ['ja', 'en', 'ko'];

// ── 空白选项模板 ───────────────────────────────────────────────
function emptyOption(productId: string, sortOrder: number): Omit<ProductOption, 'id' | 'created_at' | 'deleted_at'> {
  return {
    product_id: productId,
    name_zh: '', name_ja: '', name_en: '', name_ko: '',
    image_url: null,
    price: 0,
    default_qty: 0,
    sort_order: sortOrder,
    enabled: true,
  };
}

// ── 选项编辑表单 ───────────────────────────────────────────────
type OptionDraft = Omit<ProductOption, 'id' | 'created_at' | 'deleted_at'> & { id?: string };

interface OptionFormProps {
  option: OptionDraft;
  onChange: (updated: OptionDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  tm: ReturnType<typeof useLanguage>['t']['adminMenu'];
}

function OptionForm({ option, onChange, onSave, onCancel, saving, tm }: OptionFormProps) {
  const [uploading, setUploading] = useState(false);
  const [pct, setPct] = useState(0);

  const handleImg = async (file: File) => {
    if (!file.type.startsWith('image/')) { toast.error(tm.prodImageOnly); return; }
    setUploading(true); setPct(0);
    try {
      const url = await uploadImage('menu-images', file, p => setPct(p));
      onChange({ ...option, image_url: url });
      toast.success(tm.uploadSuccess);
    } catch { toast.error(tm.uploadFail); }
    finally { setUploading(false); }
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl p-4"
      style={{ background: 'rgba(234,215,178,0.04)', border: '1px solid rgba(200,150,100,0.12)' }}>

      {/* 图片 */}
      <div className="flex gap-3 items-start">
        <div
          className="w-16 h-16 rounded-xl overflow-hidden shrink-0 flex items-center justify-center cursor-pointer relative"
          style={{ border: '1px dashed rgba(200,150,100,0.20)', background: 'rgba(234,215,178,0.04)' }}
          onClick={() => document.getElementById(`opt-img-${option.sort_order}`)?.click()}
        >
          {option.image_url
            ? <><img src={option.image_url} alt="" className="w-full h-full object-cover" />
                <button className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5"
                  onClick={e => { e.stopPropagation(); onChange({ ...option, image_url: null }); }}>
                  <X className="w-2.5 h-2.5" />
                </button></>
            : <Upload className="w-4 h-4 text-muted-foreground/50" />}
        </div>
        <input id={`opt-img-${option.sort_order}`} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
          onChange={e => e.target.files?.[0] && handleImg(e.target.files[0])} />

        <div className="flex-1 min-w-0 flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">{tm.optionPrice}</Label>
              <Input type="number" min="0" step="0.5" value={option.price}
                onChange={e => onChange({ ...option, price: Number(e.target.value) })}
                className="h-9 px-3 text-sm" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground mb-1 block">{tm.optionDefaultQty}</Label>
              <Input type="number" min="0" value={option.default_qty}
                onChange={e => onChange({ ...option, default_qty: Number(e.target.value) })}
                className="h-9 px-3 text-sm" />
            </div>
          </div>
          <div className="flex items-center justify-between">
            <Label className="text-xs text-muted-foreground">{tm.optionEnabled}</Label>
            <Switch checked={option.enabled} onCheckedChange={v => onChange({ ...option, enabled: v })} />
          </div>
        </div>
      </div>

      {uploading && <Progress value={pct} className="h-1" />}

      {/* 多语言名称 */}
      <div className="flex flex-col gap-2">
        <div>
          <Label className="text-xs text-muted-foreground mb-1 block">{tm.optionNameZh} <span className="text-destructive">*</span></Label>
          <Input value={option.name_zh} onChange={e => onChange({ ...option, name_zh: e.target.value })}
            placeholder="例：加糖" className="h-9 px-3 text-sm" />
        </div>
        <div className="grid grid-cols-3 gap-2">
          {([['ja', tm.optionNameJa], ['en', tm.optionNameEn], ['ko', tm.optionNameKo]] as [Lang, string][]).map(([lg, label]) => (
            <div key={lg}>
              <Label className="text-xs text-muted-foreground mb-1 block">{label}</Label>
              <Input value={(option as Record<string, unknown>)[`name_${lg}`] as string}
                onChange={e => onChange({ ...option, [`name_${lg}`]: e.target.value })}
                placeholder={`${LANG_EMOJIS[lg]}`} className="h-9 px-3 text-xs" />
            </div>
          ))}
        </div>
      </div>

      <div className="flex gap-2 justify-end mt-1">
        <Button variant="ghost" size="sm" className="h-8 px-3 text-xs" onClick={onCancel}>{tm.cancel}</Button>
        <Button size="sm" className="h-8 px-3 text-xs bg-primary text-primary-foreground hover:bg-secondary"
          onClick={onSave} disabled={saving}>
          {saving ? tm.saving : tm.optionSave}
        </Button>
      </div>
    </div>
  );
}

// ── 选项管理区（嵌入商品编辑弹窗右列底部） ────────────────────────
interface OptionsManagerProps {
  productId: string | null; // null = 新商品（尚未保存）
  tm: ReturnType<typeof useLanguage>['t']['adminMenu'];
}

function OptionsManager({ productId, tm }: OptionsManagerProps) {
  const [options, setOptions] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [editingDraft, setEditingDraft] = useState<OptionDraft | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProductOption | null>(null);

  const load = useCallback(async () => {
    if (!productId) return;
    setLoading(true);
    try {
      const data = await fetchProductOptions(productId);
      setOptions(data);
    } catch { toast.error(tm.optionLoadFail); }
    finally { setLoading(false); }
  }, [productId, tm]);

  useEffect(() => { load(); }, [load]);

  // 新商品时提示无法编辑
  if (!productId) {
    return (
      <div className="mt-4 rounded-xl px-4 py-6 flex items-center justify-center text-sm text-muted-foreground/50"
        style={{ border: '1px dashed rgba(200,150,100,0.10)' }}>
        {tm.optionsSectionHint}
      </div>
    );
  }

  const startNew = async () => {
    // 首次新增：自动拉全局默认模板
    if (options.length === 0) {
      try {
        const defaults = await fetchGlobalDefaultOptions();
        if (defaults.length > 0) {
          // 批量复制模板到此商品
          for (let i = 0; i < defaults.length; i++) {
            const d = defaults[i];
            await upsertProductOption({
              product_id: productId,
              name_zh: d.name_zh, name_ja: d.name_ja, name_en: d.name_en, name_ko: d.name_ko,
              image_url: d.image_url,
              price: d.price,
              default_qty: d.default_qty,
              sort_order: i + 1,
              enabled: true,
            });
          }
          toast.success(tm.globalDefaultsLoaded);
          await load();
          return;
        }
      } catch { /* ignore, fall through to blank */ }
    }
    const draft = { ...emptyOption(productId, options.length + 1) };
    setEditingIdx(-1); // -1 = new
    setEditingDraft(draft as Omit<ProductOption, 'created_at' | 'deleted_at'>);
  };

  const startEdit = (opt: ProductOption, idx: number) => {
    setEditingIdx(idx);
    setEditingDraft({ ...opt });
  };

  const cancelEdit = () => { setEditingIdx(null); setEditingDraft(null); };

  const saveOption = async () => {
    if (!editingDraft) return;
    if (!editingDraft.name_zh.trim()) { toast.warning(tm.optionNameRequired); return; }
    setSaving(true);
    try {
      await upsertProductOption({ ...editingDraft, product_id: productId });
      toast.success(tm.optionSaved);
      cancelEdit();
      await load();
    } catch { toast.error(tm.saveFailed); }
    finally { setSaving(false); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    try {
      await softDeleteProductOption(deleteTarget.id);
      toast.success(tm.optionDeleted);
      setDeleteTarget(null);
      await load();
    } catch { toast.error(tm.deleteFailed); }
  };

  const moveOpt = async (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= options.length) return;
    const next = [...options];
    [next[idx], next[target]] = [next[target], next[idx]];
    // 更新 sort_order
    try {
      await upsertProductOption({ ...next[idx], sort_order: idx + 1, product_id: productId });
      await upsertProductOption({ ...next[target], sort_order: target + 1, product_id: productId });
      setOptions(next.map((o, i) => ({ ...o, sort_order: i + 1 })));
    } catch { toast.error(tm.saveFailed); }
  };

  return (
    <div className="flex flex-col gap-3 mt-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Settings2 className="w-4 h-4 text-primary/70" />
          <span className="text-sm font-medium text-foreground">{tm.optionsSection}</span>
          <span className="text-xs text-muted-foreground">({options.length})</span>
        </div>
        {editingIdx === null && (
          <Button variant="ghost" size="sm" className="h-8 px-3 gap-1.5 text-xs"
            style={{ border: '1px solid rgba(200,150,100,0.12)' }}
            onClick={startNew}>
            <Plus className="w-3.5 h-3.5" />{tm.optionAdd}
          </Button>
        )}
      </div>

      {loading && <div className="text-xs text-muted-foreground animate-pulse py-2">{tm.loading}</div>}

      {!loading && options.length === 0 && editingIdx === null && (
        <div className="text-xs text-muted-foreground/50 py-3 text-center rounded-lg"
          style={{ border: '1px dashed rgba(200,150,100,0.10)' }}>
          {tm.optionEmpty}
        </div>
      )}

      {/* 新增表单 */}
      {editingIdx === -1 && editingDraft && (
        <OptionForm
          option={editingDraft}
          onChange={d => setEditingDraft(d)}
          onSave={saveOption}
          onCancel={cancelEdit}
          saving={saving}
          tm={tm}
        />
      )}

      {/* 现有选项列表 */}
      <div className="flex flex-col gap-2">
        {options.map((opt, idx) => (
          <div key={opt.id}>
            {editingIdx === idx && editingDraft ? (
              <OptionForm
                option={editingDraft}
                onChange={d => setEditingDraft(d)}
                onSave={saveOption}
                onCancel={cancelEdit}
                saving={saving}
                tm={tm}
              />
            ) : (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
                style={{ background: 'rgba(234,215,178,0.03)', border: '1px solid rgba(200,150,100,0.08)' }}>
                {/* 图片缩略图 */}
                <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 bg-muted flex items-center justify-center">
                  {opt.image_url
                    ? <img src={opt.image_url} alt={opt.name_zh} className="w-full h-full object-cover" />
                    : <Settings2 className="w-3.5 h-3.5 text-muted-foreground/40" />}
                </div>
                {/* 名称 + 价格 */}
                <div className="flex-1 min-w-0">
                  <span className="text-sm text-foreground truncate block">{opt.name_zh}</span>
                  <span className="text-xs text-muted-foreground">
                    {opt.price === 0 ? tm.optionEnabled : `+¥${opt.price}`}
                    {' · '}{tm.optionDefaultQty}: {opt.default_qty}
                  </span>
                </div>
                {/* 启用状态 */}
                {opt.enabled
                  ? <ToggleRight className="w-4 h-4 text-primary/70 shrink-0" />
                  : <ToggleLeft className="w-4 h-4 text-muted-foreground/40 shrink-0" />}
                {/* 排序 */}
                <button className="w-6 h-6 flex items-center justify-center rounded hover:bg-muted/40 text-muted-foreground disabled:opacity-30"
                  disabled={idx === 0} onClick={() => moveOpt(idx, -1)}>
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
                <button className="w-6 h-6 flex items-center justify-center rounded hover:bg-muted/40 text-muted-foreground disabled:opacity-30"
                  disabled={idx === options.length - 1} onClick={() => moveOpt(idx, 1)}>
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
                {/* 操作 */}
                <button className="w-7 h-7 flex items-center justify-center rounded hover:bg-muted/40 text-muted-foreground"
                  onClick={() => startEdit(opt, idx)}>
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button className="w-7 h-7 flex items-center justify-center rounded hover:bg-destructive/20 text-destructive"
                  onClick={() => setDeleteTarget(opt)}>
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* 删除确认 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>{tm.optionDelete}</AlertDialogTitle>
            <AlertDialogDescription>{tm.optionDeleteConfirm}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tm.cancel}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={confirmDelete}>
              {tm.confirmDelete}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default function AdminMenuPage() {
  const { categories, products, loading, reload } = useMenu();
  const { t } = useLanguage();
  const tm = t.adminMenu;

  // ── 分类状态 ─────────────────────────────────────────
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [catName, setCatName] = useState('');
  const [catOrder, setCatOrder] = useState(0);
  const [catI18n, setCatI18n] = useState<Record<Lang, string>>({ zh: '', ja: '', en: '', ko: '' });
  const [deleteCat, setDeleteCat] = useState<Category | null>(null);

  // ── 商品状态 ─────────────────────────────────────────
  const [prodDialogOpen, setProdDialogOpen] = useState(false);
  const [editingProd, setEditingProd] = useState<Product | null>(null);
  const [prodName, setProdName] = useState('');
  const [prodDesc, setProdDesc] = useState('');
  const [prodNameI18n, setProdNameI18n] = useState<Record<Lang, string>>({ zh: '', ja: '', en: '', ko: '' });
  const [prodDescI18n, setProdDescI18n] = useState<Record<Lang, string>>({ zh: '', ja: '', en: '', ko: '' });
  const [prodPrice, setProdPrice] = useState('');
  const [prodCategory, setProdCategory] = useState('');
  const [prodAvailable, setProdAvailable] = useState(true);
  const [prodOrder, setProdOrder] = useState(0);
  const [prodImageUrl, setProdImageUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(0);
  const [deleteProd, setDeleteProd] = useState<Product | null>(null);
  const [saving, setSaving] = useState(false);

  // ── 详情段落状态 ─────────────────────────────────────
  const [detailSections, setDetailSections] = useState<DetailSection[]>([]);
  const [sectionUploading, setSectionUploading] = useState<Record<number, number>>({});

  // ── 分类操作 ─────────────────────────────────────────
  const openNewCat = () => {
    setEditingCat(null);
    setCatName('');
    setCatOrder(categories.length + 1);
    setCatI18n({ zh: '', ja: '', en: '', ko: '' });
    setCatDialogOpen(true);
  };

  const openEditCat = (cat: Category) => {
    setEditingCat(cat);
    setCatName(cat.name);
    setCatOrder(cat.sort_order);
    setCatI18n({ zh: '', ja: cat.name_ja ?? '', en: cat.name_en ?? '', ko: cat.name_ko ?? '' });
    setCatDialogOpen(true);
  };

  const saveCat = async () => {
    if (!catName.trim()) { toast.warning(tm.catNameRequired); return; }
    setSaving(true);
    try {
      const i18n = { name_ja: catI18n.ja.trim() || undefined, name_en: catI18n.en.trim() || undefined, name_ko: catI18n.ko.trim() || undefined };
      if (editingCat) {
        await updateCategory(editingCat.id, catName.trim(), catOrder, i18n);
        toast.success(tm.categoryUpdated);
      } else {
        await createCategory(catName.trim(), catOrder, i18n);
        toast.success(tm.categoryCreated);
      }
      setCatDialogOpen(false);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tm.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteCat = async () => {
    if (!deleteCat) return;
    try {
      await deleteCategory(deleteCat.id);
      toast.success(tm.categoryDeleted);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tm.deleteFailed);
    } finally {
      setDeleteCat(null);
    }
  };

  // ── 商品操作 ─────────────────────────────────────────
  const openNewProd = () => {
    setEditingProd(null);
    setProdName('');
    setProdDesc('');
    setProdNameI18n({ zh: '', ja: '', en: '', ko: '' });
    setProdDescI18n({ zh: '', ja: '', en: '', ko: '' });
    setProdPrice('');
    setProdCategory(categories[0]?.id ?? '');
    setProdAvailable(true);
    setProdOrder(products.length + 1);
    setProdImageUrl('');
    setDetailSections([]);
    setProdDialogOpen(true);
  };

  const openEditProd = (prod: Product) => {
    setEditingProd(prod);
    setProdName(prod.name);
    setProdDesc(prod.description ?? '');
    setProdNameI18n({ zh: '', ja: prod.name_ja ?? '', en: prod.name_en ?? '', ko: prod.name_ko ?? '' });
    setProdDescI18n({ zh: '', ja: prod.description_ja ?? '', en: prod.description_en ?? '', ko: prod.description_ko ?? '' });
    setProdPrice(String(prod.price));
    setProdCategory(prod.category_id);
    setProdAvailable(prod.is_available);
    setProdOrder(prod.sort_order);
    setProdImageUrl(prod.image_url ?? '');
    setDetailSections(Array.isArray(prod.detail_sections) ? [...prod.detail_sections] : []);
    setProdDialogOpen(true);
  };

  const handleImageUpload = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) { toast.error(tm.prodImageOnly); return; }
    setUploading(true); setUploadPct(0);
    try {
      const url = await uploadImage('menu-images', file, pct => setUploadPct(pct));
      setProdImageUrl(url);
      toast.success(tm.uploadSuccess);
    } catch { toast.error(tm.uploadFail); }
    finally { setUploading(false); }
  }, [tm]);

  // ── 详情段落操作 ─────────────────────────────────────
  const addTextSection = () => setDetailSections(prev => [...prev, { type: 'text', content: '' }]);
  const addImageSection = () => setDetailSections(prev => [...prev, { type: 'image', content: '' }]);
  const updateSection = (idx: number, content: string) =>
    setDetailSections(prev => prev.map((s, i) => i === idx ? { ...s, content } : s));
  const updateSectionLang = (idx: number, field: 'content_ja' | 'content_en' | 'content_ko', val: string) =>
    setDetailSections(prev => prev.map((s, i) => i === idx ? { ...s, [field]: val } : s));
  const removeSection = (idx: number) => setDetailSections(prev => prev.filter((_, i) => i !== idx));
  const moveSection = (idx: number, dir: -1 | 1) => {
    setDetailSections(prev => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const handleSectionImageUpload = useCallback(async (idx: number, file: File) => {
    if (!file.type.startsWith('image/')) { toast.error(tm.prodImageOnly); return; }
    setSectionUploading(prev => ({ ...prev, [idx]: 0 }));
    try {
      const url = await uploadImage('menu-images', file, pct =>
        setSectionUploading(prev => ({ ...prev, [idx]: pct })));
      updateSection(idx, url);
      toast.success(tm.uploadSuccess);
    } catch { toast.error(tm.uploadFail); }
    finally { setSectionUploading(prev => { const n = { ...prev }; delete n[idx]; return n; }); }
  }, [tm]);

  const saveProd = async () => {
    if (!prodName.trim()) { toast.warning(tm.nameRequired); return; }
    if (!prodPrice || isNaN(Number(prodPrice))) { toast.warning(tm.priceRequired); return; }
    if (!prodCategory) { toast.warning(tm.categoryRequired); return; }
    setSaving(true);
    try {
      const payload = {
        name: prodName.trim(),
        name_ja: prodNameI18n.ja.trim() || null,
        name_en: prodNameI18n.en.trim() || null,
        name_ko: prodNameI18n.ko.trim() || null,
        description: prodDesc.trim() || null,
        description_ja: prodDescI18n.ja.trim() || null,
        description_en: prodDescI18n.en.trim() || null,
        description_ko: prodDescI18n.ko.trim() || null,
        price: Number(prodPrice),
        category_id: prodCategory,
        is_available: prodAvailable,
        sort_order: prodOrder,
        image_url: prodImageUrl || null,
        detail_sections: detailSections.filter(s => s.content.trim() !== ''),
      };
      if (editingProd) {
        await updateProduct(editingProd.id, payload);
        toast.success(tm.productUpdated);
      } else {
        await createProduct(payload as Parameters<typeof createProduct>[0]);
        toast.success(tm.productCreated);
      }
      setProdDialogOpen(false);
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tm.saveFailed);
    } finally {
      setSaving(false);
    }
  };

  const confirmDeleteProd = async () => {
    if (!deleteProd) return;
    try {
      await deleteProduct(deleteProd.id);
      toast.success(tm.productDeleted);
      reload();
    } catch {
      toast.error(tm.deleteFailed);
    } finally {
      setDeleteProd(null);
    }
  };

  const toggleAvailability = async (prod: Product) => {
    try {
      await updateProduct(prod.id, { is_available: !prod.is_available });
      toast.success(prod.is_available ? tm.offline : tm.online);
      reload();
    } catch {
      toast.error(tm.saveFailed);
    }
  };

  return (
    <div className="p-5 md:p-7 flex flex-col gap-5 page-enter">
      <h1 className="text-2xl text-foreground" style={{ fontFamily: "'Noto Serif SC','STSong',serif" }}>{tm.title}</h1>

      <Tabs defaultValue="products">
        <TabsList style={{ background: 'rgba(234,215,178,0.05)', border: '1px solid rgba(234,215,178,0.09)' }}>
          <TabsTrigger value="products" className="text-base data-[state=active]:text-primary" style={{ '--active-bg': 'rgba(217,148,58,0.15)' } as React.CSSProperties}>{tm.tabProducts}</TabsTrigger>
          <TabsTrigger value="categories" className="text-base data-[state=active]:text-primary">{tm.tabCategories}</TabsTrigger>
        </TabsList>

        {/* ── 商品标签页 ── */}
        <TabsContent value="products" className="mt-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-base text-muted-foreground">{products.length} {tm.productCount}</span>
            <Button className="h-10 px-5 bg-primary text-primary-foreground hover:bg-secondary gap-1.5 text-base" onClick={openNewProd}>
              <Plus className="w-4 h-4" />{tm.addProduct}
            </Button>
          </div>

          {loading ? (
            <div className="text-center py-12 text-muted-foreground animate-pulse text-base">{tm.loading}</div>
          ) : (
            <div className="flex flex-col gap-3">
              {products.map(prod => {
                const cat = categories.find(c => c.id === prod.category_id);
                const hasSections = (prod.detail_sections ?? []).length > 0;
                return (
                  <div key={prod.id} className="glass-card relative rounded-2xl p-4 flex items-center gap-4 overflow-hidden">
                    <div className="w-14 h-14 rounded-lg overflow-hidden shrink-0 bg-muted">
                      {prod.image_url
                        ? <img src={prod.image_url} alt={prod.name} className="w-full h-full object-cover" />
                        : <div className="w-full h-full flex items-center justify-center"><UtensilsCrossed className="w-5 h-5 text-muted-foreground/40" /></div>}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-base font-medium truncate text-foreground">{prod.name}</span>
                        {!prod.is_available && (
                          <span className="text-xs px-2 py-0.5 rounded shrink-0" style={{ background: 'rgba(234,215,178,0.06)', color: 'hsl(var(--muted-foreground))' }}>{tm.offline}</span>
                        )}
                        {hasSections && (
                          <span className="text-xs px-2 py-0.5 rounded shrink-0" style={{ background: 'rgba(217,152,59,0.10)', color: 'hsl(var(--primary))' }}>
                            {(prod.detail_sections ?? []).length} {tm.detailBlocks}
                          </span>
                        )}
                        {(prod.name_ja || prod.name_en || prod.name_ko) && (
                          <Globe className="w-3.5 h-3.5 shrink-0 text-primary/60" />
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1">
                        <span className="text-sm text-primary">¥{Number(prod.price).toFixed(2)}</span>
                        {cat && <span className="text-sm text-muted-foreground">{cat.name}</span>}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => toggleAvailability(prod)}
                        title={prod.is_available ? tm.offline : tm.online}>
                        {prod.is_available
                          ? <ToggleRight className="w-5 h-5 text-primary" />
                          : <ToggleLeft className="w-5 h-5 text-muted-foreground/40" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground" onClick={() => openEditProd(prod)}>
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:text-destructive" onClick={() => setDeleteProd(prod)}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── 分类标签页 ── */}
        <TabsContent value="categories" className="mt-5">
          <div className="flex items-center justify-between mb-4">
            <span className="text-base text-muted-foreground">{categories.length} {tm.categoryCount}</span>
            <Button className="h-10 px-5 bg-primary text-primary-foreground hover:bg-secondary gap-1.5 text-base" onClick={openNewCat}>
              <Plus className="w-4 h-4" />{tm.addCategory}
            </Button>
          </div>
          <div className="flex flex-col gap-3">
            {categories.map(cat => (
              <div key={cat.id} className="glass-card relative rounded-2xl px-5 py-4 flex items-center gap-4">
                <div className="flex-1 min-w-0">
                  <span className="text-base font-medium text-foreground">{cat.name}</span>
                  {(cat.name_ja || cat.name_en || cat.name_ko) && <Globe className="w-3.5 h-3.5 inline ml-2 text-primary/60" />}
                  <span className="text-sm text-muted-foreground ml-3">#{cat.sort_order}</span>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground" onClick={() => openEditCat(cat)}>
                    <Pencil className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:text-destructive" onClick={() => setDeleteCat(cat)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </TabsContent>
      </Tabs>

      {/* ── 分类编辑弹窗 ── */}
      <Dialog open={catDialogOpen} onOpenChange={setCatDialogOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingCat ? tm.editCategory : tm.newCategory}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-2">
              <Label className="text-base">🇨🇳 {tm.catName} <span className="text-destructive">*</span></Label>
              <Input value={catName} onChange={e => setCatName(e.target.value)} placeholder={tm.catNamePlaceholder} className="h-11 px-4 text-base" />
            </div>
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Globe className="w-3.5 h-3.5" />{tm.langTabHint}
              </div>
              <div className="flex flex-col gap-2.5">
                {I18N_LANGS.map(lang => (
                  <div key={lang} className="flex items-center gap-3">
                    <span className="text-base w-8 shrink-0">{LANG_EMOJIS[lang]}</span>
                    <Input value={catI18n[lang]}
                      onChange={e => setCatI18n(prev => ({ ...prev, [lang]: e.target.value }))}
                      placeholder={`${LANG_LABELS[lang]}（${tm.catNamePlaceholder}）`}
                      className="h-10 px-4 text-sm flex-1" />
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label className="text-base">{tm.catOrder}</Label>
              <Input type="number" value={catOrder} onChange={e => setCatOrder(Number(e.target.value))} className="h-11 px-4 text-base" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" className="h-11 text-base" onClick={() => setCatDialogOpen(false)}>{tm.cancel}</Button>
            <Button className="h-11 text-base bg-primary text-primary-foreground hover:bg-secondary" onClick={saveCat} disabled={saving}>
              {saving ? tm.saving : tm.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 商品编辑弹窗 ── */}
      <Dialog open={prodDialogOpen} onOpenChange={setProdDialogOpen}>
        <DialogContent className="max-w-[calc(100%-2rem)] md:max-w-3xl max-h-[90dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingProd ? tm.editProduct : tm.newProduct}</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col md:flex-row gap-6 py-2">
            {/* ── 左列：基础信息 ── */}
            <div className="flex flex-col gap-4 md:w-72 shrink-0">
              {/* 封面图 */}
              <div className="flex flex-col gap-2">
                <Label className="text-base">{tm.prodImage}</Label>
                <div className="border-2 border-dashed rounded-xl overflow-hidden cursor-pointer transition-colors relative"
                  style={{ borderColor: 'rgba(234,215,178,0.15)' }}
                  onClick={() => document.getElementById('prod-img-input')?.click()}>
                  {prodImageUrl ? (
                    <div className="relative">
                      <img src={prodImageUrl} alt={tm.prodImage} className="w-full h-40 object-cover" />
                      <button className="absolute top-2 right-2 bg-black/50 text-white rounded-full p-1.5 hover:bg-black/70"
                        onClick={e => { e.stopPropagation(); setProdImageUrl(''); }}>
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="h-32 flex flex-col items-center justify-center gap-2 text-muted-foreground">
                      <Upload className="w-6 h-6" /><span className="text-sm">{tm.prodImageUpload}</span>
                    </div>
                  )}
                </div>
                {uploading && <Progress value={uploadPct} className="h-1.5" />}
                <input id="prod-img-input" type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                  onChange={e => e.target.files?.[0] && handleImageUpload(e.target.files[0])} />
              </div>

              <div className="flex flex-col gap-2">
                <Label className="text-base">🇨🇳 {tm.prodNameRequired}</Label>
                <Input value={prodName} onChange={e => setProdName(e.target.value)} placeholder={tm.prodNamePlaceholder} className="h-11 px-4 text-base" />
              </div>

              <div className="flex flex-col gap-2">
                <Label className="text-base">🇨🇳 {tm.prodDesc}</Label>
                <Textarea value={prodDesc} onChange={e => setProdDesc(e.target.value)} placeholder={tm.prodDescPlaceholder} className="px-4 resize-none text-base" rows={2} />
              </div>

              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Globe className="w-3.5 h-3.5" />{tm.langTabHint}
                </div>
                <div className="flex flex-col gap-3">
                  {I18N_LANGS.map(lang => (
                    <div key={lang} className="flex flex-col gap-1.5 rounded-lg p-2.5" style={{ background: 'rgba(234,215,178,0.03)', border: '1px solid rgba(234,215,178,0.08)' }}>
                      <span className="text-sm text-muted-foreground">{LANG_EMOJIS[lang]} {LANG_LABELS[lang]}</span>
                      <Input value={prodNameI18n[lang]} onChange={e => setProdNameI18n(prev => ({ ...prev, [lang]: e.target.value }))} placeholder={tm.prodNamePlaceholder} className="h-9 px-3 text-sm" />
                      <Input value={prodDescI18n[lang]} onChange={e => setProdDescI18n(prev => ({ ...prev, [lang]: e.target.value }))} placeholder={tm.prodDescPlaceholder} className="h-9 px-3 text-sm" />
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-2">
                  <Label className="text-base">{tm.prodPrice}</Label>
                  <Input type="number" min="0" step="0.5" value={prodPrice} onChange={e => setProdPrice(e.target.value)} className="h-11 px-4 text-base" />
                </div>
                <div className="flex flex-col gap-2">
                  <Label className="text-base">{tm.prodOrder}</Label>
                  <Input type="number" value={prodOrder} onChange={e => setProdOrder(Number(e.target.value))} className="h-11 px-4 text-base" />
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Label className="text-base">{tm.prodCategory}</Label>
                <select value={prodCategory} onChange={e => setProdCategory(e.target.value)}
                  className="border border-input rounded-xl px-4 h-11 text-base bg-background text-foreground">
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>

              <div className="flex items-center justify-between py-1 min-h-[44px]">
                <Label className="text-base">{tm.prodAvailable}</Label>
                <Switch checked={prodAvailable} onCheckedChange={setProdAvailable} />
              </div>
            </div>

            {/* ── 右列：详情段落 + 自定义选项 ── */}
            <div className="flex-1 min-w-0 flex flex-col gap-3">
              {/* 详情段落编辑 */}
              <div className="flex items-center justify-between">
                <div>
                  <Label className="text-base">{tm.detailContent}</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">{tm.detailContentHint}</p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button variant="ghost" size="sm" className="h-9 px-3 gap-1.5 text-sm"
                    style={{ border: '1px solid rgba(200,150,100,0.12)' }} onClick={addTextSection}>
                    <AlignLeft className="w-3.5 h-3.5" />{tm.addText}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-9 px-3 gap-1.5 text-sm"
                    style={{ border: '1px solid rgba(200,150,100,0.12)' }} onClick={addImageSection}>
                    <FileImage className="w-3.5 h-3.5" />{tm.addImage}
                  </Button>
                </div>
              </div>

              {detailSections.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 rounded-xl text-muted-foreground/40 gap-2"
                  style={{ border: '1px dashed rgba(200,150,100,0.10)', background: 'rgba(234,215,178,0.02)' }}>
                  <FileImage className="w-8 h-8" />
                  <span className="text-sm">{tm.detailEmpty}</span>
                </div>
              ) : (
                <div className="flex flex-col gap-2.5">
                  {detailSections.map((sec, idx) => (
                    <div key={idx} className="rounded-xl p-3 flex flex-col gap-2"
                      style={{ background: 'rgba(234,215,178,0.04)', border: '1px solid rgba(200,150,100,0.09)' }}>
                      <div className="flex items-center gap-2">
                        <span className="text-xs px-2 py-0.5 rounded flex items-center gap-1"
                          style={{ background: 'rgba(217,152,59,0.10)', color: 'hsl(var(--primary))' }}>
                          {sec.type === 'text' ? <AlignLeft className="w-3 h-3" /> : <FileImage className="w-3 h-3" />}
                          {sec.type === 'text' ? tm.textBlock : tm.imageBlock}
                        </span>
                        <span className="text-xs text-muted-foreground/50 flex-1">#{idx + 1}</span>
                        <button className="w-7 h-7 flex items-center justify-center rounded hover:bg-muted/40 text-muted-foreground disabled:opacity-30"
                          disabled={idx === 0} onClick={() => moveSection(idx, -1)}>
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button className="w-7 h-7 flex items-center justify-center rounded hover:bg-muted/40 text-muted-foreground disabled:opacity-30"
                          disabled={idx === detailSections.length - 1} onClick={() => moveSection(idx, 1)}>
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button className="w-7 h-7 flex items-center justify-center rounded hover:bg-destructive/20 text-destructive"
                          onClick={() => removeSection(idx)}>
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                      {sec.type === 'text' ? (
                        <div className="flex flex-col gap-1.5">
                          {/* 中文（主内容） */}
                          <Textarea value={sec.content} onChange={e => updateSection(idx, e.target.value)}
                            placeholder={`🇨🇳 ${tm.textPlaceholder}`} className="px-3 resize-none text-sm min-h-[64px]" rows={2} />
                          {/* 日文 */}
                          <Textarea value={sec.content_ja ?? ''} onChange={e => updateSectionLang(idx, 'content_ja', e.target.value)}
                            placeholder={`🇯🇵 ${tm.textPlaceholder}`} className="px-3 resize-none text-sm min-h-[64px]" rows={2} />
                          {/* 英文 */}
                          <Textarea value={sec.content_en ?? ''} onChange={e => updateSectionLang(idx, 'content_en', e.target.value)}
                            placeholder={`🇺🇸 ${tm.textPlaceholder}`} className="px-3 resize-none text-sm min-h-[64px]" rows={2} />
                          {/* 韩文 */}
                          <Textarea value={sec.content_ko ?? ''} onChange={e => updateSectionLang(idx, 'content_ko', e.target.value)}
                            placeholder={`🇰🇷 ${tm.textPlaceholder}`} className="px-3 resize-none text-sm min-h-[64px]" rows={2} />
                        </div>
                      ) : (
                        <div>
                          {sec.content ? (
                            <div className="relative rounded-lg overflow-hidden">
                              <img src={sec.content} alt={`${tm.imageBlock} ${idx + 1}`} className="w-full max-h-48 object-cover" />
                              <button className="absolute top-2 right-2 bg-black/60 text-white rounded-full p-1.5 hover:bg-black/80"
                                onClick={() => updateSection(idx, '')}>
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <div className="h-24 flex flex-col items-center justify-center gap-2 rounded-lg cursor-pointer text-muted-foreground/60 hover:text-muted-foreground transition-colors"
                              style={{ border: '1px dashed rgba(200,150,100,0.12)' }}
                              onClick={() => document.getElementById(`sec-img-${idx}`)?.click()}>
                              <Upload className="w-5 h-5" />
                              <span className="text-xs">{tm.imageUpload}</span>
                            </div>
                          )}
                          {sectionUploading[idx] !== undefined && <Progress value={sectionUploading[idx]} className="h-1 mt-1.5" />}
                          <input id={`sec-img-${idx}`} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
                            onChange={e => e.target.files?.[0] && handleSectionImageUpload(idx, e.target.files[0])} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* ── 自定义选项管理区 ── */}
              <div className="mt-2 pt-4" style={{ borderTop: '1px solid rgba(200,150,100,0.08)' }}>
                <OptionsManager productId={editingProd?.id ?? null} tm={tm} />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" className="h-11 text-base" onClick={() => setProdDialogOpen(false)}>{tm.cancel}</Button>
            <Button className="h-11 text-base bg-primary text-primary-foreground hover:bg-secondary" onClick={saveProd} disabled={saving || uploading}>
              {saving ? tm.saving : tm.save}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── 删除分类确认 ── */}
      <AlertDialog open={!!deleteCat} onOpenChange={open => !open && setDeleteCat(null)}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>{tm.deleteCategory}</AlertDialogTitle>
            <AlertDialogDescription>{tm.deleteCategoryDesc.replace('{name}', deleteCat?.name ?? '')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tm.cancel}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={confirmDeleteCat}>{tm.confirmDelete}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── 删除商品确认 ── */}
      <AlertDialog open={!!deleteProd} onOpenChange={open => !open && setDeleteProd(null)}>
        <AlertDialogContent className="max-w-[calc(100%-2rem)] md:max-w-lg">
          <AlertDialogHeader>
            <AlertDialogTitle>{tm.deleteProduct}</AlertDialogTitle>
            <AlertDialogDescription>{tm.deleteProductDesc.replace('{name}', deleteProd?.name ?? '')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{tm.cancel}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground" onClick={confirmDeleteProd}>{tm.confirmDelete}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
