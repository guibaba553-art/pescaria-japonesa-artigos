import { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { 
  ShoppingCart, 
  Search, 
  Trash2, 
  Plus, 
  Minus, 
  DollarSign, 
  CreditCard,
  Banknote,
  ArrowLeft,
  Check,
  Package,
  User,
  Save,
  FolderOpen,
  History,
  FilePlus,
  ChevronDown,
  ChevronRight,
  Calendar,
  Users,
  Printer,
  Loader2,
  Maximize2,
  Minimize2,
  X,
  Pencil
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Header } from '@/components/Header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { getPdvPrice, getPdvOriginalPrice, isPdvPromoActive, type PdvPaymentMethod } from '@/utils/pdvPricing';
import { resolveCartInventory } from '@/utils/cartValidation';
import { CustomerSearchCombobox } from '@/components/CustomerSearchCombobox';
import { loadTiers, getTierForScore, type CustomerTier } from '@/utils/customerTiers';
import { Award } from 'lucide-react';
import { validateCPF, formatCPF, formatCEP, sanitizeNumericInput } from '@/utils/validation';
// Heavy modules — carregados sob demanda para acelerar a abertura do PDV
import type { TefApprovedResult } from '@/components/TefChargeDialog';
const TefChargeDialog = lazy(() =>
  import('@/components/TefChargeDialog').then((m) => ({ default: m.TefChargeDialog }))
);

interface ProductVariation {
  id: string;
  product_id: string;
  name: string;
  price: number;
  price_pdv?: number | null;
  price_pdv_pix?: number | null;
  price_pdv_cash?: number | null;
  price_pdv_debit?: number | null;
  price_pdv_credit?: number | null;
  stock: number;
  description?: string | null;
  sku?: string | null;
  image_url?: string | null;
  // Promoções do catálogo
  on_sale?: boolean | null;
  sale_price?: number | null;
  sale_ends_at?: string | null;
  sale_limit_qty?: number | null;
  sale_sold_qty?: number | null;
}

interface Product {
  id: string;
  name: string;
  price: number;
  stock: number;
  image_url: string | null;
  category: string;
  sku?: string | null;
  minimum_quantity?: number;
  sold_by_weight?: boolean;
  variations?: ProductVariation[];
  // Precificação PDV
  price_pdv?: number | null;
  price_credit_percent?: number | null;
  price_debit_percent?: number | null;
  price_pix_percent?: number | null;
  price_cash_percent?: number | null;
  // Promoções do catálogo
  on_sale?: boolean | null;
  sale_price?: number | null;
  sale_ends_at?: string | null;
  sale_limit_qty?: number | null;
  sale_sold_qty?: number | null;
}

interface CartItem {
  product: Product;
  quantity: number;
  variation?: ProductVariation;
  cartItemKey: string;
  customPrice?: number; // Preço unitário sobrescrito manualmente no PDV
  priceInput?: string;  // String editável do input (permite digitar "12,")
}

export default function PDV() {
  const navigate = useNavigate();
  const { user, isAdmin, permissions, loading } = useAuth();
  const canView = isAdmin || permissions.pdv;
  const { toast } = useToast();
  
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartAutoExpand, setCartAutoExpand] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem('pdv:cartAutoExpand') === '1';
  });
  useEffect(() => {
    localStorage.setItem('pdv:cartAutoExpand', cartAutoExpand ? '1' : '0');
  }, [cartAutoExpand]);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.style.overflow = mobileCartOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileCartOpen]);
  const [searchQuery, setSearchQuery] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [processing, setProcessing] = useState(false);
  const finalizingRef = useRef(false);
  const idempotencyKeyRef = useRef<string | null>(null);
  
  // Pagamento — padrão é crédito (mesmo preço usado nas etiquetas dos cards)
  const [paymentMethod, setPaymentMethod] = useState<PdvPaymentMethod>('credit');
  const [cashReceived, setCashReceived] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerCPF, setCustomerCPF] = useState('');
  const [installments, setInstallments] = useState(1);
  const [discountInput, setDiscountInput] = useState(''); // desconto em R$ (valor direto)
  const [saleNotes, setSaleNotes] = useState(''); // anotação livre da venda
  
  // Variações
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showVariationsDialog, setShowVariationsDialog] = useState(false);

  // Edição de estoque (admin/funcionário)
  const [stockEditTarget, setStockEditTarget] = useState<{
    product: Product;
    variation?: ProductVariation | null;
  } | null>(null);
  const [stockEditValue, setStockEditValue] = useState('');
  const [stockEditReason, setStockEditReason] = useState('');
  const [stockEditSaving, setStockEditSaving] = useState(false);

  const openStockEdit = (product: Product, variation?: ProductVariation | null) => {
    const current = variation ? variation.stock : product.stock;
    setStockEditTarget({ product, variation: variation ?? null });
    setStockEditValue(String(current ?? 0));
    setStockEditReason('');
  };

  const handleSaveStockEdit = async () => {
    if (!stockEditTarget) return;
    const newStockNum = Number(stockEditValue.replace(',', '.'));
    if (!Number.isFinite(newStockNum) || newStockNum < 0) {
      toast({ title: 'Estoque inválido', description: 'Informe um número maior ou igual a zero.', variant: 'destructive' });
      return;
    }
    const current = stockEditTarget.variation ? stockEditTarget.variation.stock : stockEditTarget.product.stock;
    const delta = newStockNum - Number(current ?? 0);
    if (delta === 0) {
      setStockEditTarget(null);
      return;
    }
    setStockEditSaving(true);
    try {
      const { error } = await supabase.rpc('apply_stock_movement', {
        p_product_id: stockEditTarget.product.id,
        p_variation_id: stockEditTarget.variation?.id ?? null,
        p_quantity_delta: delta,
        p_movement_type: 'manual_adjust',
        p_order_id: null,
        p_reason: stockEditReason.trim() || `Ajuste manual via PDV (${stockEditTarget.product.name}${stockEditTarget.variation ? ' - ' + stockEditTarget.variation.name : ''})`,
      });
      if (error) throw error;
      toast({ title: 'Estoque atualizado', description: `Novo estoque: ${newStockNum}` });
      setStockEditTarget(null);
      await loadProducts();
    } catch (err: any) {
      toast({ title: 'Erro ao atualizar estoque', description: err?.message ?? 'Tente novamente', variant: 'destructive' });
    } finally {
      setStockEditSaving(false);
    }
  };

  
  // Peso
  const [showWeightDialog, setShowWeightDialog] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  const [weightUnit, setWeightUnit] = useState<'kg' | 'g'>('g'); // Padrão em gramas
  
  // Cliente
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
  const [tiers, setTiers] = useState<CustomerTier[]>([]);
  useEffect(() => { loadTiers().then(setTiers); }, []);
  const customerTier = useMemo(
    () => (selectedCustomer ? getTierForScore(tiers, selectedCustomer.score || 0) : null),
    [selectedCustomer, tiers]
  );
  const [showCustomerDialog, setShowCustomerDialog] = useState(false);
  const [customerForm, setCustomerForm] = useState({
    full_name: '',
    doc_type: 'cpf' as 'cpf' | 'cnpj',
    cpf: '',
    cnpj: '',
    company_name: '',
    cep: '',
    street: '',
    number: '',
    neighborhood: '',
    complemento: '',
    municipio: '',
    uf: '',
    codigo_municipio_ibge: '',
    inscricao_estadual: '',
    ie_indicador: '9' as '1' | '2' | '9', // 1=contribuinte, 2=isento, 9=não contribuinte
    email: '',
  });
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [cpfLoading, setCpfLoading] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);

  /**
   * Busca cliente existente pelo CPF e auto-preenche o formulário.
   * Também valida o CPF (dígitos verificadores).
   * Obs.: não existe API pública gratuita p/ dados pessoais por CPF (LGPD).
   */
  const lookupCpf = async (digits: string) => {
    if (digits.length !== 11) return;
    if (!validateCPF(digits)) {
      toast({ title: 'CPF inválido', description: 'Verifique os dígitos informados.', variant: 'destructive' });
      return;
    }
    setCpfLoading(true);
    try {
      const fmt = formatCPF(digits);
      // Tenta achar cliente já cadastrado (com CPF formatado ou só dígitos)
      const { data: existing } = await supabase
        .from('customers')
        .select('*')
        .or(`cpf.eq.${fmt},cpf.eq.${digits}`)
        .maybeSingle();
      if (existing) {
        setCustomerForm((prev) => ({
          ...prev,
          full_name: existing.full_name || prev.full_name,
          cpf: existing.cpf || fmt,
          cep: existing.cep || prev.cep,
          street: existing.street || prev.street,
          number: existing.number || prev.number,
          neighborhood: existing.neighborhood || prev.neighborhood,
          complemento: existing.complemento || prev.complemento,
          municipio: existing.municipio || prev.municipio,
          uf: existing.uf || prev.uf,
          inscricao_estadual: existing.inscricao_estadual || prev.inscricao_estadual,
          email: existing.email || prev.email,
        }));
        toast({
          title: 'Cliente já cadastrado',
          description: `${existing.full_name} — dados carregados. Salvar irá selecioná-lo.`,
        });
      } else {
        toast({ title: 'CPF válido', description: 'Não há cadastro prévio. Preencha os dados manualmente.' });
      }
    } catch (e: any) {
      console.warn('lookupCpf falhou:', e);
    } finally {
      setCpfLoading(false);
    }
  };

  /** Auto-preenche endereço pelo CEP via ViaCEP (gratuito). */
  const lookupCep = async (digits: string) => {
    if (digits.length !== 8) return;
    setCepLoading(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const d = await r.json();
      if (d?.erro) {
        toast({ title: 'CEP não encontrado', variant: 'destructive' });
        return;
      }
      setCustomerForm((prev) => ({
        ...prev,
        cep: formatCEP(digits),
        street: d.logradouro || prev.street,
        neighborhood: d.bairro || prev.neighborhood,
        municipio: d.localidade || prev.municipio,
        uf: (d.uf || prev.uf || '').toUpperCase(),
        complemento: prev.complemento || d.complemento || '',
        // IBGE do município — usado em NF-e / NFC-e
        codigo_municipio_ibge: d.ibge || prev.codigo_municipio_ibge,
      }));
      toast({
        title: 'Endereço encontrado',
        description: `${d.logradouro || ''}${d.logradouro ? ', ' : ''}${d.bairro || ''} — ${d.localidade}/${d.uf}`,
      });
    } catch (e) {
      console.warn('lookupCep falhou:', e);
    } finally {
      setCepLoading(false);
    }
  };

  const lookupCnpj = async (digits: string) => {
    if (digits.length !== 14) {
      toast({ title: 'CNPJ inválido', description: 'Informe os 14 dígitos.', variant: 'destructive' });
      return;
    }
    setCnpjLoading(true);
    try {
      // 1) Tenta Focus NFe primeiro (traz IE direto da SEFAZ/SINTEGRA)
      let d: any = null;
      let ieFromFocus = '';
      let ieAtivaFromFocus = false;
      try {
        const { data: focusData, error: focusErr } = await supabase.functions.invoke('lookup-cnpj-focus', {
          body: { cnpj: digits },
        });
        if (!focusErr && focusData?.success) {
          d = {
            razao_social: focusData.razao_social,
            nome_fantasia: focusData.nome_fantasia,
            cep: focusData.cep,
            logradouro: focusData.logradouro,
            numero: focusData.numero,
            complemento: focusData.complemento,
            bairro: focusData.bairro,
            municipio: focusData.municipio,
            uf: focusData.uf,
            codigo_municipio: focusData.codigo_municipio_ibge,
            email: focusData.email,
          };
          ieFromFocus = focusData.inscricao_estadual || '';
          ieAtivaFromFocus = !!focusData.ie_ativa;
        }
      } catch (err) {
        console.warn('Focus NFe lookup falhou, usando BrasilAPI:', err);
      }

      // 2) Fallback BrasilAPI (sem IE, mas dados da Receita)
      if (!d) {
        const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
        if (!res.ok) throw new Error('CNPJ não encontrado');
        d = await res.json();
      }

      const fmtCnpj = digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
      const fmtCep = (d.cep ? String(d.cep).padStart(8, '0') : '').replace(/^(\d{5})(\d{3})$/, '$1-$2');

      // BrasilAPI /cnpj retorna `codigo_municipio` (IBGE 7 dígitos em alguns casos) — quando não vier,
      // buscamos via /ibge/municipios/v1/{uf} pelo nome do município.
      let ibge = d.codigo_municipio ? String(d.codigo_municipio) : '';
      if ((!ibge || ibge.length !== 7) && d.uf && d.municipio) {
        try {
          const ibgeRes = await fetch(`https://brasilapi.com.br/api/ibge/municipios/v1/${d.uf}?providers=dados-abertos-br,gov,wikipedia`);
          if (ibgeRes.ok) {
            const cidades: any[] = await ibgeRes.json();
            const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
            const alvo = norm(d.municipio);
            const match = cidades.find(c => norm(c.nome) === alvo);
            if (match?.codigo_ibge) ibge = String(match.codigo_ibge);
          }
        } catch {}
      }

      setCustomerForm((prev) => ({
        ...prev,
        cnpj: fmtCnpj,
        company_name: d.razao_social || prev.company_name,
        full_name: prev.full_name || d.nome_fantasia || d.razao_social || '',
        cep: fmtCep || prev.cep,
        street: d.logradouro || prev.street,
        number: d.numero || prev.number,
        neighborhood: d.bairro || prev.neighborhood,
        complemento: d.complemento || prev.complemento,
        municipio: d.municipio || prev.municipio,
        uf: d.uf || prev.uf,
        codigo_municipio_ibge: ibge || prev.codigo_municipio_ibge,
        email: d.email || prev.email,
        // Focus NFe traz IE direto da SEFAZ — preenche e marca como contribuinte
        inscricao_estadual: ieFromFocus && ieAtivaFromFocus ? ieFromFocus : prev.inscricao_estadual,
        ie_indicador: ieFromFocus && ieAtivaFromFocus ? '1' : prev.ie_indicador,
      }));
      toast({
        title: 'Dados preenchidos',
        description: ieFromFocus && ieAtivaFromFocus
          ? `${d.razao_social} — IE ${ieFromFocus}`
          : d.razao_social,
      });
    } catch (e: any) {
      toast({ title: 'Erro ao buscar CNPJ', description: e?.message || 'Tente novamente', variant: 'destructive' });
    } finally {
      setCnpjLoading(false);
    }
  };

  
  // Vendas salvas
  const [showSavedSalesDialog, setShowSavedSalesDialog] = useState(false);
  const [savedSales, setSavedSales] = useState<any[]>([]);
  const [currentSaleId, setCurrentSaleId] = useState<string | null>(null);
  const [savedSalesSearch, setSavedSalesSearch] = useState('');
  const [collapsedDays, setCollapsedDays] = useState<Record<string, boolean>>({});

  // TEF
  const [tefEnabled, setTefEnabled] = useState(false);
  const [showTefDialog, setShowTefDialog] = useState(false);
  const tefResultRef = useRef<TefApprovedResult | null>(null);

  useEffect(() => {
    if (!loading && !canView) {
      navigate('/admin');
    }
  }, [user, canView, loading, navigate]);

  // Boot: carrega produtos imediatamente. Clientes e vendas salvas vão para o
  // tempo ocioso do browser — não bloqueiam a UI inicial do PDV.
  useEffect(() => {
    loadProducts();

    const w = window as Window & { requestIdleCallback?: (cb: () => void) => number };
    const runDeferred = () => {
      loadCustomers();
      loadSavedSales();
      loadTefSettings();
    };
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    if (w.requestIdleCallback) {
      w.requestIdleCallback(runDeferred);
    } else {
      idleTimer = setTimeout(runDeferred, 800);
    }

    // Realtime: recarrega produtos quando estoque/preço mudam (ex.: funcionário edita)
    let reloadTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleReload = () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => loadProducts(), 400);
    };
    const channel = supabase
      .channel('pdv-products-stock')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'products' }, scheduleReload)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'product_variations' }, scheduleReload)
      .subscribe();

    // Refetch ao voltar para a aba (fallback caso realtime falhe)
    const onVisible = () => {
      if (document.visibilityState === 'visible') loadProducts();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', loadProducts);

    // Realtime: recarrega vendas salvas quando outro operador/aba salva, atualiza ou exclui
    let savedTimer: ReturnType<typeof setTimeout> | undefined;
    const scheduleSavedReload = () => {
      if (savedTimer) clearTimeout(savedTimer);
      savedTimer = setTimeout(() => loadSavedSales(), 300);
    };
    const savedChannel = supabase
      .channel('pdv-saved-sales')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'saved_sales' }, scheduleSavedReload)
      .subscribe();
    const onVisibleSaved = () => {
      if (document.visibilityState === 'visible') scheduleSavedReload();
    };
    document.addEventListener('visibilitychange', onVisibleSaved);
    window.addEventListener('focus', scheduleSavedReload);

    return () => {
      if (idleTimer) clearTimeout(idleTimer);
      if (reloadTimer) clearTimeout(reloadTimer);
      if (savedTimer) clearTimeout(savedTimer);
      supabase.removeChannel(channel);
      supabase.removeChannel(savedChannel);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', loadProducts);
      document.removeEventListener('visibilitychange', onVisibleSaved);
      window.removeEventListener('focus', scheduleSavedReload);
    };
  }, []);

  const loadProducts = async () => {
    try {
      // Use RPC para que admins/funcionários acessem campos sensíveis (custo, preços PDV, margens)
      // IMPORTANTE: paginar via .range para ultrapassar o limite default do PostgREST.
      const prods: any[] = [];
      let from = 0;
      const PAGE_P = 1000;
      // eslint-disable-next-line no-constant-condition
      while (true) {
        const { data: page, error } = await supabase
          .rpc('get_products_admin')
          .range(from, from + PAGE_P - 1);
        if (error) throw error;
        if (!page || page.length === 0) break;
        prods.push(...page);
        if (page.length < PAGE_P) break;
        from += PAGE_P;
      }
      console.log(`[PDV] Produtos carregados: ${prods.length}`);

      const ids = (prods || []).map((p: any) => p.id);
      const vars: any[] = [];
      const CHUNK = 100;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const slice = ids.slice(i, i + CHUNK);
        let from = 0;
        const PAGE = 1000;
        // paginar dentro de cada chunk
        // (raramente passa de 1 página, mas garante robustez)
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { data: page, error: vErr } = await supabase
            .from('product_variations')
            .select('*')
            .in('product_id', slice)
            .range(from, from + PAGE - 1);
          if (vErr) { console.error('Erro variações:', vErr); break; }
          if (!page || page.length === 0) break;
          vars.push(...page);
          if (page.length < PAGE) break;
          from += PAGE;
        }
      }
      const byProduct = new Map<string, any[]>();
      (vars || []).forEach((v: any) => {
        if (!byProduct.has(v.product_id)) byProduct.set(v.product_id, []);
        byProduct.get(v.product_id)!.push(v);
      });
      const merged = (prods || [])
        .map((p: any) => ({ ...p, variations: byProduct.get(p.id) || [] }))
        .filter((p: any) => Number(p.stock || 0) > 0 || (p.variations || []).some((v: any) => Number(v.stock || 0) > 0))
        .sort((a: any, b: any) => a.name.localeCompare(b.name));
      setProducts(merged);
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar produtos',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoadingProducts(false);
    }
  };

  const loadCustomers = async () => {
    try {
      const { data, error } = await supabase
        .from('customers')
        .select('*')
        .order('full_name');

      if (error) throw error;
      setCustomers(data || []);
    } catch (error: any) {
      console.error('Erro ao carregar clientes:', error);
    }
  };

  const loadSavedSales = async () => {
    try {
      const { data, error } = await supabase
        .from('saved_sales')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Carregar nomes dos operadores que criaram cada venda
      const userIds = Array.from(new Set((data || []).map((s: any) => s.user_id).filter(Boolean)));
      let profilesMap: Record<string, string> = {};
      if (userIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', userIds);
        profilesMap = (profiles || []).reduce((acc: Record<string, string>, p: any) => {
          acc[p.id] = p.full_name || 'Operador';
          return acc;
        }, {});
      }

      const enriched = (data || []).map((s: any) => ({
        ...s,
        operator_name: profilesMap[s.user_id] || 'Operador',
      }));

      setSavedSales(enriched);
    } catch (error: any) {
      console.error('Erro ao carregar vendas salvas:', error);
    }
  };

  const loadTefSettings = async () => {
    try {
      const { data } = await supabase.from('tef_settings').select('enabled').limit(1).maybeSingle();
      setTefEnabled(!!data?.enabled);
    } catch (err) {
      console.error('Erro ao carregar config TEF:', err);
    }
  };

  const saveSale = async () => {
    if (cart.length === 0) {
      toast({
        title: 'Carrinho vazio',
        description: 'Adicione produtos antes de salvar',
        variant: 'destructive'
      });
      return;
    }

    if (!user?.id) {
      toast({
        title: 'Sessão expirada',
        description: 'Sua sessão expirou. Faça login novamente para salvar a venda.',
        variant: 'destructive'
      });
      return;
    }

    try {
      const saleData = {
        user_id: user.id,
        cart_data: JSON.parse(JSON.stringify(cart)),
        customer_data: JSON.parse(JSON.stringify(selectedCustomer)),
        payment_method: paymentMethod,
        total_amount: calculateTotal(),
        notes: saleNotes || ''
      };

      if (currentSaleId) {
        // Atualizar venda existente
        const { error } = await supabase
          .from('saved_sales')
          .update(saleData)
          .eq('id', currentSaleId);

        if (error) throw error;

        toast({
          title: 'Venda atualizada!',
          description: 'A venda foi atualizada com sucesso'
        });
      } else {
        // Criar nova venda salva
        const { data, error } = await supabase
          .from('saved_sales')
          .insert([saleData])
          .select()
          .single();

        if (error) throw error;

        setCurrentSaleId(data.id);
        toast({
          title: 'Venda salva!',
          description: 'Você pode retomar esta venda depois'
        });
      }

      loadSavedSales();
    } catch (error: any) {
      toast({
        title: 'Erro ao salvar venda',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  const loadSale = (sale: any) => {
    setCart(sale.cart_data);
    setSelectedCustomer(sale.customer_data);
    setPaymentMethod(sale.payment_method || 'cash');
    setCurrentSaleId(sale.id);
    setSaleNotes(sale.notes || '');
    setShowSavedSalesDialog(false);
    
    toast({
      title: 'Venda carregada!',
      description: `Total: R$ ${sale.total_amount.toFixed(2)}`
    });
  };

  const deleteSavedSale = async (saleId: string) => {
    try {
      const { error } = await supabase
        .from('saved_sales')
        .delete()
        .eq('id', saleId);

      if (error) throw error;

      loadSavedSales();
      
      if (currentSaleId === saleId) {
        setCurrentSaleId(null);
      }

      toast({
        title: 'Venda excluída',
        description: 'A venda salva foi removida'
      });
    } catch (error: any) {
      toast({
        title: 'Erro ao excluir venda',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  const clearSale = () => {
    setCart([]);
    setCashReceived('');
    setSelectedCustomer(null);
    setPaymentMethod('credit');
    setInstallments(1);
    setDiscountInput('');
    setSaleNotes('');
    setCurrentSaleId(null);
    idempotencyKeyRef.current = null;
    tefResultRef.current = null;
  };

  const getLiveAvailableStock = (item: CartItem) => {
    const nextVariation = item.variation
      ? products
          .find(product => product.id === item.product.id)
          ?.variations
          ?.find(variation => variation.id === item.variation?.id)
      : undefined;

    if (nextVariation) {
      return Number(nextVariation.stock || 0);
    }

    const nextProduct = products.find(product => product.id === item.product.id);
    return Number(nextProduct?.stock ?? item.product.stock ?? 0);
  };

  const newOrder = async () => {
    // Se há itens no carrinho, salva o pedido atual antes de iniciar um novo
    if (cart.length > 0) {
      try {
        const saleData = {
          user_id: user!.id,
          cart_data: JSON.parse(JSON.stringify(cart)),
          customer_data: JSON.parse(JSON.stringify(selectedCustomer)),
          payment_method: paymentMethod,
          total_amount: calculateTotal(),
          notes: saleNotes || ''
        };

        if (currentSaleId) {
          const { error } = await supabase
            .from('saved_sales')
            .update(saleData)
            .eq('id', currentSaleId);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('saved_sales')
            .insert([saleData]);
          if (error) throw error;
        }

        await loadSavedSales();

        toast({
          title: 'Pedido salvo!',
          description: 'O pedido anterior foi salvo. Iniciando novo pedido.'
        });
      } catch (error: any) {
        toast({
          title: 'Erro ao salvar pedido',
          description: error.message,
          variant: 'destructive'
        });
        return;
      }
    } else {
      toast({
        title: 'Novo pedido',
        description: 'Pronto para iniciar um novo pedido'
      });
    }

    clearSale();
  };

  const handleProductClick = async (product: Product) => {
    // Se tem variações no cache, mostrar diálogo de seleção
    if (product.variations && product.variations.length > 0) {
      setSelectedProduct(product);
      setShowVariationsDialog(true);
      return;
    }

    // SAFETY NET: o cache pode estar desatualizado (variação cadastrada
    // recentemente, falha de RLS na carga em lote, etc). Sempre confere no
    // banco antes de tratar como produto simples — caso contrário o item
    // seria adicionado com o preço-base e ignoraria o estoque da variação.
    try {
      const { data: vars } = await supabase
        .from('product_variations')
        .select('*')
        .eq('product_id', product.id);
      if (vars && vars.length > 0) {
        const enriched = { ...product, variations: vars as any } as Product;
        // Atualiza o cache local para próximos cliques
        setProducts((prev) => prev.map((p) => (p.id === product.id ? enriched : p)));
        setSelectedProduct(enriched);
        setShowVariationsDialog(true);
        return;
      }
    } catch (e) {
      console.error('Falha ao verificar variações antes do clique:', e);
    }

    if (product.sold_by_weight) {
      // Se é vendido por peso, mostrar diálogo de entrada de peso
      setSelectedProduct(product);
      setWeightInput('');
      setShowWeightDialog(true);
    } else {
      addToCart(product, undefined, 1);
    }
  };

  const addToCart = (product: Product, variation?: ProductVariation, quantity: number = 1) => {
    const cartItemKey = variation 
      ? `${product.id}-${variation.id}`
      : product.id;
    const minimumQty = product.sold_by_weight ? 0.001 : (product.minimum_quantity || 1);
    const availableStock = variation ? variation.stock : product.stock;
    const itemName = variation ? `${product.name} - ${variation.name}` : product.name;

    let resultMessage: { title: string; description: string; variant?: 'destructive' } | null = null;

    // IMPORTANTE: usar updater funcional para evitar stale state
    // (leitor de código de barras pode disparar várias chamadas antes do re-render)
    setCart(prev => {
      const existingItem = prev.find(item => item.cartItemKey === cartItemKey);

      if (existingItem) {
        const newQuantity = existingItem.quantity + quantity;
        if (newQuantity > availableStock) {
          resultMessage = {
            title: 'Estoque insuficiente',
            description: `Apenas ${availableStock} ${product.sold_by_weight ? 'kg' : 'unidades'} disponíveis`,
            variant: 'destructive',
          };
          return prev;
        }
        const unit = product.sold_by_weight ? 'kg' : (newQuantity > 1 ? 'unidades' : 'unidade');
        resultMessage = {
          title: 'Quantidade atualizada',
          description: `${itemName} - ${newQuantity} ${unit}`,
        };
        return prev.map(item =>
          item.cartItemKey === cartItemKey
            ? { ...item, quantity: newQuantity }
            : item
        );
      }

      if (quantity < minimumQty) {
        resultMessage = {
          title: 'Quantidade inválida',
          description: `Quantidade mínima: ${minimumQty} ${product.sold_by_weight ? 'kg' : 'unidades'}`,
          variant: 'destructive',
        };
        return prev;
      }
      if (quantity > availableStock) {
        resultMessage = {
          title: 'Estoque insuficiente',
          description: `Apenas ${availableStock} ${product.sold_by_weight ? 'kg' : 'unidades'} disponíveis`,
          variant: 'destructive',
        };
        return prev;
      }

      const unit = product.sold_by_weight ? 'kg' : (quantity > 1 ? 'unidades' : 'unidade');
      resultMessage = {
        title: 'Produto adicionado',
        description: `${itemName} - ${quantity} ${unit}`,
      };
      return [...prev, { product, quantity, variation, cartItemKey }];
    });

    if (resultMessage) {
      toast(resultMessage);
    }
  };

  const handleWeightSubmit = () => {
    if (!selectedProduct) return;
    
    const inputValue = parseFloat(weightInput.replace(',', '.'));
    
    if (isNaN(inputValue) || inputValue <= 0) {
      toast({
        title: 'Peso inválido',
        description: 'Digite um peso válido',
        variant: 'destructive'
      });
      return;
    }
    
    // Converter para kg se entrada foi em gramas
    const weightInKg = weightUnit === 'g' ? inputValue / 1000 : inputValue;
    
    addToCart(selectedProduct, undefined, weightInKg);
    setShowWeightDialog(false);
    setWeightInput('');
    setSelectedProduct(null);
  };

  // Função auxiliar para calcular peso em kg baseado na unidade
  const getWeightInKg = () => {
    const inputValue = parseFloat(weightInput.replace(',', '.'));
    if (isNaN(inputValue) || inputValue <= 0) return 0;
    return weightUnit === 'g' ? inputValue / 1000 : inputValue;
  };

  const normalizeBarcode = (value: string) => {
    const cleaned = value
      .replace(/[\u0000-\u001F\u007F-\u009F]/g, '')
      .replace(/\s+/g, '')
      .trim()
      .toUpperCase();

    const digitsOnly = cleaned.replace(/\D/g, '');
    return digitsOnly.length >= 8 ? digitsOnly : cleaned;
  };

  /**
   * Gera variações equivalentes do código lido. Resolve o caso comum em
   * que o leitor envia UPC-A como EAN-13 (prepend "0") ou vice-versa,
   * e códigos cadastrados sem zeros à esquerda por causa de planilhas
   * (Excel costuma comer zeros). Sempre retorna o código original primeiro.
   */
  const barcodeCandidates = (code: string): string[] => {
    if (!code) return [];
    const set = new Set<string>([code]);
    if (/^\d+$/.test(code)) {
      // Remove zeros à esquerda (mantém pelo menos 1 dígito)
      const trimmed = code.replace(/^0+/, '') || '0';
      set.add(trimmed);
      // Versões com 12, 13 e 14 dígitos paddeadas
      [12, 13, 14].forEach((len) => {
        if (trimmed.length <= len) set.add(trimmed.padStart(len, '0'));
      });
    }
    return Array.from(set);
  };

  const handleBarcodeSearch = async (barcode: string) => {
    const code = normalizeBarcode(barcode);
    if (!code) return;
    const candidates = barcodeCandidates(code);
    const candidateSet = new Set(candidates);
    const matchesAny = (sku: string | null | undefined) => {
      if (!sku) return false;
      const n = normalizeBarcode(sku);
      if (candidateSet.has(n)) return true;
      // Comparação tolerante a zeros à esquerda dos dois lados
      if (/^\d+$/.test(n)) {
        const t = n.replace(/^0+/, '') || '0';
        return candidates.some((c) => (/^\d+$/.test(c) ? (c.replace(/^0+/, '') || '0') === t : false));
      }
      return false;
    };

    // Beep imediato (não bloqueia a busca)
    const playBeep = () => {
      try {
        const audio = new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmwhBDGH0fPTgjMGHm7A7+OZRQ0PVa7m77BfGAg+luLxwW0iBC5+y/LZhS8GHGu77OuYSg0MUqzl8K9gGQc8lN/ywm8hBDGFzvPVgzAGHm2+7+WYRw0PVKzl8K9gGQc8lN/ywm8hBDGFzvPVgzAGHm2+7+WYRw0PVKzl8K9gGQc8lN/ywm8hBDGFzvPVgzAGHm2+7+WYRw0PVKzl8K9gGQc8lN/ywm8hBDGFzvPVgzAGHm2+7+WYRw==');
        audio.play().catch(() => {});
      } catch {}
    };

    try {
      console.log('🔍 Buscando por código:', code);

      const productWithVariation = products.find((product) =>
        (product.variations || []).some((variation) => matchesAny(variation.sku)),
      );
      const variation = productWithVariation?.variations?.find((item) => matchesAny(item.sku));

      if (productWithVariation && variation) {
        console.log('✅ Variação encontrada:', variation.name);

        if (productWithVariation.sold_by_weight) {
          setSelectedProduct(productWithVariation);
          setWeightInput('');
          setShowWeightDialog(true);
        } else {
          addToCart(productWithVariation, variation, 1);
        }
        setBarcodeInput('');
        playBeep();
        return;
      }

      const matched = products.find((product) => matchesAny(product.sku));
      if (matched) {
        console.log('✅ Produto encontrado:', matched.name);
        // SAFETY NET: confirmar no banco se existem variações cadastradas
        // — evita vender produto com variações como se fosse simples quando
        // o cache local está desatualizado.
        let effective: Product = matched;
        if (!matched.variations || matched.variations.length === 0) {
          const { data: vars } = await supabase
            .from('product_variations')
            .select('*')
            .eq('product_id', matched.id);
          if (vars && vars.length > 0) {
            effective = { ...matched, variations: vars as any } as Product;
            setProducts((prev) => prev.map((p) => (p.id === matched.id ? effective : p)));
          }
        }
        if (effective.variations && effective.variations.length > 0) {
          // Produto tem variações — abrir seletor em vez de adicionar direto (evita preço 0)
          setSelectedProduct(effective);
          setShowVariationsDialog(true);
        } else if (effective.sold_by_weight) {
          setSelectedProduct(effective);
          setWeightInput('');
          setShowWeightDialog(true);
        } else {
          addToCart(effective, undefined, 1);
        }
        setBarcodeInput('');
        playBeep();
        return;
      }

      // Fallback: buscar direto no banco caso não esteja no cache local
      console.log('🔎 Não encontrado no cache, consultando banco...', candidates);

      const fetchProductWithVariations = async (productId: string) => {
        const [{ data: prod }, { data: vars }] = await Promise.all([
          supabase
            .from('products')
            .select('id, name, price, stock, image_url, category, sku, minimum_quantity, sold_by_weight')
            .eq('id', productId)
            .maybeSingle(),
          supabase.from('product_variations').select('*').eq('product_id', productId),
        ]);
        if (!prod) return null;
        return { ...prod, variations: vars || [] } as any;
      };

      const { data: dbVars, error: varErr } = await supabase
        .from('product_variations')
        .select('id, product_id')
        .in('sku', candidates)
        .limit(1);
      if (varErr) console.error('Erro busca variação:', varErr);
      const dbVar = dbVars?.[0];

      if (dbVar?.product_id) {
        const prod = await fetchProductWithVariations(dbVar.product_id);
        if (prod) {
          const v = (prod.variations || []).find((x: any) => x.id === dbVar.id);
          if (prod.sold_by_weight) {
            setSelectedProduct(prod);
            setWeightInput('');
            setShowWeightDialog(true);
          } else {
            addToCart(prod, v, 1);
          }
          setBarcodeInput('');
          playBeep();
          return;
        }
      }

      const { data: dbProds, error: prodErr } = await supabase
        .from('products')
        .select('id')
        .in('sku', candidates)
        .limit(1);
      if (prodErr) console.error('Erro busca produto:', prodErr);
      const dbProd = dbProds?.[0];

      if (dbProd?.id) {
        const prod = await fetchProductWithVariations(dbProd.id);
        if (prod) {
          if (prod.variations && prod.variations.length > 0) {
            // Produto tem variações — abrir seletor em vez de adicionar direto
            setSelectedProduct(prod);
            setShowVariationsDialog(true);
          } else if (prod.sold_by_weight) {
            setSelectedProduct(prod);
            setWeightInput('');
            setShowWeightDialog(true);
          } else {
            addToCart(prod, undefined, 1);
          }
          setBarcodeInput('');
          playBeep();
          return;
        }
      }


      console.log('❌ Nenhum produto ou variação encontrado');
      toast({
        title: 'Produto não encontrado',
        description: `Código de barras: ${code}`,
        variant: 'destructive'
      });
      setBarcodeInput('');
    } catch (error: any) {
      console.error('❌ Erro ao buscar:', error);
      toast({
        title: 'Erro ao buscar produto',
        description: error.message,
        variant: 'destructive'
      });
      setBarcodeInput('');
    }
  };

  const handleBarcodeKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleBarcodeSearch(barcodeInput);
    }
  };

  // Listener global do leitor de código de barras.
  // Hardware scanners "digitam" muito rápido e terminam com Enter.
  // Capturamos a sequência em qualquer lugar da página (mesmo sem foco
  // no campo) desde que o usuário não esteja digitando em outro input/textarea.
  const scannerBufferRef = useRef<string>('');
  const scannerLastKeyAtRef = useRef<number>(0);
  useEffect(() => {
    const SCAN_TIMEOUT_MS = 50; // intervalo máximo entre teclas do scanner
    const MIN_SCAN_LENGTH = 3;

    const isTypingTarget = (el: EventTarget | null) => {
      if (!(el instanceof HTMLElement)) return false;
      const tag = el.tagName;
      if (el.isContentEditable) return true;
      if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (tag === 'INPUT') {
        const t = (el as HTMLInputElement).type;
        // Permite captura quando o foco está justamente no campo do leitor
        if ((el as HTMLInputElement).id === 'barcode') return false;
        // Outros inputs de texto: usuário está digitando, não interferimos
        if (['text', 'search', 'number', 'tel', 'email', 'password', 'url'].includes(t)) return true;
      }
      return false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      const now = Date.now();
      if (now - scannerLastKeyAtRef.current > 300) {
        scannerBufferRef.current = '';
      }
      scannerLastKeyAtRef.current = now;

      if (e.key === 'Enter') {
        const code = scannerBufferRef.current.trim();
        scannerBufferRef.current = '';
        if (code.length >= MIN_SCAN_LENGTH) {
          e.preventDefault();
          setBarcodeInput(code);
          handleBarcodeSearch(code);
        }
        return;
      }

      if (e.key.length === 1) {
        scannerBufferRef.current += e.key;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const removeFromCart = (cartItemKey: string) => {
    setCart(cart.filter(item => item.cartItemKey !== cartItemKey));
  };

  const updateQuantity = (cartItemKey: string, delta: number) => {
    setCart(cart.map(item => {
      if (item.cartItemKey === cartItemKey) {
        const isByWeight = item.product.sold_by_weight;
        const increment = isByWeight ? 0.1 : 1; // 100g para produtos por peso
        const newQuantity = Math.max(0, item.quantity + (delta * increment));
        const minimumQty = isByWeight ? 0.001 : (item.product.minimum_quantity || 1);
        const availableStock = getLiveAvailableStock(item);
        const unit = isByWeight ? 'kg' : 'unidades';
        
        if (newQuantity < minimumQty) {
          toast({
            title: 'Quantidade mínima',
            description: `Este produto requer no mínimo ${minimumQty} ${unit}`,
            variant: 'destructive'
          });
          return item;
        }
        
        if (newQuantity > availableStock) {
          toast({
            title: 'Estoque insuficiente',
            description: `Apenas ${availableStock} ${unit} disponíveis`,
            variant: 'destructive'
          });
          return item;
        }
        return { ...item, quantity: parseFloat(newQuantity.toFixed(3)) };
      }
      return item;
    }));
  };

  // Define a quantidade diretamente (entrada digitada). Aceita string para permitir
  // edição parcial (ex: vazio durante digitação).
  const setItemQuantity = (cartItemKey: string, raw: string) => {
    setCart(prev => prev.map(item => {
      if (item.cartItemKey !== cartItemKey) return item;
      const isByWeight = item.product.sold_by_weight;
      // normaliza vírgula -> ponto
      const parsed = parseFloat((raw || '').replace(',', '.'));
      if (isNaN(parsed) || parsed <= 0) {
        // mantém o item, deixa o onBlur corrigir
        return { ...item, quantity: 0 };
      }
      const availableStock = getLiveAvailableStock(item);
      const unit = isByWeight ? 'kg' : 'unidades';
      let q = isByWeight ? parseFloat(parsed.toFixed(3)) : Math.floor(parsed);
      if (q > availableStock) {
        toast({
          title: 'Estoque insuficiente',
          description: `Apenas ${availableStock} ${unit} disponíveis`,
          variant: 'destructive'
        });
        q = availableStock;
      }
      return { ...item, quantity: q };
    }));
  };

  // No blur, garante quantidade mínima válida
  const commitItemQuantity = (cartItemKey: string) => {
    setCart(prev => prev.map(item => {
      if (item.cartItemKey !== cartItemKey) return item;
      const isByWeight = item.product.sold_by_weight;
      const minimumQty = isByWeight ? 0.001 : (item.product.minimum_quantity || 1);
      if (!item.quantity || item.quantity < minimumQty) {
        return { ...item, quantity: minimumQty };
      }
      return item;
    }));
  };

  // Helper: preço unitário aplicando o método de pagamento atual (ou preço customizado)
  const getItemUnitPrice = (item: CartItem) => {
    if (typeof item.customPrice === 'number' && !isNaN(item.customPrice)) {
      return item.customPrice;
    }
    if (item.variation) {
      return getPdvPrice(
        {
          ...item.product,
          price: Number(item.variation.price ?? 0),
          price_pdv: (item.variation as any).price_pdv ?? item.product.price_pdv ?? null,
          price_pdv_pix: (item.variation as any).price_pdv_pix ?? null,
          price_pdv_cash: (item.variation as any).price_pdv_cash ?? null,
          price_pdv_debit: (item.variation as any).price_pdv_debit ?? null,
          price_pdv_credit: (item.variation as any).price_pdv_credit ?? null,
          on_sale: (item.variation as any).on_sale ?? item.product.on_sale ?? null,
          sale_price: (item.variation as any).sale_price ?? item.product.sale_price ?? null,
          sale_ends_at: (item.variation as any).sale_ends_at ?? item.product.sale_ends_at ?? null,
          sale_limit_qty: (item.variation as any).sale_limit_qty ?? item.product.sale_limit_qty ?? null,
          sale_sold_qty: (item.variation as any).sale_sold_qty ?? item.product.sale_sold_qty ?? null,
        },
        paymentMethod,
      );
    }
    return getPdvPrice(item.product, paymentMethod);
  };

  const setItemPrice = (cartItemKey: string, raw: string) => {
    setCart(prev => prev.map(item => {
      if (item.cartItemKey !== cartItemKey) return item;
      const cleaned = raw.replace(',', '.');
      const parsed = parseFloat(cleaned);
      return {
        ...item,
        priceInput: raw,
        customPrice: isNaN(parsed) || parsed < 0 ? undefined : parsed,
      };
    }));
  };

  const commitItemPrice = (cartItemKey: string) => {
    setCart(prev => prev.map(item => {
      if (item.cartItemKey !== cartItemKey) return item;
      // Limpa o input editável; o customPrice fica persistido se válido
      return { ...item, priceInput: undefined };
    }));
  };

  const resetItemPrice = (cartItemKey: string) => {
    setCart(prev => prev.map(item => {
      if (item.cartItemKey !== cartItemKey) return item;
      return { ...item, customPrice: undefined, priceInput: undefined };
    }));
  };

  const calculateSubtotal = () => {
    return cart.reduce((sum, item) => sum + getItemUnitPrice(item) * item.quantity, 0);
  };

  const getDiscountValue = () => {
    const v = parseFloat((discountInput || '').replace(',', '.'));
    if (isNaN(v) || v === 0) return 0;
    // valores negativos = acréscimo (aumenta o total)
    if (v < 0) return v;
    return Math.min(v, calculateSubtotal()); // desconto positivo limitado ao subtotal
  };

  const calculateTotal = () => {
    return Math.max(0, calculateSubtotal() - getDiscountValue());
  };

  const calculateChange = () => {
    if (paymentMethod !== 'cash') return 0;
    const received = parseFloat((cashReceived || '').replace(',', '.')) || 0;
    const diffCents = Math.round(received * 100) - Math.round(calculateTotal() * 100);
    return Math.max(0, diffCents / 100);
  };

  const [savingCustomer, setSavingCustomer] = useState(false);
  const handleSaveCustomer = async () => {
    if (savingCustomer) return; // trava duplo clique
    const isCnpj = customerForm.doc_type === 'cnpj';
    const docValue = isCnpj ? customerForm.cnpj : customerForm.cpf;

    // Validar campos básicos
    if (!customerForm.full_name.trim() || !docValue.trim() ||
        !customerForm.cep.trim() || !customerForm.street.trim() ||
        !customerForm.number.trim() || !customerForm.neighborhood.trim()) {
      toast({
        title: 'Campos obrigatórios',
        description: `Preencha todos os campos do cliente (incluindo ${isCnpj ? 'CNPJ' : 'CPF'})`,
        variant: 'destructive'
      });
      return;
    }

    // Validações extras para CNPJ (necessárias para emissão de NF-e)
    if (isCnpj) {
      const cnpjDigits = customerForm.cnpj.replace(/\D/g, '');
      if (cnpjDigits.length !== 14) {
        toast({ title: 'CNPJ inválido', description: 'O CNPJ deve ter 14 dígitos.', variant: 'destructive' });
        return;
      }
      if (!customerForm.company_name.trim()) {
        toast({ title: 'Razão social obrigatória', description: 'Informe a razão social para emissão de NF-e.', variant: 'destructive' });
        return;
      }
      if (!customerForm.municipio.trim() || !customerForm.uf.trim() || !customerForm.codigo_municipio_ibge.trim()) {
        toast({ title: 'Município incompleto', description: 'Informe município, UF e código IBGE (busque pelo CNPJ).', variant: 'destructive' });
        return;
      }
      if (!customerForm.ie_indicador) {
        toast({ title: 'Indicador de IE obrigatório', description: 'Informe o indicador de Inscrição Estadual.', variant: 'destructive' });
        return;
      }
      // Se for contribuinte (1), exige IE; se isento (2) ou não contribuinte (9), grava ISENTO
      if (customerForm.ie_indicador === '1' && !customerForm.inscricao_estadual.trim()) {
        toast({ title: 'Inscrição Estadual obrigatória', description: 'Contribuintes de ICMS devem informar a IE.', variant: 'destructive' });
        return;
      }
      if (customerForm.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerForm.email)) {
        toast({ title: 'E-mail inválido', description: 'Verifique o e-mail informado.', variant: 'destructive' });
        return;
      }
    }

    setSavingCustomer(true);
    try {
      // Verifica se já existe cliente com mesmo CNPJ/CPF
      const docDigits = (isCnpj ? customerForm.cnpj : customerForm.cpf).replace(/\D/g, '');
      if (docDigits) {
        const { data: existing } = await supabase
          .from('customers')
          .select('*')
          .eq(isCnpj ? 'cnpj' : 'cpf', isCnpj ? customerForm.cnpj : customerForm.cpf)
          .maybeSingle();
        if (existing) {
          toast({
            title: 'Cliente já cadastrado',
            description: `${existing.full_name} (${isCnpj ? 'CNPJ' : 'CPF'} ${docDigits}) — selecionado automaticamente.`,
          });
          setSelectedCustomer(existing);
          setShowCustomerDialog(false);
          setSavingCustomer(false);
          return;
        }
      }

      const payload: any = {
        full_name: customerForm.full_name,
        cep: customerForm.cep,
        street: customerForm.street,
        number: customerForm.number,
        neighborhood: customerForm.neighborhood,
        cpf: isCnpj ? null : customerForm.cpf,
        cnpj: isCnpj ? customerForm.cnpj : null,
        company_name: isCnpj ? customerForm.company_name : null,
        complemento: customerForm.complemento || null,
        municipio: customerForm.municipio || null,
        uf: customerForm.uf || null,
        codigo_municipio_ibge: isCnpj ? customerForm.codigo_municipio_ibge : null,
        inscricao_estadual: isCnpj
          ? (customerForm.inscricao_estadual.trim()
              ? customerForm.inscricao_estadual.trim()
              : (customerForm.ie_indicador === '1' ? '' : 'ISENTO'))
          : null,
        ie_indicador: isCnpj ? customerForm.ie_indicador : null,
        email: customerForm.email || null,
        created_by: user!.id
      };

      const { data, error } = await supabase
        .from('customers')
        .insert([payload])
        .select()
        .single();

      if (error) throw error;

      setSelectedCustomer(data);
      setShowCustomerDialog(false);
      setCustomerForm({
        full_name: '',
        doc_type: 'cpf',
        cpf: '',
        cnpj: '',
        company_name: '',
        cep: '',
        street: '',
        number: '',
        neighborhood: '',
        complemento: '',
        municipio: '',
        uf: '',
        codigo_municipio_ibge: '',
        inscricao_estadual: '',
        ie_indicador: '9',
        email: '',
      });

      toast({
        title: 'Cliente cadastrado!',
        description: `${data.full_name} foi adicionado com sucesso`
      });
      
      // Recarregar lista de clientes
      loadCustomers();
    } catch (error: any) {
      toast({
        title: 'Erro ao cadastrar cliente',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setSavingCustomer(false);
    }
  };

  const handleConsumidorFinal = () => {
    setSelectedCustomer(null);
    toast({
      title: 'Consumidor Final',
      description: 'Venda sem cadastro de cliente'
    });
  };

  const finalizeSale = async () => {
    // Guarda síncrona: bloqueia cliques duplos antes do estado React atualizar
    if (finalizingRef.current) return;
    finalizingRef.current = true;

    if (cart.length === 0) {
      toast({
        title: 'Carrinho vazio',
        description: 'Adicione produtos antes de finalizar',
        variant: 'destructive'
      });
      finalizingRef.current = false;
      return;
    }

    // Bloqueio por classificação do cliente
    if (selectedCustomer && customerTier?.block_purchase) {
      toast({
        title: `Venda bloqueada — cliente ${customerTier.name}`,
        description: customerTier.perks || 'Este cliente está bloqueado para vendas.',
        variant: 'destructive',
      });
      finalizingRef.current = false;
      return;
    }


    if (paymentMethod === 'cash') {
      const received = parseFloat((cashReceived || '').replace(',', '.')) || 0;
      // Comparar em centavos para evitar erro de ponto flutuante
      // (ex.: total 50.00000000001 vs recebido 50 quebrava venda exata)
      const receivedCents = Math.round(received * 100);
      const totalCents = Math.round(calculateTotal() * 100);
      if (receivedCents < totalCents) {
        toast({
          title: 'Valor insuficiente',
          description: 'O valor recebido é menor que o total',
          variant: 'destructive'
        });
        finalizingRef.current = false;
        return;
      }
    }

    // TEF: para crédito/débito com TEF habilitado, abre dialog da maquininha
    // antes de criar o pedido. Só prossegue após aprovação.
    if (
      tefEnabled &&
      (paymentMethod === 'credit' || paymentMethod === 'debit') &&
      !tefResultRef.current
    ) {
      finalizingRef.current = false;
      setShowTefDialog(true);
      return;
    }

    setProcessing(true);

    // Gera/reutiliza chave de idempotência: se a venda falhar e o usuário tentar
    // novamente sem limpar o carrinho, a mesma chave será enviada e o banco
    // rejeitará duplicatas via índice único.
    if (!idempotencyKeyRef.current) {
      idempotencyKeyRef.current =
        (typeof crypto !== 'undefined' && 'randomUUID' in crypto)
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
    const idempotencyKey = idempotencyKeyRef.current;

    let createdOrderId: string | null = null;

    try {
      const subtotal = calculateSubtotal();
      const discount = getDiscountValue();
      const discountRatio = subtotal > 0 ? discount / subtotal : 0;
      const inventory = await resolveCartInventory(supabase, cart);
      const hasReconciled = inventory.resolvedItems.some(item => item.wasReconciled);
      const hasProductFallback = inventory.resolvedItems.some(item => item.usedProductFallback);

      if (inventory.missing.length > 0) {
        toast({
          title: 'Variação atualizada',
          description: hasReconciled
            ? 'Uma variação foi recriada e o PDV usou a versão atual do estoque.'
            : 'Alguma variação foi alterada — venda registrada no produto principal.',
        });
      }

      const requestedByTarget = new Map<string, { requested: number; available: number; isByWeight: boolean; label: string }>();

      cart.forEach((item, index) => {
        const resolved = inventory.resolvedItems[index];
        const key = resolved?.resolvedVariationId
          ? `variation:${resolved.resolvedVariationId}`
          : `product:${item.product.id}`;
        const current = requestedByTarget.get(key);
        const requested = Number(item.quantity ?? 0);
        const itemLabel = item.variation
          ? `${item.product.name} - ${item.variation.name}`
          : item.product.name;

        requestedByTarget.set(key, {
          requested: (current?.requested ?? 0) + requested,
          available: Number(resolved?.availableStock ?? 0),
          isByWeight: current?.isByWeight ?? !!item.product.sold_by_weight,
          label: current?.label ?? itemLabel,
        });
      });

      for (const [, target] of requestedByTarget) {
        const unit = target.isByWeight ? 'kg' : 'unidades';
        const tolerance = target.isByWeight ? 0.001 : 0;

        if (target.requested - target.available > tolerance) {
          toast({
            title: 'Estoque insuficiente',
            description: `${target.label}: disponível ${target.available.toFixed(target.isByWeight ? 3 : 0)} ${unit}, solicitado ${target.requested.toFixed(target.isByWeight ? 3 : 0)} ${unit}`,
            variant: 'destructive',
          });
          await loadProducts();
          return;
        }
      }

      // Criar pedido com idempotency_key (índice único impede duplicatas)
      const tefData = tefResultRef.current;
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert([{
          user_id: user!.id,
          total_amount: calculateTotal(),
          shipping_cost: 0,
          status: 'entregado',
          delivery_type: 'pickup',
          shipping_address: selectedCustomer ? `${selectedCustomer.street}, ${selectedCustomer.number} - ${selectedCustomer.neighborhood}` : 'Venda Presencial',
          shipping_cep: selectedCustomer ? selectedCustomer.cep : '00000000',
          customer_id: selectedCustomer?.id || null,
          source: 'pdv',
          payment_method: paymentMethod,
          idempotency_key: idempotencyKey,
          tef_transaction_id: tefData?.transaction_id ?? null,
          card_brand: tefData?.card_brand ?? null,
          card_last_digits: tefData?.card_last_digits ?? null,
          nsu: tefData?.nsu ?? null,
          authorization_code: tefData?.authorization_code ?? null,
          notes: saleNotes || null,
          cash_received: paymentMethod === 'cash'
            ? (parseFloat((cashReceived || '').replace(',', '.')) || null)
            : null,
        }])
        .select()
        .single();

      if (orderError) {
        // 23505 = unique_violation: pedido já foi criado em uma tentativa anterior
        if ((orderError as any).code === '23505') {
          toast({
            title: 'Venda já registrada',
            description: 'Esta venda já havia sido finalizada. Carrinho limpo.',
          });
          clearSale();
          await loadProducts();
          return;
        }
        throw orderError;
      }

      createdOrderId = order.id;

      // Vincula a transação TEF ao pedido criado
      if (tefData?.transaction_id) {
        await supabase
          .from('tef_transactions')
          .update({ order_id: order.id })
          .eq('id', tefData.transaction_id);
      }

      const orderItems = cart.map((item, index) => {
        const resolved = inventory.resolvedItems[index];
        const unit = getItemUnitPrice(item);
        const adjustedUnit = Number((unit * (1 - discountRatio)).toFixed(2));
        return {
          order_id: order.id,
          product_id: item.product.id,
          variation_id: resolved?.resolvedVariationId ?? null,
          quantity: item.quantity,
          price_at_purchase: adjustedUnit,
        };
      });

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems);

      if (itemsError) throw itemsError;

      // Atualizar estoque de forma ATÔMICA via RPC (livro-caixa + lock de linha)
      for (const [index, item] of cart.entries()) {
        const resolved = inventory.resolvedItems[index];
        const { error: stockError } = await supabase.rpc('apply_stock_movement', {
          p_product_id: item.product.id,
          p_variation_id: resolved?.resolvedVariationId ?? null,
          p_quantity_delta: -Math.abs(item.quantity),
          p_movement_type: 'pdv_sale',
          p_order_id: order.id,
          p_reason: `Venda PDV - pedido ${order.id.slice(0, 8)}`,
        });

        if (stockError) throw stockError;
      }

      // Pedido finalizado com sucesso — não precisa mais da idempotency key
      createdOrderId = null;

      if (hasProductFallback) {
        toast({
          title: 'Venda concluída com ajuste',
          description: 'Itens com variação removida foram lançados no produto principal.',
        });
      }

      // Troco é registrado automaticamente pelo trigger trg_auto_register_troco
      // no banco (a partir do campo cash_received do pedido).

      toast({
        title: 'Venda finalizada!',
        description: `Pedido #${order.id.slice(0, 8)} criado com sucesso`,
      });

      // Se a venda estava salva, deletar da lista de rascunhos
      if (currentSaleId) {
        await supabase
          .from('saved_sales')
          .delete()
          .eq('id', currentSaleId);
        loadSavedSales();
      }

      // Limpar carrinho e recarregar produtos para refletir o novo estoque
      clearSale();
      await loadProducts();

    } catch (error: any) {
      // Rollback manual: se criamos o pedido mas algo falhou depois,
      // cancela o pedido órfão para manter histórico completo.
      if (createdOrderId) {
        try {
          await supabase.from('orders').update({ status: 'cancelado', cancellation_reason: 'cancelado_pelo_cliente' }).eq('id', createdOrderId);
        } catch (cleanupError) {
          console.error('Falha ao cancelar pedido órfão:', cleanupError);
        }
      }
      toast({
        title: 'Erro ao finalizar venda',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setProcessing(false);
      finalizingRef.current = false;
    }
  };

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    p.category.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading || loadingProducts) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }

  if (!canView) {
    return null;
  }

  const total = calculateTotal();
  const change = calculateChange();

  return (
    <div className="min-h-screen bg-muted/30 pb-32 lg:pb-0">
      <Header />

      {/* Compact mobile back bar */}
      <div className="lg:hidden sticky top-14 z-30 bg-background/95 backdrop-blur border-b border-border">
        <div className="px-4 h-12 flex items-center justify-between gap-2">
          <button
            onClick={() => navigate('/admin')}
            className="flex items-center gap-1.5 text-sm font-medium active:opacity-60"
          >
            <ArrowLeft className="w-4 h-4" /> Admin
          </button>
          <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <ShoppingCart className="w-3.5 h-3.5 text-primary" />
            <span>PDV</span>
          </div>
          <button
            onClick={() => navigate('/pdv/sales-history')}
            className="flex items-center gap-1.5 text-sm font-medium active:opacity-60"
          >
            <History className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Commercial dark banner — desktop only */}
      <div className="hidden lg:block bg-foreground text-background pt-20 lg:pt-32 pb-8">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 text-primary mb-3">
                <ShoppingCart className="w-3.5 h-3.5" />
                <span className="text-[11px] font-bold uppercase tracking-wider">PDV</span>
              </div>
              <h1 className="text-3xl md:text-4xl font-display font-black tracking-tight">
                Ponto de Venda
              </h1>
              <p className="text-sm text-background/60 mt-1">
                Vendas presenciais com código de barras e pagamentos integrados.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => navigate('/pdv/sales-history')}
                className="rounded-full bg-transparent border-background/20 text-background hover:bg-background hover:text-foreground"
              >
                <History className="w-4 h-4 mr-2" />
                Histórico
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate('/admin')}
                className="rounded-full bg-transparent border-background/20 text-background hover:bg-background hover:text-foreground"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Admin
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto p-3 lg:p-6 lg:-mt-4">

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Produtos */}
          <div className="lg:col-span-2 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Produtos</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground w-4 h-4" />
                  <Input
                    placeholder="Buscar produto..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>

                <ScrollArea className="h-[calc(100vh-260px)] lg:h-[700px]">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {filteredProducts.map(product => (
                      <Card
                        key={product.id}
                        className="cursor-pointer hover:shadow-lg transition-shadow relative"
                        onClick={() => handleProductClick(product)}
                      >
                        {product.variations && product.variations.length > 0 && (
                          <Badge 
                            variant="secondary" 
                            className="absolute top-2 right-2 z-10"
                          >
                            <Package className="w-3 h-3 mr-1" />
                            {product.variations.length}
                          </Badge>
                        )}
                        {(!product.variations || product.variations.length === 0) && (
                          <Button
                            type="button"
                            size="icon"
                            variant="secondary"
                            className="absolute top-2 left-2 z-10 h-7 w-7 opacity-90 hover:opacity-100"
                            title="Ajustar estoque"
                            onClick={(e) => {
                              e.stopPropagation();
                              openStockEdit(product, null);
                            }}
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                        )}
                        <CardContent className="p-2 lg:p-3 space-y-2">
                          {product.image_url && (
                            <div className="w-full h-32 lg:h-60 bg-muted rounded overflow-hidden">
                              <img
                                src={product.image_url}
                                alt={product.name}
                                className="w-full h-full object-cover"
                              />
                            </div>
                          )}
                          <div>
                            <h3 className="font-semibold text-sm line-clamp-2">
                              {product.name}
                            </h3>
                            <div className="flex gap-1 mt-1">
                              <Badge variant="outline" className="text-xs">
                                {product.category}
                              </Badge>
                              {product.sold_by_weight && (
                                <Badge variant="default" className="text-xs bg-green-600">
                                  Por kg
                                </Badge>
                              )}
                              {product.minimum_quantity && product.minimum_quantity > 1 && (
                                <Badge variant="default" className="text-xs">
                                  Min: {product.minimum_quantity}
                                </Badge>
                              )}
                            </div>
                          </div>
                           <div className="flex items-center justify-between">
                            <div className="flex flex-col">
                              {isPdvPromoActive(product) ? (
                                <>
                                  <span className="text-[11px] text-muted-foreground line-through leading-none">
                                    R$ {getPdvOriginalPrice(product, paymentMethod).toFixed(2)}{product.sold_by_weight && '/kg'}
                                  </span>
                                  <span className="text-lg font-bold text-green-600 dark:text-green-400 leading-none">
                                    R$ {getPdvPrice(product, paymentMethod).toFixed(2)}{product.sold_by_weight && '/kg'}
                                  </span>
                                </>
                              ) : (
                                <span className="text-lg font-bold text-primary leading-none">
                                  R$ {getPdvPrice(product, paymentMethod).toFixed(2)}{product.sold_by_weight && '/kg'}
                                </span>
                              )}
                              <span className="text-[10px] text-muted-foreground uppercase tracking-wider mt-0.5">
                                {paymentMethod === 'cash' ? 'Dinheiro' : paymentMethod === 'debit' ? 'Débito' : paymentMethod === 'credit' ? 'Crédito' : 'PIX'}
                              </span>
                            </div>
                            <Badge variant="secondary" className="text-xs">
                              {product.stock} {product.sold_by_weight ? 'kg' : 'un'}
                            </Badge>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </ScrollArea>
              </CardContent>
            </Card>
          </div>

          {/* Carrinho e Pagamento */}
          <div
            id="pdv-cart-panel"
            className={cn(
              'lg:static lg:inset-auto lg:z-auto lg:bg-transparent lg:p-0 lg:overflow-visible lg:block lg:space-y-4',
              mobileCartOpen
                ? 'fixed inset-0 z-50 bg-background overflow-y-auto p-3 pb-32 space-y-4'
                : 'hidden'
            )}
          >
            <div className="lg:hidden flex items-center justify-between sticky top-0 -mx-3 px-3 py-2 bg-background/95 backdrop-blur border-b border-border z-10">
              <div className="flex items-center gap-2">
                <ShoppingCart className="w-4 h-4 text-primary" />
                <span className="font-bold text-sm">Carrinho ({cart.length})</span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setMobileCartOpen(false)}
                className="h-8 w-8 p-0"
              >
                <X className="w-5 h-5" />
              </Button>
            </div>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between gap-2">
                  <span>Carrinho</span>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={cartAutoExpand ? 'default' : 'outline'}
                      className="h-7 px-2 text-xs gap-1"
                      onClick={() => setCartAutoExpand((v) => !v)}
                      title={cartAutoExpand ? 'Carrinho expande conforme adiciona itens (clique para desativar)' : 'Carrinho com altura fixa e rolagem (clique para expandir conforme adiciona itens)'}
                    >
                      {cartAutoExpand ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                      {cartAutoExpand ? 'Auto' : 'Fixo'}
                    </Button>
                    <Badge variant="secondary">{cart.length} itens</Badge>
                  </div>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className={cartAutoExpand ? 'mb-4' : 'h-[300px] overflow-y-auto mb-4'}>
                  {cart.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <ShoppingCart className="w-12 h-12 mx-auto mb-2 opacity-50" />
                      <p>Carrinho vazio</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {cart.map(item => {
                        const itemPrice = getItemUnitPrice(item);
                        const itemName = item.variation 
                          ? `${item.product.name} - ${item.variation.name}` 
                          : item.product.name;
                        
                        return (
                          <div key={item.cartItemKey} className="flex flex-col gap-2 p-2 border rounded">
                            <div className="flex items-center gap-2">
                              <img
                                src={(item.variation?.image_url || item.product.image_url) || 'https://placehold.co/56x56?text=?'}
                                alt={itemName}
                                loading="lazy"
                                className="w-12 h-12 rounded object-cover border border-border shrink-0 bg-muted"
                              />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm break-words">
                                  {itemName}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {item.product.sold_by_weight ? `${item.quantity.toFixed(3)} kg` : `${item.quantity} un`}
                                  <span className="ml-1">• estoque: <strong>{item.variation ? item.variation.stock : item.product.stock}</strong></span>
                                  {typeof item.customPrice === 'number' && (
                                    <span className="ml-1 text-amber-600 font-medium">• preço alterado</span>
                                  )}
                                </p>
                              </div>
                              <div className="flex items-center gap-1">
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="h-7 w-7"
                                  onClick={() => updateQuantity(item.cartItemKey, -1)}
                                >
                                  <Minus className="w-3 h-3" />
                                </Button>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  step={item.product.sold_by_weight ? 0.001 : 1}
                                  min={item.product.sold_by_weight ? 0.001 : 1}
                                  value={item.quantity === 0 ? '' : item.quantity}
                                  onChange={(e) => setItemQuantity(item.cartItemKey, e.target.value)}
                                  onBlur={() => commitItemQuantity(item.cartItemKey)}
                                  onFocus={(e) => e.target.select()}
                                  className="w-14 h-7 text-center font-medium text-sm rounded border border-border bg-background outline-none focus:ring-2 focus:ring-ring [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="h-7 w-7"
                                  onClick={() => updateQuantity(item.cartItemKey, 1)}
                                >
                                  <Plus className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7 text-destructive"
                                  onClick={() => removeFromCart(item.cartItemKey)}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </div>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs text-muted-foreground">R$</span>
                                <input
                                  type="number"
                                  inputMode="decimal"
                                  step={0.01}
                                  min={0}
                                  value={item.priceInput !== undefined ? item.priceInput : itemPrice.toFixed(2)}
                                  onChange={(e) => setItemPrice(item.cartItemKey, e.target.value)}
                                  onBlur={() => commitItemPrice(item.cartItemKey)}
                                  onFocus={(e) => e.target.select()}
                                  className="w-20 h-7 text-center font-medium text-sm rounded border border-border bg-background outline-none focus:ring-2 focus:ring-ring [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                  title="Preço unitário (editável)"
                                />
                                <span className="text-xs text-muted-foreground">× {item.product.sold_by_weight ? `${item.quantity.toFixed(3)}kg` : item.quantity}</span>
                                {typeof item.customPrice === 'number' && (
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-6 px-1 text-[10px]"
                                    onClick={() => resetItemPrice(item.cartItemKey)}
                                    title="Restaurar preço original"
                                  >
                                    Resetar
                                  </Button>
                                )}
                              </div>
                              <div className="font-bold">
                                R$ {(itemPrice * item.quantity).toFixed(2)}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <Separator className="my-4" />

                <div className="space-y-3">
                  {/* Desconto em valor (R$) */}
                  <div className="space-y-1.5">
                    <Label htmlFor="pdv-discount" className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                      Desconto (R$)
                    </Label>
                    <div className="flex gap-2">
                      <Input
                        id="pdv-discount"
                        type="number"
                        inputMode="decimal"
                        step="0.01"
                        placeholder="0,00 (use negativo p/ acréscimo)"
                        value={discountInput}
                        onChange={(e) => setDiscountInput(e.target.value)}
                        className="flex-1"
                      />
                      {discountInput && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => setDiscountInput('')}
                          aria-label="Remover desconto"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {getDiscountValue() !== 0 && (
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Subtotal:</span>
                        <span>R$ {calculateSubtotal().toFixed(2)}</span>
                      </div>
                      {getDiscountValue() > 0 ? (
                        <div className="flex justify-between text-success">
                          <span>Desconto:</span>
                          <span>− R$ {getDiscountValue().toFixed(2)}</span>
                        </div>
                      ) : (
                        <div className="flex justify-between text-destructive">
                          <span>Acréscimo:</span>
                          <span>+ R$ {Math.abs(getDiscountValue()).toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex justify-between text-lg font-bold">
                    <span>Total:</span>
                    <span className="text-2xl text-primary">
                      R$ {total.toFixed(2)}
                    </span>
                  </div>
                  
                  <div className="flex gap-2">
                    <Button
                      onClick={saveSale}
                      variant="outline"
                      className="flex-1 min-w-0 px-2"
                    >
                      <Save className="w-4 h-4 mr-2 shrink-0" />
                      <span className="truncate">
                        {currentSaleId ? 'Atualizar' : 'Salvar Venda'}
                      </span>
                    </Button>
                    <Button
                      onClick={() => {
                        loadSavedSales();
                        setShowSavedSalesDialog(true);
                      }}
                      variant="outline"
                      className="flex-1 min-w-0 px-2"
                    >
                      <FolderOpen className="w-4 h-4 mr-2 shrink-0" />
                      <span className="truncate">Vendas Salvas</span>
                      {savedSales.length > 0 && (
                        <Badge variant="secondary" className="ml-2 shrink-0">
                          {savedSales.length}
                        </Badge>
                      )}
                    </Button>
                  </div>

                  <Button
                    onClick={newOrder}
                    variant="default"
                    className="w-full bg-primary/90 hover:bg-primary"
                  >
                    <FilePlus className="w-4 h-4 mr-2" />
                    Novo Pedido
                  </Button>
                  
                  {currentSaleId && (
                    <Button
                      onClick={clearSale}
                      variant="ghost"
                      size="sm"
                      className="w-full"
                    >
                      <Trash2 className="w-4 h-4 mr-2" />
                      Limpar e Nova Venda
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>

            {cart.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base">Anotação da Venda</CardTitle>
                </CardHeader>
                <CardContent>
                  <Textarea
                    placeholder="Escreva aqui qualquer observação desta venda (ex.: cor escolhida, prazo, troco, instruções)..."
                    value={saleNotes}
                    onChange={(e) => setSaleNotes(e.target.value)}
                    rows={3}
                  />
                </CardContent>
              </Card>
            )}

            {cart.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Pagamento</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label>Cliente</Label>
                    {selectedCustomer ? (
                      <div className="p-3 bg-primary/10 border border-primary/20 rounded-lg">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-semibold">
                              {selectedCustomer.company_name || selectedCustomer.full_name}
                            </p>
                            {selectedCustomer.company_name && (
                              <p className="text-xs text-muted-foreground">Resp.: {selectedCustomer.full_name}</p>
                            )}
                            <p className="text-sm text-muted-foreground">
                              {selectedCustomer.cnpj
                                ? `CNPJ: ${selectedCustomer.cnpj}`
                                : `CPF: ${selectedCustomer.cpf}`}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {selectedCustomer.street}, {selectedCustomer.number} - {selectedCustomer.neighborhood}
                            </p>
                            {customerTier && (
                              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                <span
                                  className="inline-flex items-center gap-1 text-xs font-semibold text-white px-2 py-0.5 rounded"
                                  style={{ backgroundColor: customerTier.color }}
                                >
                                  <Award className="w-3 h-3" /> {customerTier.name} · {selectedCustomer.score || 0} pts
                                </span>
                                {customerTier.block_purchase && (
                                  <span className="text-xs font-semibold text-destructive">Venda bloqueada</span>
                                )}
                                {!customerTier.block_purchase && customerTier.discount_percent > 0 && (
                                  <span className="text-xs font-semibold text-emerald-600">
                                    {customerTier.discount_percent}% off aplicado
                                  </span>
                                )}
                                {!customerTier.allow_discount && !customerTier.block_purchase && (
                                  <span className="text-xs font-semibold text-orange-600">Sem descontos</span>
                                )}
                              </div>
                            )}
                          </div>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setSelectedCustomer(null)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <CustomerSearchCombobox
                          onSelect={(customer) => {
                            setSelectedCustomer(customer);
                            const tier = getTierForScore(tiers, customer.score || 0);
                            if (tier?.block_purchase) {
                              toast({
                                title: `Cliente ${tier.name}`,
                                description: 'Venda bloqueada para este cliente.',
                                variant: 'destructive',
                              });
                            } else if (tier && tier.discount_percent > 0 && tier.allow_discount && !discountInput) {
                              const subtotal = calculateSubtotal();
                              const disc = (subtotal * tier.discount_percent) / 100;
                              setDiscountInput(disc.toFixed(2).replace('.', ','));
                              toast({
                                title: `Cliente ${tier.name} · ${tier.discount_percent}% off`,
                                description: `Desconto de R$ ${disc.toFixed(2)} aplicado automaticamente.`,
                              });
                            } else {
                              toast({
                                title: 'Cliente selecionado',
                                description: customer.company_name || customer.full_name,
                              });
                            }
                          }}
                        />
                        
                        <div className="grid grid-cols-2 gap-2">
                          <Button
                            onClick={() => setShowCustomerDialog(true)}
                            className="bg-orange-500 hover:bg-orange-600"
                          >
                            <Plus className="w-4 h-4 mr-2" />
                            Cadastrar
                          </Button>
                          <Button
                            onClick={handleConsumidorFinal}
                            variant="outline"
                          >
                            Consumidor Final
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label>Forma de Pagamento</Label>
                    <Tabs value={paymentMethod} onValueChange={(v: any) => setPaymentMethod(v)}>
                      <div className="-mx-3 lg:mx-0 px-3 lg:px-0 overflow-x-auto scrollbar-hide">
                        <TabsList className="inline-flex lg:grid w-max lg:w-full lg:grid-cols-4 gap-1">
                          <TabsTrigger value="cash" className="shrink-0">
                            <Banknote className="w-4 h-4 mr-2" />
                            Dinheiro
                          </TabsTrigger>
                          <TabsTrigger value="debit" className="shrink-0">
                            <CreditCard className="w-4 h-4 mr-2" />
                            Débito
                          </TabsTrigger>
                          <TabsTrigger value="credit" className="shrink-0">
                            <CreditCard className="w-4 h-4 mr-2" />
                            Crédito
                          </TabsTrigger>
                          <TabsTrigger value="pix" className="shrink-0">
                            <DollarSign className="w-4 h-4 mr-2" />
                            PIX
                          </TabsTrigger>
                        </TabsList>
                      </div>
                    </Tabs>
                  </div>

                  {paymentMethod === 'cash' && (
                    <>
                      <div className="space-y-2">
                        <Label>Valor Recebido</Label>
                        <Input
                          type="number"
                          step="0.01"
                          placeholder="0.00"
                          value={cashReceived}
                          onChange={(e) => setCashReceived(e.target.value)}
                        />
                      </div>
                      {cashReceived && (
                        <div className="p-3 bg-muted rounded-lg">
                          <div className="flex justify-between text-sm">
                            <span>Troco:</span>
                            <span className="font-bold text-lg">
                              R$ {change.toFixed(2)}
                            </span>
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  {paymentMethod === 'credit' && (
                    <div className="space-y-2">
                      <Label>Número de Parcelas</Label>
                      <select
                        value={installments}
                        onChange={(e) => setInstallments(Number(e.target.value))}
                        className="w-full h-10 px-3 py-2 text-sm rounded-md border border-input bg-background ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                      >
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((num) => (
                          <option key={num} value={num}>
                            {num}x de R$ {(total / num).toFixed(2)}
                          </option>
                        ))}
                      </select>
                      <div className="p-3 bg-muted rounded-lg space-y-1">
                        <div className="flex justify-between text-sm">
                          <span>Valor da Parcela:</span>
                          <span className="font-bold">
                            R$ {(total / installments).toFixed(2)}
                          </span>
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>Total:</span>
                          <span>R$ {total.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  )}

                  <Button
                    onClick={finalizeSale}
                    disabled={processing}
                    className="w-full"
                    size="lg"
                  >
                    <Check className="w-5 h-5 mr-2" />
                    {processing ? 'Processando...' : 'Finalizar Venda'}
                  </Button>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>

      {/* Sticky bottom bar — mobile: total + ir para carrinho/finalizar */}
      {cart.length > 0 && !mobileCartOpen && (
        <div
          className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-background border-t border-border shadow-[0_-4px_20px_-4px_rgba(0,0,0,0.1)]"
          style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
        >
          <div className="px-3 py-2.5 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold leading-none">
                {cart.length} {cart.length === 1 ? 'item' : 'itens'} no carrinho
              </p>
              <p className="text-xl font-black text-primary leading-tight mt-0.5">
                R$ {total.toFixed(2)}
              </p>
            </div>
            <Button
              size="lg"
              onClick={() => setMobileCartOpen(true)}
              className="rounded-full font-bold shadow-md"
            >
              <ShoppingCart className="w-4 h-4 mr-2" />
              Ver carrinho
            </Button>
          </div>
        </div>
      )}

      {/* Diálogo de seleção de variações */}
      <Dialog open={showVariationsDialog} onOpenChange={setShowVariationsDialog}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Selecione a Variação</DialogTitle>
            <DialogDescription>
              Escolha uma variação de {selectedProduct?.name}
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {selectedProduct?.variations?.map((variation) => {
              // Usar imagem da variação ou fallback para imagem do produto
              const imageUrl = variation.image_url || selectedProduct?.image_url;
              
              return (
                <Card
                  key={variation.id}
                  className="cursor-pointer hover:shadow-lg transition-shadow relative"
                  onClick={() => {
                    if (variation.stock > 0) {
                      addToCart(selectedProduct, variation);
                      setShowVariationsDialog(false);
                    }
                  }}
                >
                  <Button
                    type="button"
                    size="icon"
                    variant="secondary"
                    className="absolute top-2 right-2 z-10 h-7 w-7 opacity-90 hover:opacity-100"
                    title="Ajustar estoque"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (selectedProduct) openStockEdit(selectedProduct, variation);
                    }}
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Button>
                  <CardContent className="p-3 space-y-2">
                    <div className="w-full h-24 bg-muted rounded overflow-hidden flex items-center justify-center">
                      {imageUrl ? (
                        <img
                          src={imageUrl}
                          alt={variation.name}
                          className="w-full h-full object-contain"
                          onError={(e) => {
                            e.currentTarget.src = '/placeholder.svg';
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                          <Package className="w-8 h-8" />
                        </div>
                      )}
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm">{variation.name}</h3>
                      {variation.description && (
                        <p className="text-xs text-muted-foreground line-clamp-1">
                          {variation.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center justify-between">
                      {selectedProduct ? (() => {
                        const merged = {
                          ...selectedProduct,
                          price: Number(variation.price ?? 0),
                          price_pdv: (variation as any).price_pdv ?? selectedProduct.price_pdv ?? null,
                          price_pdv_pix: (variation as any).price_pdv_pix ?? null,
                          price_pdv_cash: (variation as any).price_pdv_cash ?? null,
                          price_pdv_debit: (variation as any).price_pdv_debit ?? null,
                          price_pdv_credit: (variation as any).price_pdv_credit ?? null,
                          on_sale: (variation as any).on_sale ?? selectedProduct.on_sale ?? null,
                          sale_price: (variation as any).sale_price ?? selectedProduct.sale_price ?? null,
                          sale_ends_at: (variation as any).sale_ends_at ?? selectedProduct.sale_ends_at ?? null,
                          sale_limit_qty: (variation as any).sale_limit_qty ?? selectedProduct.sale_limit_qty ?? null,
                          sale_sold_qty: (variation as any).sale_sold_qty ?? selectedProduct.sale_sold_qty ?? null,
                        };
                        return isPdvPromoActive(merged) ? (
                          <div className="flex flex-col">
                            <span className="text-[11px] text-muted-foreground line-through leading-none">
                              R$ {getPdvOriginalPrice(merged, paymentMethod).toFixed(2)}
                            </span>
                            <span className="text-base font-bold text-green-600 dark:text-green-400">
                              R$ {getPdvPrice(merged, paymentMethod).toFixed(2)}
                            </span>
                          </div>
                        ) : (
                          <span className="text-base font-bold text-primary">
                            R$ {getPdvPrice(merged, paymentMethod).toFixed(2)}
                          </span>
                        );
                      })() : (
                        <span className="text-base font-bold text-primary">
                          R$ {Number((variation as any).price_pdv ?? variation.price).toFixed(2)}
                        </span>
                      )}
                      <Badge variant={variation.stock > 5 ? "secondary" : variation.stock > 0 ? "outline" : "destructive"} className="text-xs">
                        {variation.stock > 0 ? `${variation.stock} un` : 'Esgotado'}
                      </Badge>
                    </div>
                    {variation.sku && (
                      <p className="text-xs text-muted-foreground font-mono">
                        SKU: {variation.sku}
                      </p>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>

      {/* Diálogo de ajuste de estoque */}
      <Dialog open={!!stockEditTarget} onOpenChange={(open) => !open && setStockEditTarget(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ajustar estoque</DialogTitle>
            <DialogDescription>
              {stockEditTarget?.product.name}
              {stockEditTarget?.variation ? ` — ${stockEditTarget.variation.name}` : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs text-muted-foreground">Estoque atual</Label>
              <p className="text-2xl font-bold">
                {stockEditTarget?.variation
                  ? stockEditTarget.variation.stock
                  : stockEditTarget?.product.stock}
                {stockEditTarget?.product.sold_by_weight ? ' kg' : ' un'}
              </p>
            </div>
            <div>
              <Label htmlFor="new-stock">Novo estoque</Label>
              <Input
                id="new-stock"
                type="number"
                inputMode="decimal"
                step={stockEditTarget?.product.sold_by_weight ? '0.001' : '1'}
                min="0"
                value={stockEditValue}
                onChange={(e) => setStockEditValue(e.target.value)}
                autoFocus
              />
            </div>
            <div>
              <Label htmlFor="stock-reason">Motivo (opcional)</Label>
              <Input
                id="stock-reason"
                placeholder="Ex.: contagem, perda, recebimento..."
                value={stockEditReason}
                onChange={(e) => setStockEditReason(e.target.value)}
                maxLength={200}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setStockEditTarget(null)} disabled={stockEditSaving}>
              Cancelar
            </Button>
            <Button onClick={handleSaveStockEdit} disabled={stockEditSaving}>
              {stockEditSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
              Salvar
            </Button>
          </div>
        </DialogContent>
      </Dialog>


      <Dialog open={showCustomerDialog} onOpenChange={setShowCustomerDialog}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle>Cadastrar Cliente</DialogTitle>
            <DialogDescription>
              Preencha os dados do cliente para vincular à venda
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Toggle Pessoa Física / Jurídica */}
            <div className="space-y-2">
              <Label>Tipo de cliente *</Label>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant={customerForm.doc_type === 'cpf' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setCustomerForm({ ...customerForm, doc_type: 'cpf' })}
                >
                  Pessoa Física (CPF)
                </Button>
                <Button
                  type="button"
                  variant={customerForm.doc_type === 'cnpj' ? 'default' : 'outline'}
                  className="flex-1"
                  onClick={() => setCustomerForm({ ...customerForm, doc_type: 'cnpj' })}
                >
                  Pessoa Jurídica (CNPJ)
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="full_name">
                {customerForm.doc_type === 'cnpj' ? 'Nome do responsável *' : 'Nome Completo *'}
              </Label>
              <Input
                id="full_name"
                placeholder={customerForm.doc_type === 'cnpj' ? 'Nome do contato/responsável' : 'Nome completo do cliente'}
                value={customerForm.full_name}
                onChange={(e) => setCustomerForm({ ...customerForm, full_name: e.target.value })}
              />
            </div>

            {customerForm.doc_type === 'cnpj' && (
              <div className="space-y-2">
                <Label htmlFor="company_name">Razão social / Nome fantasia</Label>
                <Input
                  id="company_name"
                  placeholder="Nome da empresa"
                  value={customerForm.company_name}
                  onChange={(e) => setCustomerForm({ ...customerForm, company_name: e.target.value })}
                />
              </div>
            )}

            {customerForm.doc_type === 'cpf' ? (
              <div className="space-y-2">
                <Label htmlFor="cpf">CPF *</Label>
                <div className="relative">
                  <Input
                    id="cpf"
                    placeholder="000.000.000-00"
                    value={customerForm.cpf}
                    onChange={(e) => {
                      const digits = sanitizeNumericInput(e.target.value).slice(0, 11);
                      setCustomerForm({ ...customerForm, cpf: formatCPF(digits) });
                      if (digits.length === 11) lookupCpf(digits);
                    }}
                    maxLength={14}
                    inputMode="numeric"
                  />
                  {cpfLoading && (
                    <Loader2 className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Validamos o CPF e buscamos cadastro existente automaticamente.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="cnpj">CNPJ *</Label>
                <div className="flex gap-2">
                  <Input
                    id="cnpj"
                    placeholder="00.000.000/0000-00"
                    value={customerForm.cnpj}
                    onChange={(e) => {
                      const v = e.target.value;
                      setCustomerForm({ ...customerForm, cnpj: v });
                      const digits = v.replace(/\D/g, '');
                      if (digits.length === 14) lookupCnpj(digits);
                    }}
                    maxLength={18}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    disabled={cnpjLoading}
                    onClick={() => lookupCnpj(customerForm.cnpj.replace(/\D/g, ''))}
                  >
                    {cnpjLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Buscar'}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Preenche automaticamente os dados via Receita Federal (BrasilAPI).
                </p>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="cep">CEP *</Label>
              <div className="relative">
                <Input
                  id="cep"
                  placeholder="00000-000"
                  value={customerForm.cep}
                  onChange={(e) => {
                    const digits = sanitizeNumericInput(e.target.value).slice(0, 8);
                    setCustomerForm({ ...customerForm, cep: formatCEP(digits) });
                    if (digits.length === 8) lookupCep(digits);
                  }}
                  onBlur={(e) => {
                    const digits = sanitizeNumericInput(e.target.value).slice(0, 8);
                    if (digits.length === 8) lookupCep(digits);
                  }}
                  onPaste={(e) => {
                    const pasted = e.clipboardData.getData('text');
                    const digits = sanitizeNumericInput(pasted).slice(0, 8);
                    if (digits.length === 8) {
                      e.preventDefault();
                      setCustomerForm({ ...customerForm, cep: formatCEP(digits) });
                      lookupCep(digits);
                    }
                  }}
                  maxLength={9}
                  inputMode="numeric"
                  autoComplete="postal-code"
                />
                {cepLoading && (
                  <Loader2 className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
                )}
              </div>
              <p className="text-xs text-muted-foreground">Endereço preenchido automaticamente via CEP.</p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="street">Rua *</Label>
              <Input
                id="street"
                placeholder="Nome da rua"
                value={customerForm.street}
                onChange={(e) => setCustomerForm({ ...customerForm, street: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="number">Número *</Label>
                <Input
                  id="number"
                  placeholder="123"
                  value={customerForm.number}
                  onChange={(e) => setCustomerForm({ ...customerForm, number: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="neighborhood">Bairro *</Label>
                <Input
                  id="neighborhood"
                  placeholder="Bairro"
                  value={customerForm.neighborhood}
                  onChange={(e) => setCustomerForm({ ...customerForm, neighborhood: e.target.value })}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2 col-span-2">
                <Label htmlFor="municipio">Município {customerForm.doc_type === 'cnpj' && '*'}</Label>
                <Input
                  id="municipio"
                  placeholder="Cidade"
                  value={customerForm.municipio}
                  onChange={(e) => setCustomerForm({ ...customerForm, municipio: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="uf">UF {customerForm.doc_type === 'cnpj' && '*'}</Label>
                <Input
                  id="uf"
                  placeholder="SP"
                  maxLength={2}
                  value={customerForm.uf}
                  onChange={(e) => setCustomerForm({ ...customerForm, uf: e.target.value.toUpperCase() })}
                />
              </div>
            </div>

            {customerForm.doc_type === 'cpf' && (
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                <Label htmlFor="inscricao_estadual_cpf" className="text-xs font-semibold">
                  Inscrição Estadual (opcional — produtor rural)
                </Label>
                <Input
                  id="inscricao_estadual_cpf"
                  placeholder="Somente números (deixe em branco se não tiver)"
                  value={customerForm.inscricao_estadual}
                  onChange={(e) =>
                    setCustomerForm({ ...customerForm, inscricao_estadual: e.target.value.replace(/\D/g, '') })
                  }
                  inputMode="numeric"
                />
                <p className="text-xs text-muted-foreground">
                  Preencha apenas se o cliente PF tiver IE (ex.: produtor rural).
                </p>
              </div>
            )}

            {customerForm.doc_type === 'cnpj' && (
              <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 space-y-3">
                <p className="text-xs font-semibold text-orange-900">
                  Dados obrigatórios para emissão de NF-e
                </p>

                <div className="space-y-2">
                  <Label htmlFor="codigo_municipio_ibge">Código IBGE do município *</Label>
                  <Input
                    id="codigo_municipio_ibge"
                    placeholder="Ex: 3550308"
                    value={customerForm.codigo_municipio_ibge}
                    onChange={(e) =>
                      setCustomerForm({ ...customerForm, codigo_municipio_ibge: e.target.value.replace(/\D/g, '') })
                    }
                    maxLength={7}
                  />
                  <p className="text-xs text-muted-foreground">Preenchido automaticamente ao buscar pelo CNPJ.</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="ie_indicador">Indicador de Inscrição Estadual *</Label>
                  <Select
                    value={customerForm.ie_indicador}
                    onValueChange={(v) =>
                      setCustomerForm({ ...customerForm, ie_indicador: v as '1' | '2' | '9' })
                    }
                  >
                    <SelectTrigger id="ie_indicador">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 - Contribuinte de ICMS</SelectItem>
                      <SelectItem value="2">2 - Contribuinte isento</SelectItem>
                      <SelectItem value="9">9 - Não contribuinte</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="inscricao_estadual">
                    Inscrição Estadual {customerForm.ie_indicador === '1' ? '*' : '(opcional)'}
                  </Label>
                  <Input
                    id="inscricao_estadual"
                    placeholder={customerForm.ie_indicador === '1' ? 'Somente números' : 'Deixe em branco se isento/não contribuinte'}
                    value={customerForm.inscricao_estadual}
                    onChange={(e) =>
                      setCustomerForm({ ...customerForm, inscricao_estadual: e.target.value.replace(/\D/g, '') })
                    }
                    inputMode="numeric"
                  />
                  <p className="text-xs text-muted-foreground">
                    Você pode informar a IE mesmo selecionando "Isento" ou "Não contribuinte".
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="customer_email">E-mail (recomendado)</Label>
                  <Input
                    id="customer_email"
                    type="email"
                    placeholder="contato@empresa.com.br"
                    value={customerForm.email}
                    onChange={(e) => setCustomerForm({ ...customerForm, email: e.target.value })}
                  />
                  <p className="text-xs text-muted-foreground">Para envio automático do XML/DANFE da NF-e.</p>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button
                onClick={() => setShowCustomerDialog(false)}
                variant="outline"
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleSaveCustomer}
                disabled={savingCustomer}
                className="flex-1 bg-orange-500 hover:bg-orange-600"
              >
                {savingCustomer ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                {savingCustomer ? 'Salvando...' : 'Salvar Cliente'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Diálogo de entrada de peso */}
      <Dialog open={showWeightDialog} onOpenChange={setShowWeightDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Informe o Peso</DialogTitle>
            <DialogDescription>
              {selectedProduct?.name} - R$ {selectedProduct ? getPdvPrice(selectedProduct, paymentMethod).toFixed(2) : '0.00'}/kg
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Seletor de unidade */}
            <div className="flex gap-2">
              <Button
                variant={weightUnit === 'g' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => {
                  if (weightUnit === 'kg' && weightInput) {
                    // Converter de kg para g
                    const val = parseFloat(weightInput.replace(',', '.'));
                    if (!isNaN(val)) setWeightInput((val * 1000).toString());
                  }
                  setWeightUnit('g');
                }}
              >
                Gramas (g)
              </Button>
              <Button
                variant={weightUnit === 'kg' ? 'default' : 'outline'}
                className="flex-1"
                onClick={() => {
                  if (weightUnit === 'g' && weightInput) {
                    // Converter de g para kg
                    const val = parseFloat(weightInput.replace(',', '.'));
                    if (!isNaN(val)) setWeightInput((val / 1000).toString());
                  }
                  setWeightUnit('kg');
                }}
              >
                Quilos (kg)
              </Button>
            </div>

            {/* Botões de atalho para pesos comuns */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Atalhos rápidos</Label>
              <div className="grid grid-cols-4 gap-2">
                {weightUnit === 'g' 
                  ? [100, 150, 200, 250, 300, 400, 500, 750].map((weight) => (
                      <Button
                        key={weight}
                        variant="outline"
                        size="sm"
                        onClick={() => setWeightInput(weight.toString())}
                        className="text-xs"
                      >
                        {weight}g
                      </Button>
                    ))
                  : [0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 2.5].map((weight) => (
                      <Button
                        key={weight}
                        variant="outline"
                        size="sm"
                        onClick={() => setWeightInput(weight.toString())}
                        className="text-xs"
                      >
                        {weight}kg
                      </Button>
                    ))
                }
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="weight">Peso ({weightUnit})</Label>
              <div className="relative">
                <Input
                  id="weight"
                  type="text"
                  inputMode="decimal"
                  placeholder={weightUnit === 'g' ? '452' : '0.452'}
                  value={weightInput}
                  onChange={(e) => {
                    // Permite apenas números, ponto e vírgula
                    const value = e.target.value.replace(/[^0-9.,]/g, '');
                    setWeightInput(value);
                  }}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      handleWeightSubmit();
                    }
                  }}
                  autoFocus
                  className="text-3xl font-bold text-center h-16 pr-12"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xl text-muted-foreground font-medium">
                  {weightUnit}
                </span>
              </div>
              <p className="text-xs text-muted-foreground text-center">
                {weightUnit === 'g' 
                  ? 'Digite o peso em gramas (ex: 452 para 452g)'
                  : 'Digite o peso em kg (ex: 0.452 para 452g)'
                }
              </p>
            </div>

            {(() => {
              const parsed = parseFloat(weightInput.replace(',', '.'));
              if (!weightInput || isNaN(parsed) || parsed <= 0) return null;
              return (
                <div className="p-4 bg-primary/10 border border-primary/20 rounded-lg space-y-2">
                  <div className="flex justify-between items-center text-sm">
                    <span className="text-muted-foreground">Peso:</span>
                    <span className="font-medium">
                      {weightUnit === 'g'
                        ? `${parsed}g (${(parsed / 1000).toFixed(3)}kg)`
                        : `${parsed.toFixed(3)}kg (${(parsed * 1000).toFixed(0)}g)`}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Total:</span>
                    <span className="font-bold text-2xl text-primary">
                      R$ {(getWeightInKg() * (selectedProduct ? getPdvPrice(selectedProduct, paymentMethod) : 0)).toFixed(2)}
                    </span>
                  </div>
                </div>
              );
            })()}

            <div className="flex gap-2">
              <Button
                onClick={() => {
                  setShowWeightDialog(false);
                  setWeightInput('');
                  setSelectedProduct(null);
                }}
                variant="outline"
                className="flex-1"
              >
                Cancelar
              </Button>
              <Button
                onClick={handleWeightSubmit}
                className="flex-1"
                disabled={!weightInput || isNaN(parseFloat(weightInput.replace(',', '.'))) || parseFloat(weightInput.replace(',', '.')) <= 0}
              >
                <Check className="w-4 h-4 mr-2" />
                Adicionar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Diálogo de vendas salvas */}
      <Dialog open={showSavedSalesDialog} onOpenChange={(open) => { setShowSavedSalesDialog(open); if (open) loadSavedSales(); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderOpen className="w-5 h-5" />
              Vendas Salvas
              <Badge variant="secondary" className="ml-2">{savedSales.length}</Badge>
            </DialogTitle>
            <DialogDescription>
              Vendas compartilhadas com toda a equipe — qualquer operador pode abrir e finalizar
            </DialogDescription>
          </DialogHeader>

          {/* Busca */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por cliente, operador, ID ou observações..."
              value={savedSalesSearch}
              onChange={(e) => setSavedSalesSearch(e.target.value)}
              className="pl-9"
            />
          </div>

          <ScrollArea className="flex-1 -mx-6 px-6">
            {savedSales.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FolderOpen className="w-12 h-12 mx-auto mb-2 opacity-50" />
                <p>Nenhuma venda salva</p>
              </div>
            ) : (() => {
              // Filtrar por busca
              const q = savedSalesSearch.trim().toLowerCase();
              const filtered = savedSales.filter((s: any) => {
                if (!q) return true;
                const hay = [
                  s.id?.slice(0, 8),
                  s.operator_name,
                  s.customer_data?.full_name,
                  s.notes,
                  s.payment_method,
                ].filter(Boolean).join(' ').toLowerCase();
                return hay.includes(q);
              });

              if (filtered.length === 0) {
                return (
                  <div className="text-center py-12 text-muted-foreground">
                    <Search className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>Nenhuma venda encontrada para "{savedSalesSearch}"</p>
                  </div>
                );
              }

              // Agrupar por dia
              const groups: Record<string, { label: string; sales: any[]; total: number }> = {};
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const yesterday = new Date(today);
              yesterday.setDate(yesterday.getDate() - 1);

              filtered.forEach((sale: any) => {
                const d = new Date(sale.created_at);
                const dayKey = d.toISOString().slice(0, 10);
                if (!groups[dayKey]) {
                  const dayDate = new Date(d);
                  dayDate.setHours(0, 0, 0, 0);
                  let label = dayDate.toLocaleDateString('pt-BR', {
                    weekday: 'long',
                    day: '2-digit',
                    month: 'long',
                    year: 'numeric',
                  });
                  if (dayDate.getTime() === today.getTime()) label = `Hoje · ${label}`;
                  else if (dayDate.getTime() === yesterday.getTime()) label = `Ontem · ${label}`;
                  groups[dayKey] = { label, sales: [], total: 0 };
                }
                groups[dayKey].sales.push(sale);
                groups[dayKey].total += Number(sale.total_amount || 0);
              });

              const sortedKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));

              return (
                <div className="space-y-4 pb-2">
                  {sortedKeys.map((dayKey) => {
                    const group = groups[dayKey];
                    const isCollapsed = collapsedDays[dayKey] === true;
                    return (
                      <div key={dayKey} className="space-y-2">
                        <button
                          type="button"
                          onClick={() =>
                            setCollapsedDays((prev) => ({ ...prev, [dayKey]: !prev[dayKey] }))
                          }
                          className="w-full flex items-center justify-between bg-muted/50 hover:bg-muted px-3 py-2 rounded-md sticky top-0 z-10"
                        >
                          <div className="flex items-center gap-2">
                            {isCollapsed ? (
                              <ChevronRight className="w-4 h-4" />
                            ) : (
                              <ChevronDown className="w-4 h-4" />
                            )}
                            <Calendar className="w-4 h-4 text-primary" />
                            <span className="font-semibold capitalize">{group.label}</span>
                            <Badge variant="secondary">{group.sales.length}</Badge>
                          </div>
                          <span className="text-sm font-semibold text-primary">
                            R$ {group.total.toFixed(2)}
                          </span>
                        </button>

                        {!isCollapsed && (
                          <div className="space-y-2 pl-2">
                            {group.sales.map((sale: any) => (
                              <Card
                                key={sale.id}
                                className={`hover:shadow-md transition-shadow ${
                                  currentSaleId === sale.id ? 'border-primary border-2' : ''
                                }`}
                              >
                                <CardContent className="p-3">
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                                        <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">
                                          #{sale.id.slice(0, 8)}
                                        </span>
                                        <span className="text-base font-bold text-primary">
                                          R$ {Number(sale.total_amount).toFixed(2)}
                                        </span>
                                        <Badge variant="outline" className="text-xs">
                                          {(sale.cart_data as any[])?.length || 0} item(ns)
                                        </Badge>
                                        {currentSaleId === sale.id && (
                                          <Badge variant="default">Atual</Badge>
                                        )}
                                      </div>

                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                                        <div className="flex items-center gap-1.5">
                                          <Users className="w-3 h-3" />
                                          <span>
                                            <strong className="text-foreground">{sale.operator_name}</strong>
                                            {sale.user_id === user?.id && (
                                              <span className="ml-1 text-primary">(você)</span>
                                            )}
                                          </span>
                                        </div>
                                        <div>
                                          {new Date(sale.created_at).toLocaleTimeString('pt-BR', {
                                            hour: '2-digit',
                                            minute: '2-digit',
                                          })}
                                        </div>
                                        {sale.customer_data?.full_name && (
                                          <div className="flex items-center gap-1.5 col-span-2">
                                            <User className="w-3 h-3" />
                                            <span>{sale.customer_data.full_name}</span>
                                          </div>
                                        )}
                                        <div>
                                          {sale.payment_method === 'cash' ? '💵 Dinheiro' :
                                           sale.payment_method === 'credit' ? '💳 Crédito' :
                                           sale.payment_method === 'debit' ? '💳 Débito' :
                                           sale.payment_method === 'pix' ? '📱 PIX' : '—'}
                                        </div>
                                      </div>
                                      {sale.notes && (
                                        <div className="mt-2 text-xs bg-amber-50 dark:bg-amber-950/30 border-l-2 border-amber-400 px-2 py-1.5 rounded text-foreground whitespace-pre-wrap">
                                          📝 {sale.notes}
                                        </div>
                                      )}
                                    </div>

                                    <div className="flex flex-col gap-1.5 shrink-0">
                                      <Button
                                        size="sm"
                                        onClick={() => loadSale(sale)}
                                        disabled={currentSaleId === sale.id}
                                      >
                                        <FolderOpen className="w-3.5 h-3.5 mr-1" />
                                        {currentSaleId === sale.id ? 'Carregada' : 'Abrir'}
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        onClick={async () => {
                                          try {
                                            const items = (sale.cart_data as any[]) || [];
                                            const unitOf = (it: any) =>
                                              it.customPrice ?? it.variation?.price ?? it.product?.price_pdv ?? it.product?.price ?? 0;
                                            const subtotal = items.reduce(
                                              (s: number, it: any) => s + unitOf(it) * (it.quantity || 0),
                                              0
                                            );
                                            const discount = Math.max(0, subtotal - Number(sale.total_amount));
                                            const { generateBudgetPdf } = await import('@/utils/budgetPdfGenerator');
                                            await generateBudgetPdf({
                                              saleId: sale.id,
                                              createdAt: sale.created_at,
                                              operatorName: sale.operator_name,
                                              customerName: sale.customer_data?.full_name,
                                              customerCPF: sale.customer_data?.cpf,
                                              paymentMethod: sale.payment_method,
                                              items: items.map((it: any) => ({
                                                product: {
                                                  id: it.product?.id,
                                                  name: it.product?.name ?? 'Produto',
                                                  sku: it.product?.sku,
                                                  image_url: it.product?.image_url,
                                                },
                                                variation: it.variation
                                                  ? { name: it.variation.name, image_url: it.variation.image_url }
                                                  : undefined,
                                                quantity: it.quantity || 0,
                                                unitPrice: unitOf(it),
                                              })),
                                              subtotal,
                                              discount,
                                              total: Number(sale.total_amount),
                                            });
                                          } catch (err: any) {
                                            toast({
                                              title: 'Erro ao gerar orçamento',
                                              description: err?.message ?? String(err),
                                              variant: 'destructive',
                                            });
                                          }
                                        }}
                                      >
                                        <Printer className="w-3.5 h-3.5 mr-1" />
                                        Orçamento
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                        onClick={() => deleteSavedSale(sale.id)}
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </Button>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </ScrollArea>
        </DialogContent>
      </Dialog>

      {tefEnabled && showTefDialog && (
        <Suspense fallback={null}>
          <TefChargeDialog
            open={showTefDialog}
            amount={calculateTotal()}
            paymentMethod={paymentMethod === 'debit' ? 'debit' : 'credit'}
            installments={installments}
            onCancel={() => {
              setShowTefDialog(false);
              tefResultRef.current = null;
            }}
            onApproved={(result) => {
              tefResultRef.current = result;
              setShowTefDialog(false);
              setTimeout(() => { finalizeSale(); }, 50);
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
