import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Pencil, Info, DollarSign, ArrowLeft, Layers, Star, ChevronDown, Store } from 'lucide-react';
import { useCategories } from '@/hooks/useCategories';
import { Product } from '@/types/product';
import { ProductVariations } from '@/components/ProductVariations';
import { useProductVariations } from '@/hooks/useProductVariations';
import { SubcategorySelect } from '@/components/SubcategorySelect';
import { ImageThumbWithBgRemoval } from '@/components/ImageThumbWithBgRemoval';
import { BarcodeInput } from '@/components/BarcodeInput';
import { normalizeProductImage } from '@/utils/normalizeProductImage';
import { upscaleImage } from '@/utils/upscaleImage';
import { reverseMarginFromPrice, repriceAllVariations, isPricingDisabled, isVariationPricingDisabled } from '@/lib/pricing';
import { sanitizeDecimalInput } from '@/lib/utils';
import { resolveOptionalMeasurementUpdate } from '@/utils/productMeasurements';

interface ProductEditProps {
  product?: Product;
  mode?: 'edit' | 'create';
  onUpdate: () => void;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
}

const EMPTY_PRODUCT: Product = {
  id: '',
  name: '',
  description: '',
  short_description: '',
  price: 0,
  category: '',
  image_url: null,
  images: [],
  rating: 0,
  stock: 0,
  featured: false,
  on_sale: false,
  sale_price: undefined,
  sale_ends_at: undefined,
  minimum_quantity: 1,
  sku: '',
  sold_by_weight: false,
  brand: '',
  pound_test: '',
  size: '',
  subcategory: '',
};

export function ProductEdit({ product: productProp, mode = 'edit', onUpdate, open: openProp, onOpenChange, hideTrigger }: ProductEditProps) {
  const product = productProp || EMPTY_PRODUCT;
  const isCreate = mode === 'create';
  const { toast } = useToast();
  const { categories, primaries, getSubcategoriesOf } = useCategories();
  const [internalOpen, setInternalOpen] = useState(false);
  const open = openProp !== undefined ? openProp : internalOpen;
  const setOpen = (v: boolean) => {
    if (onOpenChange) onOpenChange(v);
    else setInternalOpen(v);
  };
  const [fieldErrors, setFieldErrors] = useState<Record<string, boolean>>({});
  const { permissions } = useAuth();
  const [activeTab, setActiveTab] = useState('info');
  const [showSiteDetail, setShowSiteDetail] = useState(true);
  const [showPdvDetail, setShowPdvDetail] = useState(true);
  const [name, setName] = useState(product.name);
  const [description, setDescription] = useState(product.description);
  const [shortDescription, setShortDescription] = useState(product.short_description || '');
  const [price, setPrice] = useState(product.price.toString());
  const [category, setCategory] = useState(product.category);
  const [subcategory, setSubcategory] = useState((product as any).subcategory || '');
  const [stock, setStock] = useState(product.stock.toString());
  const [minStock, setMinStock] = useState((product as any).min_stock?.toString() || '');
  const [existingImages, setExistingImages] = useState<string[]>(product.images || []);
  const [newImages, setNewImages] = useState<File[]>([]);
  const [updating, setUpdating] = useState(false);
  const [generatingSummary, setGeneratingSummary] = useState(false);
  const [featured, setFeatured] = useState(product.featured || false);
  const [onSale, setOnSale] = useState(product.on_sale || false);
  const [salePrice, setSalePrice] = useState(product.sale_price?.toString() || '');
  const [saleEndsAt, setSaleEndsAt] = useState(
    product.sale_ends_at ? new Date(product.sale_ends_at).toISOString().slice(0, 16) : ''
  );
  const [minimumQuantity, setMinimumQuantity] = useState(product.minimum_quantity?.toString() || '1');
  const [sku, setSku] = useState(product.sku || '');
  const [upscaleImages, setUpscaleImages] = useState(false);
  const [soldByWeight, setSoldByWeight] = useState(product.sold_by_weight || false);
  const [pdvOnly, setPdvOnly] = useState((product as any).pdv_only || false);
  const [pdvNoMarkup, setPdvNoMarkup] = useState((product as any).pdv_no_markup || false);
  const [brand, setBrand] = useState(product.brand || '');
  const [poundTest, setPoundTest] = useState(product.pound_test || '');
  const [size, setSize] = useState(product.size || '');

  // Preço PDV (PIX/Dinheiro). Débito e Crédito são calculados pela fórmula fixa.
  const [pricePdv, setPricePdv] = useState((product as any).price_pdv?.toString() || '');
  const [pricePdvPix, setPricePdvPix] = useState((product as any).price_pdv_pix?.toString() || '');
  const [pricePdvCash, setPricePdvCash] = useState((product as any).price_pdv_cash?.toString() || '');
  const [pricePdvDebit, setPricePdvDebit] = useState((product as any).price_pdv_debit?.toString() || '');
  const [pricePdvCredit, setPricePdvCredit] = useState((product as any).price_pdv_credit?.toString() || '');

  // Formação de Preço (cálculo de custo, margem, impostos)
  const [cost, setCost] = useState((product as any).cost?.toString() || '');
  const [freightPct, setFreightPct] = useState((product as any).freight_pct?.toString() || '');
  const [opCostPct, setOpCostPct] = useState((product as any).op_cost_pct?.toString() || '');
  const [taxPct, setTaxPct] = useState((product as any).tax_pct?.toString() || '');
  const [minSalePrice, setMinSalePrice] = useState((product as any).min_sale_price?.toString() || '');
  const [siteMarginPct, setSiteMarginPct] = useState('');
  const [editMargin, setEditMargin] = useState('');
  const [costGroupId, setCostGroupId] = useState<string>((product as any).cost_group_id || 'none');
  const [costGroups, setCostGroups] = useState<{ id: string; name: string; cost: number }[]>([]);

  // Peso e dimensões para cálculo de frete (Melhor Envio)
  const [weightGrams, setWeightGrams] = useState((product as any).weight_grams?.toString() || '');
  const [lengthCm, setLengthCm] = useState((product as any).length_cm?.toString() || '');
  const [widthCm, setWidthCm] = useState((product as any).width_cm?.toString() || '');
  const [heightCm, setHeightCm] = useState((product as any).height_cm?.toString() || '');
  
  // Usar hook personalizado para gerenciar variações
  const { 
    variations, 
    setVariations, 
    loading: variationsLoading,
    loadVariations, 
    saveVariations 
  } = useProductVariations();
  // Flag que indica se já completamos pelo menos um load das variações
  // após abrir o dialog. Bloqueia o submit antes disso para evitar que
  // um save "vazio" apague variações existentes no banco.
  const [variationsLoaded, setVariationsLoaded] = useState(false);
  const [hasVariations, setHasVariations] = useState(false);

  // ── Helpers de formatação ──
  const fmtBRL = (v: number | null | undefined) =>
    (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const parseNum = (s: string): number => {
    if (!s) return 0;
    const n = Number(s.replace(',', '.'));
    return isNaN(n) ? 0 : n;
  };

  // ── Valores ao vivo da formação de preço ──
  const liveCost = parseNum(cost);
  const livePricePdv = pricePdv ? parseFloat(pricePdv) : (minSalePrice ? parseFloat(minSalePrice) : (price ? parseFloat(price) : 0));
  const liveFreightPct = parseNum(freightPct);
  const liveOpCostPct = parseNum(opCostPct);
  const liveTaxPct = parseNum(taxPct);
  const liveMinSale = parseNum(minSalePrice);
  const liveSiteMarginPct = parseNum(siteMarginPct);
  const liveFreight = liveCost * (liveFreightPct / 100);
  const liveOpCost = liveCost * (liveOpCostPct / 100);
  const liveTax = livePricePdv * (liveTaxPct / 100);
  const liveBaseCost = liveCost + liveFreight + liveOpCost;
  const liveTotalCost = liveBaseCost;
  // Site live values
  const pricingDisabled = isPricingDisabled(liveCost, freightPct, opCostPct);
  const siteMarginFilled = parseNum(siteMarginPct) > 0;
  const pdvMarginFilled = parseNum(editMargin) > 0;
  const pdvMarginNum = parseNum(editMargin);
  const liveProfit = pdvMarginFilled ? (liveBaseCost * (pdvMarginNum / 100)) : 0;
  const liveMargin = pdvMarginFilled ? (livePricePdv > 0 ? (liveProfit / livePricePdv) * 100 : 0) : 0;
  const liveMarkup = pdvMarginFilled ? (liveBaseCost > 0 ? (liveProfit / liveBaseCost) * 100 : 0) : 0;
  const liveSiteProfit = siteMarginFilled ? (liveBaseCost * (liveSiteMarginPct / 100)) : 0;
  const liveSiteMargin = siteMarginFilled ? (liveMinSale > 0 ? (liveSiteProfit / liveMinSale) * 100 : 0) : 0;
  const liveSiteMarkup = siteMarginFilled ? (liveBaseCost > 0 ? (liveSiteProfit / liveBaseCost) * 100 : 0) : 0;

  // DEBUG: rastreia TUDO que muda siteMarginPct
  useEffect(() => {
    console.log('🔴 siteMarginPct MUDOU para:', siteMarginPct);
    console.trace('🔴 stack trace da mudança');
  }, [siteMarginPct]);

  // ── Carregar grupos de custo ──
  useEffect(() => {
    supabase.from('cost_groups').select('id, name, cost').order('name').then(({ data }) => {
      if (data) setCostGroups(data as { id: string; name: string; cost: number }[]);
    });
  }, []);

  // ── Handlers de formação de preço ──
  // Calcula preço final: baseCost * (1 + margin/100) / (1 - taxPct/100)
  const calcPrice = (baseCost: number, marginPct: number, taxPct: number) => {
    const denom = 1 - taxPct / 100;
    if (denom <= 0) return baseCost * (1 + marginPct / 100);
    return (baseCost * (1 + marginPct / 100)) / denom;
  };

  // Recalcula preços PDV, Site e Variações mantendo o markup atual quando % mudam
  const repriceFromPercents = (newFreightPct: number, newOpPct: number, newTaxPct: number) => {
    const newBaseCost = liveCost * (1 + newFreightPct / 100 + newOpPct / 100);
    const mPdv = parseNum(editMargin);
    if (mPdv >= 0) {
      const newPrice = calcPrice(newBaseCost, mPdv, newTaxPct);
      if (isFinite(newPrice) && newPrice > 0) setPricePdv(newPrice.toFixed(2));
    }
    const mSite = parseNum(siteMarginPct);
    if (mSite >= 0) {
      const newMin = calcPrice(newBaseCost, mSite, newTaxPct);
      if (isFinite(newMin) && newMin > 0) setMinSalePrice(newMin.toFixed(2));
    }
    // Atualizar também os preços das variações
    if (variations.length > 0) {
      setVariations(prev => repriceAllVariations(prev, newFreightPct, newOpPct, newTaxPct));
    }
  };

  // Margem de lucro → recalcula preço PDV
  const handleFormMarginChange = (v: string) => {
    setEditMargin(v);
    const m = parseNum(v);
    if (m < 0) return;
    const newPrice = calcPrice(liveBaseCost, m, liveTaxPct);
    if (isFinite(newPrice) && newPrice > 0) {
      setPricePdv(newPrice.toFixed(2));
    }
  };

  // Preço PDV → recalcula margem
  const handleFormPriceChange = (v: string) => {
    setPricePdv(v);
    const p = parseNum(v);
    // Reverse: margin = (price * (1 - tax/100) / baseCost) - 1
    const denom = 1 - liveTaxPct / 100;
    const base = denom > 0 ? p * denom : p;
    if (base > 0 && liveBaseCost > 0) {
      const m = ((base / liveBaseCost) - 1) * 100;
      setEditMargin(m.toFixed(2));
    }
  };

  // Custo → recalcula margem
  const handleFormCostChange = (v: string) => {
    setCost(v);
    const m = parseNum(editMargin);
    if (m < 0) return;
    const newBaseCost = parseNum(v) * (1 + liveFreightPct / 100 + liveOpCostPct / 100);
    const newPrice = calcPrice(newBaseCost, m, liveTaxPct);
    if (isFinite(newPrice) && newPrice > 0) {
      setPricePdv(newPrice.toFixed(2));
    }
  };

  const handleFormFreightPctChange = (v: string) => {
    setFreightPct(v);
    repriceFromPercents(parseNum(v), liveOpCostPct, liveTaxPct);
  };

  const handleFormOpCostPctChange = (v: string) => {
    setOpCostPct(v);
    repriceFromPercents(liveFreightPct, parseNum(v), liveTaxPct);
  };

  const handleFormTaxPctChange = (v: string) => {
    // Salva margens atuais para garantir que não sejam alteradas
    const savedSiteMargin = siteMarginPct;
    const savedEditMargin = editMargin;
    setTaxPct(v);
    repriceFromPercents(liveFreightPct, liveOpCostPct, parseNum(v));
    // Restaura margens explicitamente (proteção contra qualquer efeito colateral)
    setSiteMarginPct(savedSiteMargin);
    setEditMargin(savedEditMargin);
  };

  // Margem do Site (%) → recalcula Valor mínimo de venda
  const handleFormSiteMarginChange = (v: string) => {
    setSiteMarginPct(v);
    const m = parseNum(v);
    if (m < 0) return;
    const newMin = calcPrice(liveBaseCost, m, liveTaxPct);
    if (isFinite(newMin) && newMin > 0) {
      setMinSalePrice(newMin.toFixed(2));
    }
  };

  // Valor mínimo de venda → deriva margem implícita
  const handleFormMinSaleChange = (v: string) => {
    setMinSalePrice(v);
    const min = parseNum(v);
    const denom = 1 - liveTaxPct / 100;
    const base = denom > 0 ? min * denom : min;
    if (liveBaseCost > 0 && base > 0) {
      const m = ((base / liveBaseCost) - 1) * 100;
      setSiteMarginPct(m.toFixed(2));
    } else if (!v) {
      setSiteMarginPct('');
    }
  };

  // Grupo de custo → atualiza custo se selecionado
  const handleFormGroupChange = (groupId: string) => {
    setCostGroupId(groupId);
    if (groupId !== 'none') {
      const group = costGroups.find(g => g.id === groupId);
      if (group) {
        const newCost = String(group.cost);
        setCost(newCost);
        // Recalcula margem com o novo custo do grupo
        const c = group.cost;
        const f = liveFreightPct / 100;
        const o = liveOpCostPct / 100;
        const base = c * (1 + f + o);
        const denom = 1 - liveTaxPct / 100;
        if (livePricePdv > 0 && base > 0 && denom > 0) {
          const basePrice = livePricePdv * denom;
          const m = ((basePrice / base) - 1) * 100;
          setEditMargin(m.toFixed(2));
        }
      }
    }
  };

  // Carregar variações quando o dialog abre
  // Atalho F4 para salvar
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'F4') {
        e.preventDefault();
        handleSubmit();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, variationsLoaded, variationsLoading]);

  useEffect(() => {
    if (open && product.id) {
      console.log('📂 Carregando dados do produto para edição:', product.id);
      
      // Resetar aba ativa para Informações
      setActiveTab('info');

      // Resetar flag e carregar variações antes de liberar o submit
      setVariationsLoaded(false);
      setHasVariations(false);
      loadVariations(product.id).finally(() => {
        setVariationsLoaded(true);
        // Inicializa _editMargin e _editSiteMargin para variações recém-carregadas
        // Usa os percentuais ORIGINAIS do produto (do banco) para extrair a margem
        // com que cada variação foi salva — sem isso, repriceAllVariations pula
        // variações que não têm _editMargin (pois parseFloat(undefined ?? '0') = 0),
        // fazendo o preço não ser recalculado e a margem exibida ficar errada.
        setVariations(prev => prev.map(v => {
          const varCost = Number((v as any).cost ?? (product as any).cost ?? 0);
          if (varCost <= 0) return v;

          const f = Number((product as any).freight_pct ?? 0) / 100;
          const o = Number((product as any).op_cost_pct ?? 0) / 100;
          const t = Number((product as any).tax_pct ?? 0);
          const varBase = varCost * (1 + f + o);

          const updates: Record<string, any> = {};

          // Arredonda price_pdv e min_sale_price para 2 casas decimais
          // (valores vindos do banco podem ter precisão maior)
          if (v.price_pdv != null) {
            updates.price_pdv = Math.round(Number(v.price_pdv) * 100) / 100;
          }
          if (v.min_sale_price != null) {
            updates.min_sale_price = Math.round(Number(v.min_sale_price) * 100) / 100;
          }

          // Inicializa _editMargin e _editSiteMargin se ainda não existirem
          if ((v as any)._editMargin == null && varBase > 0 && Number(updates.price_pdv ?? v.price_pdv) > 0) {
            updates._editMargin = reverseMarginFromPrice(
              Number(updates.price_pdv ?? v.price_pdv), varBase, t
            ).toFixed(2);
          }
          if ((v as any)._editSiteMargin == null && varBase > 0 && Number(updates.min_sale_price ?? v.min_sale_price) > 0) {
            updates._editSiteMargin = reverseMarginFromPrice(
              Number(updates.min_sale_price ?? v.min_sale_price), varBase, t
            ).toFixed(2);
          }

          return Object.keys(updates).length > 0 ? { ...v, ...updates } : v;
        }));
      });
      
      // Resetar estados do formulário
      setName(product.name);
      setDescription(product.description);
      setShortDescription(product.short_description || '');
      setPrice(product.price.toString());
      setCategory(product.category);
      setSubcategory((product as any).subcategory || '');
      setStock(product.stock.toString());
      setMinStock((product as any).min_stock?.toString() || '');
      setExistingImages(product.images || []);
      setNewImages([]);
      setFeatured(product.featured || false);
      setOnSale(product.on_sale || false);
      setSalePrice(product.sale_price?.toString() || '');
      setSaleEndsAt(product.sale_ends_at ? new Date(product.sale_ends_at).toISOString().slice(0, 16) : '');
      setMinimumQuantity(product.minimum_quantity?.toString() || '1');
      setSku(product.sku || '');
      setSoldByWeight(product.sold_by_weight || false);
      setPdvOnly((product as any).pdv_only || false);
      setPdvNoMarkup((product as any).pdv_no_markup || false);
      setBrand(product.brand || '');
      setPoundTest(product.pound_test || '');
      setSize(product.size || '');
      setPricePdv((product as any).price_pdv != null ? (Math.round(Number((product as any).price_pdv) * 100) / 100).toFixed(2) : '');
      setCost((product as any).cost?.toString() || '');
      setFreightPct((product as any).freight_pct?.toString() || '');
      setOpCostPct((product as any).op_cost_pct?.toString() || '');
      setTaxPct((product as any).tax_pct?.toString() || '');
      const msp = (product as any).min_sale_price;
      setMinSalePrice(msp != null ? (Math.round(Number(msp) * 100) / 100).toFixed(2) : '');
      // Inicializa siteMarginPct a partir do min_sale_price salvo
      if (msp != null && msp > 0) {
        const c = Number((product as any).cost ?? 0);
        const fPct = Number((product as any).freight_pct ?? 0);
        const oPct = Number((product as any).op_cost_pct ?? 0);
        const tPct = Number((product as any).tax_pct ?? 0);
        const base = c + c * (fPct / 100) + c * (oPct / 100);
        const denom = 1 - tPct / 100;
        if (base > 0 && denom > 0) {
          setSiteMarginPct((((msp * denom / base) - 1) * 100).toFixed(2));
        } else {
          setSiteMarginPct('');
        }
      } else {
        setSiteMarginPct('');
      }
      setCostGroupId((product as any).cost_group_id || 'none');
      // Inicializa editMargin a partir do PDV price e custo base salvos
      {
        const pdv = Number((product as any).price_pdv ?? product.price ?? 0);
        const cos = Number((product as any).cost ?? 0);
        const fP = Number((product as any).freight_pct ?? 0);
        const oP = Number((product as any).op_cost_pct ?? 0);
        const tP = Number((product as any).tax_pct ?? 0);
        const base = cos + cos * (fP / 100) + cos * (oP / 100);
        const denom = 1 - tP / 100;
        if (pdv > 0 && base > 0 && denom > 0) {
          setEditMargin((((pdv * denom / base) - 1) * 100).toFixed(2));
        } else {
          setEditMargin('');
        }
      }
      setWeightGrams((product as any).weight_grams?.toString() || '');
      setLengthCm((product as any).length_cm?.toString() || '');
      setWidthCm((product as any).width_cm?.toString() || '');
      setHeightCm((product as any).height_cm?.toString() || '');
    }
  }, [open, product.id, loadVariations]);

  // Sincroniza toggle quando variações são detectadas
  useEffect(() => {
    if (variationsLoaded && variations.length > 0) {
      setHasVariations(true);
    }
  }, [variationsLoaded, variations.length]);

  const handleDeleteImage = (imageUrl: string) => {
    setExistingImages(existingImages.filter(img => img !== imageUrl));
  };

  const handleNewImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    setNewImages([...newImages, ...files]);
  };

  const handleRemoveNewImage = (index: number) => {
    setNewImages(newImages.filter((_, i) => i !== index));
  };

  const handleGenerateSummary = async () => {
    if (!description.trim()) {
      toast({
        title: 'Atenção',
        description: 'Preencha a descrição antes de gerar o resumo.',
        variant: 'destructive',
      });
      return;
    }

    setGeneratingSummary(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-summary', {
        body: { description }
      });

      if (error) throw error;

      setShortDescription(data.summary);
      toast({
        title: 'Resumo gerado!',
        description: 'O resumo foi gerado com sucesso.',
      });
    } catch (error: any) {
      toast({
        title: 'Erro ao gerar resumo',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setGeneratingSummary(false);
    }
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    e?.preventDefault();

    // SEGURANÇA: nunca salvar antes de carregar as variações existentes.
    // Sem isso, um submit precoce envia variations=[] e o saveVariations
    // interpreta como "remover todas", apagando UUIDs referenciados por
    // pedidos, listas de compra e carrinhos.
    if (!isCreate && (!variationsLoaded || variationsLoading)) {
      toast({
        title: 'Aguarde',
        description: 'Carregando variações do produto...',
      });
      return;
    }

    // Validação de campos obrigatórios
    const newFieldErrors: Record<string, boolean> = {};
    if (!name.trim()) newFieldErrors['name'] = true;
    if (!category) newFieldErrors['category'] = true;
    if (!shortDescription.trim()) newFieldErrors['shortDescription'] = true;
    if (!hasVariations && (!stock || parseInt(stock) < 0)) newFieldErrors['stock'] = true;

    if (Object.keys(newFieldErrors).length > 0) {
      setFieldErrors(newFieldErrors);
      setActiveTab('info');
      toast({
        title: 'Campos obrigatórios não preenchidos',
        description: 'Os campos destacados em vermelho são obrigatórios.',
        variant: 'destructive',
      });
      return;
    }

    setFieldErrors({});
    setUpdating(true);

    console.log('=== ATUALIZANDO PRODUTO ===');
    console.log('Produto ID:', product.id);
    console.log('Variações atuais:', variations.length);

    try {
      const allImageUrls = [...existingImages];

      // Upload de novas imagens
      for (let i = 0; i < newImages.length; i++) {
        const original = newImages[i];
        try {
          // Validar tamanho (máximo 10MB)
          if (original.size > 10 * 1024 * 1024) {
            toast({
              title: 'Imagem muito grande',
              description: `A imagem ${original.name} excede 10MB`,
              variant: 'destructive'
            });
            continue;
          }

          // Normaliza para quadrado 800x800 com fundo branco
          let file: File;
          try {
            let processed = original;
            if (upscaleImages) {
              processed = await upscaleImage(original, 2);
            }
            file = await normalizeProductImage(processed, 800, 0.9);
          } catch {
            file = original;
          }

          const fileExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
          const fileName = `product-${Date.now()}-${i}.${fileExt}`;

          const { data: uploadData, error: uploadError } = await supabase.storage
            .from('product-images')
            .upload(fileName, file, { contentType: file.type });

          if (uploadError) {
            console.error('Erro no upload:', uploadError);
            toast({
              title: 'Erro no upload',
              description: `Falha ao enviar ${file.name}`,
              variant: 'destructive'
            });
            continue;
          }

          const { data: { publicUrl } } = supabase.storage
            .from('product-images')
            .getPublicUrl(fileName);

          allImageUrls.push(publicUrl);
        } catch (error: any) {
          console.error('Erro ao processar imagem:', error);
        }
      }

      // Deletar imagens removidas
      const deletedImages = (product.images || []).filter(img => !existingImages.includes(img));
      for (const imageUrl of deletedImages) {
        const fileName = imageUrl.split('/').pop();
        if (fileName) {
          await supabase.storage.from('product-images').remove([fileName]);
        }
      }

      // Detectar mudança manual de estoque do produto pai (sem variações).
      // Se mudou, registra como ajuste manual no livro-caixa em vez de update direto.
      // Com variações, o estoque é a soma das variações (calculado abaixo).
      const sumVariationsStock = variations.reduce((s, v) => s + (Number(v.stock) || 0), 0);
      const newStockValue = hasVariations ? sumVariationsStock : (stock ? parseInt(stock) : 0);
      const stockChanged = newStockValue !== product.stock && !hasVariations;
      const stockDelta = newStockValue - product.stock;

      // Recalcular preços com precisão total a partir das margens
      // (evita perda de precisão do arredondamento do state para 2 casas decimais)
      const saveCost = cost ? parseFloat(cost) : 0;
      const saveFreightPct = freightPct ? parseFloat(freightPct) : 0;
      const saveOpCostPct = opCostPct ? parseFloat(opCostPct) : 0;
      const saveTaxPct = taxPct ? parseFloat(taxPct) : 0;
      const saveBase = saveCost * (1 + saveFreightPct / 100 + saveOpCostPct / 100);
      const saveEditMargin = editMargin ? parseFloat(editMargin) : 0;
      const saveSiteMarginPct = parseFloat(siteMarginPct || '0');
      const computedPricePdv = saveEditMargin > 0 && saveBase > 0
        ? calcPrice(saveBase, saveEditMargin, saveTaxPct)
        : (pricePdv ? parseFloat(pricePdv) : null);
      const computedMinSale = saveSiteMarginPct > 0 && saveBase > 0
        ? calcPrice(saveBase, saveSiteMarginPct, saveTaxPct)
        : (minSalePrice ? parseFloat(minSalePrice) : null);

      // Atualizar dados do produto (SEM o campo stock, ele é gerenciado pelo livro-caixa)
      const productUpdate: any = {
        name,
        description,
        short_description: shortDescription,
        price: computedMinSale ?? computedPricePdv ?? (price ? parseFloat(price) : 0),
        category,
        subcategory: subcategory || null,
        sku: sku || null,
        minimum_quantity: minimumQuantity ? parseInt(minimumQuantity) : 1,
        min_stock: minStock ? parseInt(minStock) : 0,
        sold_by_weight: soldByWeight,
        brand: brand || null,
        pound_test: poundTest || null,
        size: size || null,
        images: allImageUrls,
        image_url: allImageUrls[0] || null,
        featured,
        on_sale: onSale,
        sale_price: onSale && salePrice ? parseFloat(salePrice) : null,
        sale_ends_at: onSale && saleEndsAt ? new Date(saleEndsAt).toISOString() : null,
        price_pdv: computedPricePdv,
        // Fórmula fixa: PIX/Dinheiro = base, Débito = +3%, Crédito = +4%
        price_pix_percent: 0,
        price_cash_percent: 0,
        price_debit_percent: 5,
        price_credit_percent: 10.25,
        price_pdv_pix: pricePdvPix ? parseFloat(pricePdvPix) : null,
        price_pdv_cash: pricePdvCash ? parseFloat(pricePdvCash) : null,
        price_pdv_debit: pricePdvDebit ? parseFloat(pricePdvDebit) : null,
        price_pdv_credit: pricePdvCredit ? parseFloat(pricePdvCredit) : null,
        weight_grams: resolveOptionalMeasurementUpdate(weightGrams, (product as any).weight_grams, 'int'),
        length_cm: resolveOptionalMeasurementUpdate(lengthCm, (product as any).length_cm, 'float'),
        width_cm: resolveOptionalMeasurementUpdate(widthCm, (product as any).width_cm, 'float'),
        height_cm: resolveOptionalMeasurementUpdate(heightCm, (product as any).height_cm, 'float'),
        pdv_only: pdvOnly,
        pdv_no_markup: pdvNoMarkup,
        cost: cost ? parseFloat(cost) : null,
        freight_pct: freightPct ? parseFloat(freightPct) : 0,
        op_cost_pct: opCostPct ? parseFloat(opCostPct) : 0,
        tax_pct: taxPct ? parseFloat(taxPct) : 0,
        min_sale_price: computedMinSale,
        cost_group_id: costGroupId !== 'none' ? costGroupId : null,
      };

      let productId = product.id;

      if (isCreate) {
        productUpdate.stock = newStockValue;
        const { data: created, error: insertError } = await supabase
          .from('products')
          .insert(productUpdate)
          .select('id')
          .single();
        if (insertError) throw insertError;
        productId = created.id;
      } else {
        // Se NÃO mudou o estoque, atualiza tudo de uma vez
        if (!stockChanged) {
          productUpdate.stock = newStockValue;
        }

        const { error: updateError } = await supabase
          .from('products')
          .update(productUpdate)
          .eq('id', product.id);

        if (updateError) throw updateError;

        // Se mudou o estoque, aplica via RPC atômica (registra no livro-caixa)
        if (stockChanged && stockDelta !== 0) {
          const { error: stockError } = await supabase.rpc('apply_stock_movement', {
            p_product_id: product.id,
            p_variation_id: null,
            p_quantity_delta: stockDelta,
            p_movement_type: 'manual_adjust',
            p_order_id: null,
            p_reason: `Ajuste manual no painel (de ${product.stock} para ${newStockValue})`,
          });
          if (stockError) {
            console.error('Erro ao ajustar estoque:', stockError);
            toast({ title: 'Aviso', description: 'Produto atualizado mas houve erro ao registrar movimentação de estoque', variant: 'destructive' });
          }
        }
      }

      // Processar imagens das variações (converter base64 para URLs públicas)
      if (hasVariations) {
      const processedVariations = await Promise.all(
        variations.map(async (variation) => {
          console.log(`🔍 Processando variação: ${variation.name}`);
          console.log(`📸 Image URL tipo:`, variation.image_url?.substring(0, 50));
          
          // Se a imagem for base64, fazer upload
          if (variation.image_url && variation.image_url.startsWith('data:')) {
            try {
              console.log(`📤 Fazendo upload da imagem da variação ${variation.name}`);
              
              // Converter base64 para blob
              const response = await fetch(variation.image_url);
              const blob = await response.blob();
              
              // Upload para o storage
              const fileExt = blob.type.split('/')[1] || 'jpg';
              const fileName = `variation-${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
              
              console.log(`📤 Nome do arquivo: ${fileName}, tamanho: ${blob.size} bytes`);
              
              const { data: uploadData, error: uploadError } = await supabase.storage
                .from('product-images')
                .upload(fileName, blob);

              if (uploadError) {
                console.error('❌ Erro ao fazer upload:', uploadError);
                toast({
                  title: 'Erro ao salvar imagem',
                  description: `Não foi possível salvar a imagem da variação ${variation.name}`,
                  variant: 'destructive'
                });
                return { ...variation, image_url: null };
              }

              console.log('✅ Upload concluído:', uploadData.path);

              // Obter URL pública
              const { data: { publicUrl } } = supabase.storage
                .from('product-images')
                .getPublicUrl(fileName);

              console.log('✅ URL pública gerada:', publicUrl);
              return { ...variation, image_url: publicUrl };
              
            } catch (error) {
              console.error('❌ Erro ao processar imagem da variação:', error);
              toast({
                title: 'Erro',
                description: `Erro ao processar imagem da variação ${variation.name}`,
                variant: 'destructive'
              });
              return { ...variation, image_url: null };
            }
          }
          
          // Se não for base64, manter como está
          console.log(`✅ Variação ${variation.name} - imagem já é URL ou não tem imagem`);
          return variation;
        })
      );

      console.log('📊 Variações processadas:', processedVariations.length);

      // Salvar variações com URLs públicas
      const { success: varSuccess, error: varError } = await saveVariations(productId, processedVariations);
      
      if (!varSuccess) {
        throw new Error(varError || 'Erro ao salvar variações');
      }
      } // fim if (hasVariations)

      toast({
        title: isCreate ? 'Produto criado!' : 'Produto atualizado!',
        description: isCreate ? 'O produto foi adicionado com sucesso.' : 'As alterações foram salvas com sucesso.',
      });

      console.log(isCreate ? '=== CRIAÇÃO CONCLUÍDA ===' : '=== ATUALIZAÇÃO CONCLUÍDA ===');
      setOpen(false);
      onUpdate();
      
    } catch (error: any) {
      console.error(isCreate ? '❌ Erro ao criar produto:' : '❌ Erro ao atualizar produto:', error);
      toast({
        title: 'Erro ao atualizar produto',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setUpdating(false);
    }
  };

  return (
    <>
      {!hideTrigger && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setOpen(true)}
        >
          <Pencil className="w-4 h-4" />
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-6xl max-h-[95vh] overflow-y-auto"
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
          hideClose
        >
          <form onSubmit={handleSubmit} className="space-y-4 pb-4">
            <Tabs defaultValue="info" className="w-full" onValueChange={setActiveTab}>
              {permissions.fiscal && (
              <TabsList className="w-full h-auto p-1.5">
                <TabsTrigger value="info" className="flex-1 gap-2 py-2.5">
                  <Info className="w-4 h-4" /> Informações do Produto
                </TabsTrigger>
                <TabsTrigger value="precificacao" className="flex-1 gap-2 py-2.5">
                  <DollarSign className="w-4 h-4" /> Preço de Venda
                </TabsTrigger>
              </TabsList>
              )}

              {activeTab !== 'precificacao' && (
                <DialogHeader className="mt-4">
                  <div className="flex items-center justify-between">
                    <DialogTitle>
                      {isCreate ? 'Novo Produto' : 'Editar Produto'}
                    </DialogTitle>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setFeatured(!featured)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition-all duration-200 shrink-0 ${
                          featured
                            ? 'bg-amber-100 text-amber-800 border-amber-400 shadow-sm dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-600'
                            : 'bg-background text-muted-foreground border-muted-foreground/20 hover:border-amber-300 hover:text-amber-700 dark:hover:text-amber-400'
                        }`}
                      >
                        <Star className={`w-3.5 h-3.5 transition-colors ${featured ? 'fill-amber-500 text-amber-500' : ''}`} />
                        Destaque
                      </button>
                      <button
                        type="button"
                        onClick={() => setPdvOnly(!pdvOnly)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition-all duration-200 shrink-0 ${
                          pdvOnly
                            ? 'bg-indigo-100 text-indigo-800 border-indigo-400 shadow-sm dark:bg-indigo-900/40 dark:text-indigo-300 dark:border-indigo-600'
                            : 'bg-background text-muted-foreground border-muted-foreground/20 hover:border-indigo-300 hover:text-indigo-700 dark:hover:text-indigo-400'
                        }`}
                      >
                        <Store className={`w-3.5 h-3.5 transition-colors ${pdvOnly ? 'text-indigo-500' : ''}`} />
                        Exclusivo PDV
                      </button>
                    </div>
                  </div>
                  <DialogDescription>
                    {isCreate
                      ? 'Preencha os dados do novo produto'
                      : 'Atualize as informações do produto'}
                  </DialogDescription>
                </DialogHeader>
              )}

              {permissions.fiscal && (
              <TabsContent value="precificacao" className="space-y-4 mt-4">
                {hasVariations && variations.length > 0 ? (
                  <>
                    <div className="flex items-center gap-3">
                      {product.image_url ? (
                        <img src={product.image_url} alt={product.name} className="w-[60px] h-[60px] object-cover rounded-md flex-shrink-0" />
                      ) : null}
                      <div className="flex-1">
                        <h2 className="text-lg font-bold">{product.name}</h2>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                            {product.category || 'Sem categoria'}
                          </span>
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                            Estoque: {hasVariations ? variations.reduce((s, v) => s + (Number(v.stock) || 0), 0) : product.stock} {soldByWeight ? 'g' : 'un.'}
                          </span>
                          {soldByWeight && (
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                              Vendido por peso
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* === VARIAÇÕES: Formação global === */}
                    <div className="space-y-3 p-4 border-2 border-emerald-500/20 rounded-lg bg-emerald-500/5">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-sm font-bold uppercase tracking-wide">Formação de Preço</h3>
                          <p className="text-xs text-muted-foreground">Frete, custos operacionais e imposto são globais para todas as variações.</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Label htmlFor="sold-by-weight-var" className="text-[11px] text-muted-foreground">Venda por Peso</Label>
                          <Switch id="sold-by-weight-var" disabled={pricingDisabled} checked={soldByWeight} onCheckedChange={setSoldByWeight} />
                        </div>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <Label htmlFor="pf-freight">Frete (%)</Label>
                          <Input id="pf-freight" type="number" step="0.01" min="0" value={freightPct} onChange={(e) => handleFormFreightPctChange(e.target.value)} placeholder="0,00" />
                        </div>
                        <div>
                          <Label htmlFor="pf-opcost">Custos operacionais (%)</Label>
                          <Input id="pf-opcost" type="number" step="0.01" min="0" value={opCostPct} onChange={(e) => handleFormOpCostPctChange(e.target.value)} placeholder="0,00" />
                        </div>
                        <div>
                          <Label htmlFor="pf-tax-var">Imposto sobre a venda (%)</Label>
                          <Input id="pf-tax-var" type="number" step="0.01" min="0" value={taxPct} onChange={(e) => handleFormTaxPctChange(e.target.value)} placeholder="0,00" />
                        </div>
                      </div>
                    </div>
                    {/* PDV Pagamentos global */}
                    <div className="space-y-3 p-4 border-2 border-primary/20 rounded-lg bg-primary/5">
                      <div>
                        <h3 className="text-sm font-bold uppercase tracking-wide">Preço PDV — Pagamentos</h3>
                        <p className="text-xs text-muted-foreground">Percentuais globais. PIX/Dinheiro = base. Débito = +3%. Crédito = +4%.</p>
                      </div>
                      <div className="flex items-center justify-between rounded-md border bg-background p-2">
                        <div className="space-y-0.5">
                          <Label htmlFor="pdv-no-markup-var" className="text-xs">Sem acréscimo no PDV</Label>
                          <p className="text-[10px] text-muted-foreground">Mesmo preço em todos os métodos de pagamento</p>
                        </div>
                        <Switch id="pdv-no-markup-var" disabled={pricingDisabled} checked={pdvNoMarkup} onCheckedChange={setPdvNoMarkup} />
                      </div>
                      {pdvNoMarkup ? (
                        (() => {
                          const base = pricePdv ? parseFloat(pricePdv) : 0;
                          const fmt2 = (v: number) => v.toFixed(2);
                          return (
                            <div className="rounded-md bg-background p-2 border space-y-1">
                              <p className="text-[10px] uppercase text-muted-foreground">Dinheiro, pix, débito, crédito</p>
                              <Input type="number" step="0.01" value={pricePdvPix} onChange={(e) => { const pct = e.target.value; setPricePdvPix(pct); setPricePdvCash(pct); setPricePdvDebit(pct); setPricePdvCredit(pct); }} placeholder="0" disabled={pricingDisabled} className="h-8 text-center text-sm font-bold" />
                              <p className="text-[10px] text-muted-foreground">Porcentagem aplicada a todos os métodos</p>
                            </div>
                          );
                        })()
                      ) : (
                        (() => {
                        const base = pricePdv ? parseFloat(pricePdv) : 0;
                        const fmt2 = (v: number) => v.toFixed(2);
                        const pdvCell = (label: string, value: string, setValue: (v: string) => void, autoVal: number, pct?: string) => (
                          <div className="rounded-md bg-background p-2 border space-y-1">
                            <p className="text-[10px] uppercase text-muted-foreground">{label}{pct ? ` (${pct})` : ''}</p>
                            <Input type="number" step="0.01" value={value} onChange={(e) => setValue(e.target.value)} placeholder={fmt2(autoVal)} disabled={pricingDisabled} className="h-8 text-center text-sm font-bold" />
                            <p className="text-[10px] text-muted-foreground">auto: R$ {fmt2(autoVal)}</p>
                          </div>
                        );
                        return (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            {pdvCell('PIX', pricePdvPix, setPricePdvPix, base, '0%')}
                            {pdvCell('Dinheiro', pricePdvCash, setPricePdvCash, base, '0%')}
                            {pdvCell('Débito', pricePdvDebit, setPricePdvDebit, base * 1.03, '+3%')}
                            {pdvCell('Crédito', pricePdvCredit, setPricePdvCredit, base * 1.04, '+4%')}
                          </div>
                        );
                      })()
                      )}
                    </div>
                    {/* Per-variation cards */}
                    {variations
                      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
                      .map((v) => {
                        const varCost = Number((v as any).cost ?? liveCost);
                        const varPricePdv = Number(v.price_pdv ?? 0);
                        const varMinSale = Number(v.min_sale_price ?? 0);
                        const f = liveFreightPct / 100;
                        const o = liveOpCostPct / 100;
                        const t = liveTaxPct / 100;
                        const varBaseCost = varCost + varCost * f + varCost * o;
                        const varTotalCost = varBaseCost;
                        const editMarginVar = (v as any)._editMargin ?? (
                          varPricePdv > 0 && varBaseCost > 0
                            ? reverseMarginFromPrice(varPricePdv, varBaseCost, liveTaxPct).toFixed(2)
                            : ''
                        );
                        const editSiteMarginVar = (v as any)._editSiteMargin ?? (
                          varMinSale > 0 && varBaseCost > 0
                            ? reverseMarginFromPrice(varMinSale, varBaseCost, liveTaxPct).toFixed(2)
                            : ''
                        );
                        const editMarginVarNum = parseNum(editMarginVar);
                        const editSiteMarginVarNum = parseNum(editSiteMarginVar);
                        const varProfit = varBaseCost * (editMarginVarNum / 100);
                        const varMargin = varPricePdv > 0 ? (varProfit / varPricePdv) * 100 : 0;
                        const varMarkup = varBaseCost > 0 ? (varProfit / varBaseCost) * 100 : 0;
                        const varSiteProfit = varBaseCost * (editSiteMarginVarNum / 100);
                        const varSiteMargin = varMinSale > 0 ? (varSiteProfit / varMinSale) * 100 : 0;
                        const varSiteMarkup = varBaseCost > 0 ? (varSiteProfit / varBaseCost) * 100 : 0;
                        const siteMarginVarFilled = parseNum(editSiteMarginVar) > 0;
                        const pdvMarginVarFilled = parseNum(editMarginVar) > 0;
                        const displayVarProfit = pdvMarginVarFilled ? varProfit : 0;
                        const displayVarMargin = pdvMarginVarFilled ? varMargin : 0;
                        const displayVarMarkup = pdvMarginVarFilled ? varMarkup : 0;
                        const displayVarSiteProfit = siteMarginVarFilled ? varSiteProfit : 0;
                        const displayVarSiteMargin = siteMarginVarFilled ? varSiteMargin : 0;
                        const displayVarSiteMarkup = siteMarginVarFilled ? varSiteMarkup : 0;

                        return (
                          <div key={v.id} className="space-y-3 p-4 border rounded-lg bg-muted/30">
                            <div className="flex items-center gap-2">
                              {v.image_url ? (
                                <img src={v.image_url} alt={v.name} className="w-[60px] h-[60px] object-cover rounded-md flex-shrink-0" />
                              ) : null}
                              <h4 className="text-sm font-bold">{v.name}</h4>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-end">
                              <div>
                                <Label className="text-xs">Custo (R${soldByWeight ? '/kg' : ''})</Label>
                                <Input type="number" step="0.01" min="0" value={(v as any).cost ?? ''} onChange={(e) => setVariations(prev => prev.map(x => x.id === v.id ? { ...x, cost: e.target.value ? parseFloat(e.target.value) : null } as any : x))} disabled={(v as any).cost_group_id && (v as any).cost_group_id !== 'none'} className="h-8 text-sm" />
                              </div>
                              <div>
                                <Label className="text-xs">Grupo de custo</Label>
                                <Select value={(v as any).cost_group_id || 'none'} onValueChange={(gid) => { setVariations(prev => prev.map(x => { if (x.id !== v.id) return x; const updated = { ...x, cost_group_id: gid === 'none' ? null : gid } as any; if (gid !== 'none') { const grp = costGroups.find(g => g.id === gid); if (grp) updated.cost = grp.cost; } return updated; })); }}>
                                  <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Sem grupo" /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="none">Sem grupo</SelectItem>
                                    {costGroups.map((g) => (<SelectItem key={g.id} value={g.id}>{g.name} — {fmtBRL(g.cost)}</SelectItem>))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="rounded-md border bg-muted/40 px-2 py-1.5 flex items-center justify-between text-xs">
                                <span className="text-muted-foreground">Custo total</span>
                                <span className="font-bold">{fmtBRL(varTotalCost)}</span>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                              <div className="space-y-2 p-3 border border-blue-500/20 rounded-md bg-blue-500/5">
                                <p className="text-xs font-semibold text-muted-foreground">Preço Site</p>
                                <div>
                                  <Label className="text-[11px]">Lucro sobre custo (%)</Label>
                                  <Input type="number" step="0.01" min="0" value={editSiteMarginVar} onChange={(e) => { const m = parseNum(e.target.value); const base = varCost + varCost * f + varCost * o; const newMin = calcPrice(base, m, liveTaxPct); const rounded = isFinite(newMin) && newMin > 0 ? Math.round(newMin * 100) / 100 : newMin; setVariations(prev => prev.map(x => x.id === v.id ? { ...x, min_sale_price: rounded, _editSiteMargin: e.target.value } as any : x)); }} placeholder="0,00" disabled={isVariationPricingDisabled(varCost, freightPct, opCostPct)} className="h-8 text-sm" />
                                </div>

                                <div className="border-t pt-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setVariations(prev => prev.map(x => x.id === v.id ? { ...x, _showSiteDetail: !((v as any)._showSiteDetail) } as any : x))}
                                    className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors w-full"
                                  >
                                    <ChevronDown className={`w-3 h-3 transition-transform ${(v as any)._showSiteDetail !== false ? 'rotate-180' : ''}`} />
                                    Detalhamento do preço
                                  </button>
                                  {((v as any)._showSiteDetail !== false) && (
                                  <div className="space-y-0.5 mt-1.5">
                                    <div className="flex justify-between text-[10px]">
                                      <span className="text-muted-foreground">Custo total (custo + frete + operacionais)</span>
                                      <span className="font-medium">{fmtBRL(varBaseCost)}</span>
                                    </div>
                                    <div className="flex justify-between text-[10px]">
                                      <span className="text-muted-foreground">+ Lucro sobre custo ({editSiteMarginVar}%)</span>
                                      <span>{fmtBRL(displayVarSiteProfit)}</span>
                                    </div>
                                    <div className="border-t pt-0.5">
                                      <div className="flex justify-between text-[10px]">
                                        <span className="text-muted-foreground">Subtotal</span>
                                        <span className="font-medium">{fmtBRL(varBaseCost + displayVarSiteProfit)}</span>
                                      </div>
                                    </div>
                                    <div className="flex justify-between text-[10px]">
                                      <span className="text-muted-foreground">+ Imposto sobre a venda ({liveTaxPct.toFixed(2)}%)</span>
                                      <span>{fmtBRL(varMinSale * (liveTaxPct / 100))}</span>
                                    </div>
                                    <div className="flex justify-between text-xs border-t pt-1 font-bold">
                                      <span>= Valor de venda do produto</span>
                                      <Input
                                        type="text"
                                        inputMode="decimal"
                                        value={(v as any)._displayMinSalePrice ?? (v.min_sale_price != null ? String(v.min_sale_price) : '')}
                                        onChange={(e) => {
                                          const sanitized = sanitizeDecimalInput(e.target.value);
                                          const newPrice = parseFloat(sanitized);
                                          const rounded = isNaN(newPrice) ? null : Math.round(newPrice * 100) / 100;
                                          setVariations(prev => prev.map(x => {
                                            if (x.id !== v.id) return x;
                                            const updated = { ...x, min_sale_price: rounded, _displayMinSalePrice: sanitized } as any;
                                            if (rounded != null && rounded > 0 && varBaseCost > 0) {
                                              updated._editSiteMargin = reverseMarginFromPrice(rounded, varBaseCost, liveTaxPct).toFixed(2);
                                            } else {
                                              updated._editSiteMargin = '0';
                                            }
                                            return updated;
                                          }));
                                        }}
                                        className="w-24 text-right text-emerald-600 dark:text-emerald-400 text-sm font-extrabold bg-transparent border-0 border-b-2 border-emerald-300/50 focus:border-emerald-500 outline-none focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 focus:ring-offset-0 focus-visible:ring-offset-0 focus:shadow-none px-1 h-auto rounded-none"
                                      />
                                    </div>
                                  </div>
                                  )}
                                </div>
                                <div className="border-t pt-1.5 space-y-0.5">
                                  <div className="flex justify-between text-[11px]"><span className="text-muted-foreground">Lucro por unidade</span><span className={displayVarSiteProfit >= 0 ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>{fmtBRL(displayVarSiteProfit)}</span></div>
                                  <div className="flex justify-between text-[11px]"><span className="text-muted-foreground">Lucro sobre a venda</span><span className={displayVarSiteMargin >= 30 ? 'text-green-600 font-bold' : displayVarSiteMargin >= 15 ? 'text-yellow-600 font-bold' : 'text-red-600 font-bold'}>{displayVarSiteMargin.toFixed(2)}%</span></div>
                                </div>
                              </div>
                              <div className="space-y-2 p-3 border border-primary/20 rounded-md bg-primary/5">
                                <p className="text-xs font-semibold text-muted-foreground">Preço PDV</p>
                                <div>
                                  <Label className="text-[11px]">Lucro sobre custo (%)</Label>
                                  <Input type="number" step="0.01" min="0" value={editMarginVar} onChange={(e) => { const m = parseNum(e.target.value); const base = varCost * (1 + f + o); const np = calcPrice(base, m, liveTaxPct); const rounded = isFinite(np) && np > 0 ? Math.round(np * 100) / 100 : np; if (isFinite(np) && np > 0) setVariations(prev => prev.map(x => x.id === v.id ? { ...x, price_pdv: rounded, _editMargin: e.target.value } as any : x)); else setVariations(prev => prev.map(x => x.id === v.id ? { ...x, _editMargin: e.target.value } as any : x)); }} placeholder="0,00" disabled={isVariationPricingDisabled(varCost, freightPct, opCostPct)} className="h-8 text-sm" />
                                </div>

                                <div className="border-t pt-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setVariations(prev => prev.map(x => x.id === v.id ? { ...x, _showPdvDetail: !((v as any)._showPdvDetail) } as any : x))}
                                    className="flex items-center gap-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors w-full"
                                  >
                                    <ChevronDown className={`w-3 h-3 transition-transform ${(v as any)._showPdvDetail !== false ? 'rotate-180' : ''}`} />
                                    Detalhamento do preço
                                  </button>
                                  {((v as any)._showPdvDetail !== false) && (
                                  <div className="space-y-0.5 mt-1.5">
                                    <div className="flex justify-between text-[10px]">
                                      <span className="text-muted-foreground">Custo total (custo + frete + operacionais)</span>
                                      <span className="font-medium">{fmtBRL(varBaseCost)}</span>
                                    </div>
                                    <div className="flex justify-between text-[10px]">
                                      <span className="text-muted-foreground">+ Lucro sobre custo ({editMarginVar}%)</span>
                                      <span>{fmtBRL(displayVarProfit)}</span>
                                    </div>
                                    <div className="border-t pt-0.5">
                                      <div className="flex justify-between text-[10px]">
                                        <span className="text-muted-foreground">Subtotal</span>
                                        <span className="font-medium">{fmtBRL(varBaseCost + displayVarProfit)}</span>
                                      </div>
                                    </div>
                                    <div className="flex justify-between text-[10px]">
                                      <span className="text-muted-foreground">+ Imposto sobre a venda ({liveTaxPct.toFixed(2)}%)</span>
                                      <span>{fmtBRL(varPricePdv * (liveTaxPct / 100))}</span>
                                    </div>
                                    <div className="flex justify-between text-xs border-t pt-1 font-bold">
                                      <span>= Valor de venda do produto</span>
                                      <Input
                                        type="text"
                                        inputMode="decimal"
                                        value={v._displayPricePdv ?? (v.price_pdv != null ? String(v.price_pdv) : '')}
                                        onChange={(e) => {
                                          const sanitized = sanitizeDecimalInput(e.target.value);
                                          const newPrice = parseFloat(sanitized);
                                          const rounded = isNaN(newPrice) ? null : Math.round(newPrice * 100) / 100;
                                          setVariations(prev => prev.map(x => {
                                            if (x.id !== v.id) return x;
                                            const updated = { ...x, price_pdv: rounded, _displayPricePdv: sanitized } as any;
                                            if (rounded != null && rounded > 0 && varBaseCost > 0) {
                                              updated._editMargin = reverseMarginFromPrice(rounded, varBaseCost, liveTaxPct).toFixed(2);
                                            } else {
                                              updated._editMargin = '0';
                                            }
                                            return updated;
                                          }));
                                        }}
                                        className="w-24 text-right text-emerald-600 dark:text-emerald-400 text-sm font-extrabold bg-transparent border-0 border-b-2 border-emerald-300/50 focus:border-emerald-500 outline-none focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 focus:ring-offset-0 focus-visible:ring-offset-0 focus:shadow-none px-1 h-auto rounded-none"
                                      />
                                    </div>
                                  </div>
                                  )}
                                </div>
                                <div className="border-t pt-1.5 space-y-0.5">
                                  <div className="flex justify-between text-[11px]"><span className="text-muted-foreground">Lucro por unidade</span><span className={displayVarProfit >= 0 ? 'text-green-600 font-bold' : 'text-red-600 font-bold'}>{fmtBRL(displayVarProfit)}</span></div>
                                  <div className="flex justify-between text-[11px]"><span className="text-muted-foreground">Lucro sobre a venda</span><span className={displayVarMargin >= 30 ? 'text-green-600 font-bold' : displayVarMargin >= 15 ? 'text-yellow-600 font-bold' : 'text-red-600 font-bold'}>{displayVarMargin.toFixed(2)}%</span></div>
                                </div>
                              </div>
                            </div>
                            {/* Promoção da variação — linha inteira */}
                            <div className="border-t pt-2.5 mt-1">
                              {!v.on_sale ? (
                                <button
                                  type="button"
                                  onClick={() => setVariations(prev => prev.map(x => x.id === v.id ? { ...x, on_sale: true } as any : x))}
                                  className="w-full text-left rounded-lg border border-dashed border-rose-300 dark:border-rose-700 bg-rose-50/50 dark:bg-rose-950/30 p-3 hover:border-rose-400 hover:bg-rose-100/50 dark:hover:bg-rose-950/50 transition-colors"
                                >
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs font-semibold text-rose-700 dark:text-rose-400">Promoção</span>
                                    <span className="text-[10px] text-muted-foreground">— inativa</span>
                                  </div>
                                  <p className="text-[10px] text-muted-foreground mt-0.5">Clique para definir um preço promocional para esta variação</p>
                                </button>
                              ) : (
                                <div className="rounded-lg border border-rose-300 dark:border-rose-700 bg-rose-50/50 dark:bg-rose-950/30 p-3 space-y-2.5">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wide">Promoção ativa</span>
                                    <button
                                      type="button"
                                      onClick={() => setVariations(prev => prev.map(x => x.id === v.id ? { ...x, on_sale: false, sale_price: null, sale_ends_at: null } as any : x))}
                                      className="text-[10px] text-destructive hover:underline font-medium"
                                    >
                                      Remover promoção
                                    </button>
                                  </div>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <Label className="text-[10px]">Preço promocional (R$)</Label>
                                      <Input
                                        type="number"
                                        step="0.01"
                                        value={(v as any).sale_price ?? ''}
                                        onChange={(e) => setVariations(prev => prev.map(x => x.id === v.id ? { ...x, sale_price: e.target.value ? parseFloat(e.target.value) : null } as any : x))}
                                        placeholder="0.00"
                                        className="h-8 text-sm"
                                      />
                                    </div>
                                    <div>
                                      <Label className="text-[10px]">Válido até</Label>
                                      <Input
                                        type="datetime-local"
                                        value={(v as any).sale_ends_at ? new Date((v as any).sale_ends_at).toISOString().slice(0, 16) : ''}
                                        onChange={(e) => setVariations(prev => prev.map(x => x.id === v.id ? { ...x, sale_ends_at: e.target.value ? new Date(e.target.value).toISOString() : null } as any : x))}
                                        className="h-8 text-sm"
                                      />
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      {product.image_url ? (
                        <img src={product.image_url} alt={product.name} className="w-[60px] h-[60px] object-cover rounded-md flex-shrink-0" />
                      ) : null}
                      <div className="flex-1">
                        <h2 className="text-lg font-bold">{product.name}</h2>
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                            {product.category || 'Sem categoria'}
                          </span>
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400">
                            Estoque: {product.stock} {soldByWeight ? 'g' : 'un.'}
                          </span>
                          {soldByWeight && (
                            <span className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                              Vendido por peso
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                {/* === Formação de Preço === */}
                <div className="space-y-3 p-4 border-2 border-emerald-500/20 rounded-lg bg-emerald-500/5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold uppercase tracking-wide">Formação de Preço</h3>
                      <p className="text-xs text-muted-foreground">
                        Custo base e percentuais para calcular o custo total.
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Label htmlFor="sold-by-weight" className="text-[11px] text-muted-foreground">Venda por Peso</Label>
                      <Switch id="sold-by-weight" disabled={pricingDisabled} checked={soldByWeight} onCheckedChange={setSoldByWeight} />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    <div>
                      <Label htmlFor="pf-cost">
                        Custo (R${soldByWeight ? '/kg' : ''}){' '}
                        {costGroupId !== 'none' && (
                          <span className="text-xs text-muted-foreground">(vem do grupo)</span>
                        )}
                      </Label>
                      <Input
                        id="pf-cost"
                        type="number"
                        step="0.01"
                        min="0"
                        value={cost}
                        onChange={(e) => handleFormCostChange(e.target.value)}
                        disabled={costGroupId !== 'none'}
                      />
                    </div>
                    <div>
                      <Label htmlFor="pf-freight">Frete (%)</Label>
                      <Input
                        id="pf-freight"
                        type="number"
                        step="0.01"
                        min="0"
                        value={freightPct}
                        onChange={(e) => handleFormFreightPctChange(e.target.value)}
                        placeholder="0,00"
                      />
                      <p className="text-[11px] text-muted-foreground mt-1">{fmtBRL(liveFreight)}</p>
                    </div>
                    <div>
                      <Label htmlFor="pf-opcost">Custos operacionais (%)</Label>
                      <Input
                        id="pf-opcost"
                        type="number"
                        step="0.01"
                        min="0"
                        value={opCostPct}
                        onChange={(e) => handleFormOpCostPctChange(e.target.value)}
                        placeholder="0,00"
                      />
                      <p className="text-[11px] text-muted-foreground mt-1">{fmtBRL(liveOpCost)}</p>
                    </div>
                    <div>
                      <Label htmlFor="pf-total-cost" className="whitespace-nowrap inline-flex items-baseline gap-1">Custo total <span className="text-[11px] text-muted-foreground font-normal">(custo + frete + operacionais)</span></Label>
                      <div className="rounded-md border-2 border-emerald-500/30 bg-emerald-500/10 px-3 py-2 flex items-center h-10">
                        <span className="font-bold text-base text-emerald-700 dark:text-emerald-400">{fmtBRL(liveBaseCost)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-end gap-3">
                    <div className="flex-1">
                      <Label htmlFor="pf-tax">Imposto sobre a venda (%)</Label>
                      <Input
                        id="pf-tax"
                        type="number"
                        step="0.01"
                        min="0"
                        value={taxPct}
                        onChange={(e) => handleFormTaxPctChange(e.target.value)}
                        placeholder="0,00"
                      />
                    </div>
                    <div className="flex-1">
                      <Label htmlFor="pf-group">Grupo de custo</Label>
                      <Select value={costGroupId} onValueChange={handleFormGroupChange}>
                        <SelectTrigger id="pf-group">
                          <SelectValue placeholder="Sem grupo" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Sem grupo</SelectItem>
                          {costGroups.map((g) => (
                            <SelectItem key={g.id} value={g.id}>
                              {g.name} — {fmtBRL(g.cost)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>

                {pricingDisabled && (
                  <p className="text-xs bg-yellow-50 text-yellow-800 rounded-md p-2">
                    ⚠️ Preencha custo, frete e custos operacionais para liberar a precificação.
                  </p>
                )}

                {/* === Preço Site + Preço PDV (lado a lado) === */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  {/* Coluna Esquerda — Preço Site */}
                  <div className="space-y-3 p-4 border-2 border-blue-500/20 rounded-lg bg-blue-500/5">
                    <div>
                      <h3 className="text-sm font-bold uppercase tracking-wide">Preço Site</h3>
                      <p className="text-xs text-muted-foreground">Valor exibido na loja online.</p>
                    </div>
                    <div>
                      <Label htmlFor="pf-site-margin">Lucro sobre custo (%)</Label>
                      <Input
                        id="pf-site-margin"
                        type="number"
                        step="0.01"
                        min="0"
                        value={siteMarginPct}
                        onChange={(e) => handleFormSiteMarginChange(e.target.value)}
                        placeholder="0,00"
                        disabled={pricingDisabled}
                      />
                    </div>
                    <div className="border-t pt-3">
                      <button
                        type="button"
                        onClick={() => setShowSiteDetail(!showSiteDetail)}
                        className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors w-full"
                      >
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showSiteDetail ? 'rotate-180' : ''}`} />
                        Detalhamento do preço
                      </button>
                      {showSiteDetail && (
                      <div className="space-y-1.5 mt-2">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-muted-foreground">Custo total (custo + frete + operacionais)</span>
                          <span className="font-medium">{fmtBRL(liveBaseCost)}</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-muted-foreground">+ Lucro sobre custo ({liveSiteMarginPct.toFixed(2)}%)</span>
                          <span>{fmtBRL(liveSiteProfit)}</span>
                        </div>
                        <div className="border-t pt-1.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-muted-foreground">Subtotal</span>
                            <span className="font-medium">{fmtBRL(liveBaseCost + liveSiteProfit)}</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-muted-foreground">+ Imposto sobre a venda ({liveTaxPct.toFixed(2)}%)</span>
                          <span>{fmtBRL(liveMinSale * (liveTaxPct / 100))}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm border-t pt-2 font-bold">
                          <span>= Valor de venda do produto</span>
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={minSalePrice}
                            onChange={(e) => {
                              const sanitized = sanitizeDecimalInput(e.target.value);
                              setMinSalePrice(sanitized);
                              const newPrice = parseFloat(sanitized);
                              if (!isNaN(newPrice) && newPrice > 0 && liveBaseCost > 0) {
                                setSiteMarginPct(reverseMarginFromPrice(newPrice, liveBaseCost, liveTaxPct).toFixed(2));
                              } else {
                                setSiteMarginPct('0');
                              }
                            }}
                            className="w-28 text-right text-emerald-600 dark:text-emerald-400 text-base font-extrabold bg-transparent border-0 border-b-2 border-emerald-300/50 focus:border-emerald-500 outline-none focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 focus:ring-offset-0 focus-visible:ring-offset-0 focus:shadow-none px-1 h-auto rounded-none"
                          />
                        </div>
                      </div>
                      )}
                    </div>
                    <div className="border-t pt-3 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Lucro por unidade</span>
                        <span className={`font-bold ${liveSiteProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {fmtBRL(liveSiteProfit)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Lucro sobre a venda</span>
                        <span className={`font-bold ${
                          liveSiteMargin >= 30 ? 'text-green-600' : liveSiteMargin >= 15 ? 'text-yellow-600' : 'text-red-600'
                        }`}>
                          {liveSiteMargin.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Coluna Direita — Preço PDV */}
                  <div className="space-y-3 p-4 border-2 border-primary/20 rounded-lg bg-primary/5">
                    <div>
                      <h3 className="text-sm font-bold uppercase tracking-wide">Preço PDV</h3>
                      <p className="text-xs text-muted-foreground">
                        PIX/Dinheiro = base. Débito = +3%. Crédito = +4%.
                      </p>
                    </div>
                    <div>
                      <Label htmlFor="pf-margin">Lucro sobre custo (%)</Label>
                      <Input
                        id="pf-margin"
                        type="number"
                        step="0.01"
                        min="0"
                        value={editMargin}
                        onChange={(e) => handleFormMarginChange(e.target.value)}
                        placeholder="0,00"
                        disabled={pricingDisabled}
                      />
                    </div>
                    <div className="flex items-center justify-between rounded-md border bg-background p-2">
                      <div className="space-y-0.5">
                        <Label htmlFor="pdv-no-markup" className="text-xs">Sem acréscimo no PDV</Label>
                        <p className="text-[10px] text-muted-foreground">Mesmo preço em todos os métodos de pagamento</p>
                      </div>
                      <Switch id="pdv-no-markup" disabled={pricingDisabled} checked={pdvNoMarkup} onCheckedChange={setPdvNoMarkup} />
                    </div>
                    {pdvNoMarkup ? (
                      (() => {
                        const base = pricePdv ? parseFloat(pricePdv) : 0;
                        const fmt2 = (v: number) => v.toFixed(2);
                        return (
                          <div className="rounded-md bg-background p-2 border space-y-1">
                            <p className="text-[10px] uppercase text-muted-foreground">Dinheiro, pix, débito, crédito</p>
                            <Input type="number" step="0.01" value={pricePdvPix} onChange={(e) => { const pct = e.target.value; setPricePdvPix(pct); setPricePdvCash(pct); setPricePdvDebit(pct); setPricePdvCredit(pct); }} placeholder="0" disabled={pricingDisabled} className="h-8 text-center text-sm font-bold" />
                            <p className="text-[10px] text-muted-foreground">Porcentagem aplicada a todos os métodos</p>
                          </div>
                        );
                      })()
                    ) : (
                      (() => {
                      const base = pricePdv ? parseFloat(pricePdv) : 0;
                      const fmt2 = (v: number) => v.toFixed(2);
                      const pdvCell = (
                        label: string,
                        value: string,
                        setValue: (v: string) => void,
                        autoVal: number,
                        pct?: string,
                      ) => (
                        <div className="rounded-md bg-background p-2 border space-y-1">
                          <p className="text-[10px] uppercase text-muted-foreground">{label}{pct ? ` (${pct})` : ''}</p>
                          <Input
                            type="number"
                            step="0.01"
                            value={value}
                            onChange={(e) => setValue(e.target.value)}
                            placeholder={fmt2(autoVal)}
                            disabled={pricingDisabled}
                            className="h-8 text-center text-sm font-bold"
                          />
                          <p className="text-[10px] text-muted-foreground">auto: R$ {fmt2(autoVal)}</p>
                        </div>
                      );
                      return (
                        <div className="space-y-1">
                          <div className="grid grid-cols-2 gap-2">
                            {pdvCell('PIX', pricePdvPix, setPricePdvPix, base, '0%')}
                            {pdvCell('Dinheiro', pricePdvCash, setPricePdvCash, base, '0%')}
                            {pdvCell('Débito', pricePdvDebit, setPricePdvDebit, base * 1.03, '+3%')}
                            {pdvCell('Crédito', pricePdvCredit, setPricePdvCredit, base * 1.04, '+4%')}
                          </div>
                        </div>
                      );
                    })()
                    )}
                    <div className="border-t pt-3">
                      <button
                        type="button"
                        onClick={() => setShowPdvDetail(!showPdvDetail)}
                        className="flex items-center gap-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wide hover:text-foreground transition-colors w-full"
                      >
                        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${showPdvDetail ? 'rotate-180' : ''}`} />
                        Detalhamento do preço
                      </button>
                      {showPdvDetail && (
                      <div className="space-y-1.5 mt-2">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-muted-foreground">Custo total (custo + frete + operacionais)</span>
                          <span className="font-medium">{fmtBRL(liveBaseCost)}</span>
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-muted-foreground">+ Lucro sobre custo ({parseNum(editMargin).toFixed(2)}%)</span>
                          <span>{fmtBRL(liveProfit)}</span>
                        </div>
                        <div className="border-t pt-1.5">
                          <div className="flex items-center justify-between text-[11px]">
                            <span className="text-muted-foreground">Subtotal</span>
                            <span className="font-medium">{fmtBRL(liveBaseCost + liveProfit)}</span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-muted-foreground">+ Imposto sobre a venda ({liveTaxPct.toFixed(2)}%)</span>
                          <span>{fmtBRL(liveTax)}</span>
                        </div>
                        <div className="flex items-center justify-between text-sm border-t pt-2 font-bold">
                          <span>= Valor de venda do produto</span>
                          <Input
                            type="text"
                            inputMode="decimal"
                            value={pricePdv}
                            onChange={(e) => {
                              const sanitized = sanitizeDecimalInput(e.target.value);
                              setPricePdv(sanitized);
                              const newPrice = parseFloat(sanitized);
                              if (!isNaN(newPrice) && newPrice > 0 && liveBaseCost > 0) {
                                setEditMargin(reverseMarginFromPrice(newPrice, liveBaseCost, liveTaxPct).toFixed(2));
                              } else {
                                setEditMargin('0');
                              }
                            }}
                            className="w-28 text-right text-emerald-600 dark:text-emerald-400 text-base font-extrabold bg-transparent border-0 border-b-2 border-emerald-300/50 focus:border-emerald-500 outline-none focus:outline-none focus-visible:outline-none focus:ring-0 focus-visible:ring-0 focus:ring-offset-0 focus-visible:ring-offset-0 focus:shadow-none px-1 h-auto rounded-none"
                          />
                        </div>
                      </div>
                      )}
                    </div>
                    <div className="border-t pt-3 space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Lucro por unidade</span>
                        <span className={`font-bold ${liveProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {fmtBRL(liveProfit)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-muted-foreground">Lucro sobre a venda</span>
                        <span className={`font-bold ${
                          liveMargin >= 30 ? 'text-green-600' : liveMargin >= 15 ? 'text-yellow-600' : 'text-red-600'
                        }`}>
                          {liveMargin.toFixed(2)}%
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
                  </>
                )}

                {/* === Promoção (apenas para produto sem variações) === */}
                {(!hasVariations || variations.length === 0) && (
                <div className="border-t pt-2.5 mt-1">
                  {!onSale ? (
                    <button
                      type="button"
                      disabled={pricingDisabled}
                      onClick={() => setOnSale(true)}
                      className="w-full text-left rounded-lg border border-dashed border-rose-300 dark:border-rose-700 bg-rose-50/50 dark:bg-rose-950/30 p-3 hover:border-rose-400 hover:bg-rose-100/50 dark:hover:bg-rose-950/50 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-rose-700 dark:text-rose-400">Promoção</span>
                        <span className="text-[10px] text-muted-foreground">— inativa</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">Clique para definir um preço promocional</p>
                    </button>
                  ) : (
                    <div className="rounded-lg border border-rose-300 dark:border-rose-700 bg-rose-50/50 dark:bg-rose-950/30 p-3 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-rose-700 dark:text-rose-400 uppercase tracking-wide">Promoção ativa</span>
                        <button
                          type="button"
                          onClick={() => { setOnSale(false); setSalePrice(''); setSaleEndsAt(''); }}
                          className="text-[10px] text-destructive hover:underline font-medium"
                        >
                          Remover promoção
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[10px]" htmlFor="sale-price">Preço promocional (R$)</Label>
                          <Input id="sale-price" type="number" step="0.01" value={salePrice} onChange={(e) => setSalePrice(e.target.value)} placeholder="0.00" className="h-8 text-sm" />
                        </div>
                        <div>
                          <Label className="text-[10px]" htmlFor="sale-ends">Válido até</Label>
                          <Input id="sale-ends" type="datetime-local" value={saleEndsAt} onChange={(e) => setSaleEndsAt(e.target.value)} className="h-8 text-sm" />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                )}


              </TabsContent>
              )}

              <TabsContent value="info" className="space-y-4 mt-4">

            {/* Toggle: Produto possui variações */}
            <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 p-3">
              <div className="space-y-0.5">
                <Label htmlFor="has-variations" className="text-sm font-medium">
                  Produto possui variações
                </Label>
                <p className="text-xs text-muted-foreground">
                  Ative para gerenciar estoque, preço, SKU, peso e dimensões por variação
                </p>
              </div>
              <Switch
                id="has-variations"
                checked={hasVariations}
                onCheckedChange={setHasVariations}
              />
            </div>

            {/* Dados do Produto */}
            <div className="space-y-4 p-4 border rounded-lg bg-muted/20">

            {/* Linha 1: Nome, Categoria, Subcategoria */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-name">Nome do Produto *</Label>
                <Input
                  id="edit-name"
                  value={name}
                  onChange={(e) => { setName(e.target.value); setFieldErrors(prev => ({ ...prev, name: false })); }}
                  required
                  className={fieldErrors['name'] ? 'border-red-500 focus-visible:ring-red-500' : ''}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-category">Categoria *</Label>
                <Select value={category} onValueChange={(v) => { setCategory(v); setSubcategory(''); setFieldErrors(prev => ({ ...prev, category: false })); }} required>
                  <SelectTrigger id="edit-category" className={fieldErrors['category'] ? 'border-red-500 focus-visible:ring-red-500' : ''}>
                    <SelectValue placeholder="Selecione uma categoria" />
                  </SelectTrigger>
                  <SelectContent>
                    {primaries.map((cat) => (
                      <SelectItem key={cat.id} value={cat.name}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-subcategory">Subcategoria (opcional)</Label>
                <SubcategorySelect
                  parentCategoryName={category}
                  value={subcategory}
                  onChange={setSubcategory}
                  triggerId="edit-subcategory"
                />
              </div>
            </div>

            {/* Linha 2: SKU, Estoque, Estoque mínimo, Quantidade mínima */}
            {!hasVariations ? (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-sku">Código de Barras (SKU)</Label>
                <BarcodeInput
                  id="edit-sku"
                  value={sku}
                  onChange={setSku}
                  placeholder="Digite o código de barras"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-stock">Estoque *</Label>
                <Input
                  id="edit-stock"
                  type="number"
                  min="0"
                  value={stock}
                  onChange={(e) => { setStock(e.target.value); setFieldErrors(prev => ({ ...prev, stock: false })); }}
                  required
                  className={fieldErrors['stock'] ? 'border-red-500 focus-visible:ring-red-500' : ''}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-min-stock">Estoque mínimo (alerta)</Label>
                <Input
                  id="edit-min-stock"
                  type="number"
                  min="0"
                  value={minStock}
                  onChange={(e) => setMinStock(e.target.value)}
                  placeholder="Ex.: 5"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-minimumQuantity">Quantidade Mínima de Venda</Label>
                <Input
                  id="edit-minimumQuantity"
                  type="number"
                  min="1"
                  value={minimumQuantity}
                  onChange={(e) => setMinimumQuantity(e.target.value)}
                />
              </div>
            </div>
            ) : (
            <div className="rounded-lg border bg-accent/20 p-3 text-sm text-muted-foreground">
              📦 Estoque total: <strong>{variations.reduce((s, v) => s + (Number(v.stock) || 0), 0)} un.</strong> — calculado automaticamente a partir das variações. SKU, estoque mínimo e quantidade mínima são definidos em cada variação.
            </div>
            )}

            {/* Linha 3: Descrição */}
            <div className="space-y-2">
              <Label htmlFor="edit-description">Descrição (opcional)</Label>
              <Textarea
                id="edit-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
              />
            </div>

            {/* Linha 4: Resumo */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="edit-short-description">Resumo (para listagem) *</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateSummary}
                  disabled={generatingSummary}
                >
                  {generatingSummary ? 'Gerando...' : 'Gerar com IA'}
                </Button>
              </div>
              <Textarea
                id="edit-short-description"
                value={shortDescription}
                onChange={(e) => { setShortDescription(e.target.value); setFieldErrors(prev => ({ ...prev, shortDescription: false })); }}
                rows={2}
                placeholder="Resumo curto de 2 linhas (gerado automaticamente pela IA ou edite manualmente)"
                className={fieldErrors['shortDescription'] ? 'border-red-500 focus-visible:ring-red-500' : ''}
              />
            </div>


            {/* Linha 6: Imagens */}
            {!hasVariations && (
            <div className="space-y-2">
              <Label>Imagens do Produto</Label>

              {/* Imagens existentes */}
              {existingImages.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {existingImages.map((imgUrl, index) => (
                    <ImageThumbWithBgRemoval
                      key={imgUrl + index}
                      source={imgUrl}
                      alt={`Produto ${index + 1}`}
                      onRemove={() => handleDeleteImage(imgUrl)}
                      onBackgroundRemoved={async (result) => {
                        if (typeof result !== 'string') return;
                        // Converte o data URL em File e move para newImages para upload
                        try {
                          const res = await fetch(result);
                          const blob = await res.blob();
                          const file = new File(
                            [blob],
                            `imagem-${Date.now()}-sem-fundo.png`,
                            { type: 'image/png' }
                          );
                          setNewImages((prev) => [...prev, file]);
                          handleDeleteImage(imgUrl);
                        } catch (err) {
                          console.error(err);
                        }
                      }}
                    />
                  ))}
                </div>
              )}

              {/* Preview de novas imagens */}
              {newImages.length > 0 && (
                <div className="grid grid-cols-3 gap-2 mb-4">
                  {newImages.map((file, index) => (
                    <ImageThumbWithBgRemoval
                      key={index}
                      source={file}
                      alt={`Nova ${index + 1}`}
                      onRemove={() => handleRemoveNewImage(index)}
                      onBackgroundRemoved={(result) => {
                        if (result instanceof File) {
                          setNewImages((prev) =>
                            prev.map((f, i) => (i === index ? result : f))
                          );
                        }
                      }}
                    />
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between rounded-lg border border-emerald-500/40 bg-emerald-500/5 p-3">
                <div className="space-y-0.5">
                  <Label htmlFor="upscale-images" className="text-emerald-700 dark:text-emerald-400">
                    Remover serrilhado (upscale)
                  </Label>
                  <p className="text-sm text-muted-foreground">
                    Dobra a resolução e aplica sharpening leve — ideal para imagens pequenas ou com compressão ruim
                  </p>
                </div>
                <Switch
                  id="upscale-images"
                  checked={upscaleImages}
                  onCheckedChange={setUpscaleImages}
                />
              </div>

              <Input
                id="edit-images"
                type="file"
                accept="image/*"
                multiple
                onChange={handleNewImageChange}
              />
              <p className="text-sm text-muted-foreground">
                Adicione múltiplas imagens. Passe o mouse sobre uma imagem e clique em <span className="font-semibold">"Sem fundo"</span> para remover o fundo automaticamente com IA.
              </p>
            </div>
            )}

            </div>

            {/* Linha 5: Peso e Dimensões */}
            {!hasVariations ? (
            <div className="space-y-3 p-4 border-2 border-blue-500/20 rounded-lg bg-blue-500/5">
              <div>
                <h3 className="text-sm font-bold uppercase tracking-wide">📦 Peso e Dimensões (Frete)</h3>
                <p className="text-xs text-muted-foreground">
                  Usado pelo Melhor Envio para calcular o frete real. Se vazio, usa valores padrão da loja.
                  Mínimos: 11×11×2 cm, peso ≥ 10 g.
                </p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="edit-weight" className="text-xs">Peso (g)</Label>
                  <Input id="edit-weight" type="number" min="0" step="1" placeholder="500"
                    value={weightGrams} onChange={(e) => setWeightGrams(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-length" className="text-xs">Comprimento (cm)</Label>
                  <Input id="edit-length" type="number" min="0" step="0.1" placeholder="30"
                    value={lengthCm} onChange={(e) => setLengthCm(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-width" className="text-xs">Largura (cm)</Label>
                  <Input id="edit-width" type="number" min="0" step="0.1" placeholder="20"
                    value={widthCm} onChange={(e) => setWidthCm(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="edit-height" className="text-xs">Altura (cm)</Label>
                  <Input id="edit-height" type="number" min="0" step="0.1" placeholder="20"
                    value={heightCm} onChange={(e) => setHeightCm(e.target.value)} />
                </div>
              </div>
            </div>
            ) : null}

            {/* Linha 7: Variações */}
            {hasVariations ? (
            <ProductVariations
              variations={variations}
              onVariationsChange={setVariations}
              hidePrice
            />
            ) : null}

            </TabsContent>
          </Tabs>

            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                disabled={updating}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={updating || (!isCreate && (!variationsLoaded || variationsLoading))}>
                {updating
                  ? (isCreate ? 'Criando...' : 'Atualizando...')
                  : !isCreate && (!variationsLoaded || variationsLoading)
                    ? 'Carregando variações...'
                    : isCreate ? 'Criar Produto' : 'Salvar Alterações'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}