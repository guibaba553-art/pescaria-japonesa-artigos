import { useState, useEffect, useRef } from 'react';
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
  Loader2
} from 'lucide-react';
import { Header } from '@/components/Header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
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
import { getPdvPrice, getPdvPriceForVariation, getPdvBasePrice, type PdvPaymentMethod } from '@/utils/pdvPricing';
import { resolveCartInventory } from '@/utils/cartValidation';
import { generateBudgetPdf } from '@/utils/budgetPdfGenerator';
import { TefChargeDialog, type TefApprovedResult } from '@/components/TefChargeDialog';

interface ProductVariation {
  id: string;
  product_id: string;
  name: string;
  price: number;
  stock: number;
  description?: string | null;
  sku?: string | null;
  image_url?: string | null;
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
  
  // Variações
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [showVariationsDialog, setShowVariationsDialog] = useState(false);
  
  // Peso
  const [showWeightDialog, setShowWeightDialog] = useState(false);
  const [weightInput, setWeightInput] = useState('');
  const [weightUnit, setWeightUnit] = useState<'kg' | 'g'>('g'); // Padrão em gramas
  
  // Cliente
  const [customers, setCustomers] = useState<any[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<any | null>(null);
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
    neighborhood: ''
  });
  const [cnpjLoading, setCnpjLoading] = useState(false);

  const lookupCnpj = async (digits: string) => {
    if (digits.length !== 14) {
      toast({ title: 'CNPJ inválido', description: 'Informe os 14 dígitos.', variant: 'destructive' });
      return;
    }
    setCnpjLoading(true);
    try {
      const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
      if (!res.ok) throw new Error('CNPJ não encontrado');
      const d = await res.json();
      const fmtCnpj = digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
      const fmtCep = (d.cep || '').replace(/^(\d{5})(\d{3})$/, '$1-$2');
      setCustomerForm((prev) => ({
        ...prev,
        cnpj: fmtCnpj,
        company_name: d.nome_fantasia || d.razao_social || prev.company_name,
        full_name: prev.full_name || d.razao_social || '',
        cep: fmtCep || prev.cep,
        street: d.logradouro || prev.street,
        number: d.numero || prev.number,
        neighborhood: d.bairro || prev.neighborhood,
      }));
      toast({ title: 'Dados preenchidos', description: d.razao_social });
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

    return () => {
      if (idleTimer) clearTimeout(idleTimer);
      if (reloadTimer) clearTimeout(reloadTimer);
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', loadProducts);
    };
  }, []);

  const loadProducts = async () => {
    try {
      // Use RPC para que admins/funcionários acessem campos sensíveis (custo, preços PDV, margens)
      const { data: prods, error } = await supabase.rpc('get_products_admin');
      if (error) throw error;

      // Carrega variações e junta no objeto produto, mantendo apenas em estoque
      const ids = (prods || []).map((p: any) => p.id);
      const { data: vars } = ids.length
        ? await supabase.from('product_variations').select('*').in('product_id', ids)
        : { data: [] as any[] } as any;
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

    try {
      const saleData = {
        user_id: user!.id,
        cart_data: JSON.parse(JSON.stringify(cart)),
        customer_data: JSON.parse(JSON.stringify(selectedCustomer)),
        payment_method: paymentMethod,
        total_amount: calculateTotal(),
        notes: ''
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
          notes: ''
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

  const handleProductClick = (product: Product) => {
    // Se tem variações, mostrar diálogo de seleção
    if (product.variations && product.variations.length > 0) {
      setSelectedProduct(product);
      setShowVariationsDialog(true);
    } else if (product.sold_by_weight) {
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

  const handleBarcodeSearch = async (barcode: string) => {
    const code = barcode.trim();
    if (!code) return;

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
        (product.variations || []).some((variation) => variation.sku === code),
      );
      const variation = productWithVariation?.variations?.find(
        (item) => item.sku === code,
      );

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

      const matched = products.find(
        (product) => product.sku === code,
      );
      if (matched) {
        console.log('✅ Produto encontrado:', matched.name);
        if (matched.sold_by_weight) {
          setSelectedProduct(matched);
          setWeightInput('');
          setShowWeightDialog(true);
        } else {
          addToCart(matched, undefined, 1);
        }
        setBarcodeInput('');
        playBeep();
        return;
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
      return getPdvPriceForVariation(item.product, item.variation.price, paymentMethod);
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
    if (isNaN(v) || v <= 0) return 0;
    return Math.min(v, calculateSubtotal()); // não permite desconto maior que o subtotal
  };

  const calculateTotal = () => {
    return Math.max(0, calculateSubtotal() - getDiscountValue());
  };

  const calculateChange = () => {
    if (paymentMethod !== 'cash') return 0;
    const received = parseFloat(cashReceived) || 0;
    return Math.max(0, received - calculateTotal());
  };

  const handleSaveCustomer = async () => {
    const isCnpj = customerForm.doc_type === 'cnpj';
    const docValue = isCnpj ? customerForm.cnpj : customerForm.cpf;

    // Validar campos
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

    try {
      const payload: any = {
        full_name: customerForm.full_name,
        cep: customerForm.cep,
        street: customerForm.street,
        number: customerForm.number,
        neighborhood: customerForm.neighborhood,
        cpf: isCnpj ? null : customerForm.cpf,
        cnpj: isCnpj ? customerForm.cnpj : null,
        company_name: isCnpj ? (customerForm.company_name || null) : null,
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
        neighborhood: ''
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

    if (paymentMethod === 'cash') {
      const received = parseFloat(cashReceived) || 0;
      if (received < calculateTotal()) {
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
      // remove o pedido órfão para não poluir relatórios.
      if (createdOrderId) {
        try {
          await supabase.from('order_items').delete().eq('order_id', createdOrderId);
          await supabase.from('orders').delete().eq('id', createdOrderId);
        } catch (cleanupError) {
          console.error('Falha ao limpar pedido órfão:', cleanupError);
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

                <ScrollArea className="h-[calc(100vh-340px)] lg:h-[700px]">
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
                              <span className="text-lg font-bold text-primary leading-none">
                                R$ {getPdvPrice(product, paymentMethod).toFixed(2)}{product.sold_by_weight && '/kg'}
                              </span>
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
          <div id="pdv-cart-panel" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span>Carrinho</span>
                  <Badge variant="secondary">{cart.length} itens</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ScrollArea className="h-[300px] mb-4">
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
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-sm break-words">
                                  {itemName}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                  {item.product.sold_by_weight ? `${item.quantity.toFixed(3)} kg` : `${item.quantity} un`}
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
                </ScrollArea>

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
                        min="0"
                        placeholder="0,00"
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

                  {getDiscountValue() > 0 && (
                    <div className="space-y-1 text-sm">
                      <div className="flex justify-between text-muted-foreground">
                        <span>Subtotal:</span>
                        <span>R$ {calculateSubtotal().toFixed(2)}</span>
                      </div>
                      <div className="flex justify-between text-success">
                        <span>Desconto:</span>
                        <span>− R$ {getDiscountValue().toFixed(2)}</span>
                      </div>
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
                        <Select
                          value={selectedCustomer?.id || ''}
                          onValueChange={(customerId) => {
                            const customer = customers.find(c => c.id === customerId);
                            if (customer) {
                              setSelectedCustomer(customer);
                              toast({
                                title: 'Cliente selecionado',
                                description: customer.full_name
                              });
                            }
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecionar cliente cadastrado..." />
                          </SelectTrigger>
                          <SelectContent>
                            {customers.map((customer) => (
                              <SelectItem key={customer.id} value={customer.id}>
                                <div className="flex items-center gap-2">
                                  <User className="w-4 h-4" />
                                  <div>
                                    <p className="font-medium">{customer.company_name || customer.full_name}</p>
                                    <p className="text-xs text-muted-foreground">
                                      {customer.cnpj ? `CNPJ: ${customer.cnpj}` : `CPF: ${customer.cpf}`}
                                    </p>
                                  </div>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        
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
      {cart.length > 0 && (
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
              onClick={() => {
                document
                  .getElementById('pdv-cart-panel')
                  ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
              }}
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
                  className="cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={() => {
                    if (variation.stock > 0) {
                      addToCart(selectedProduct, variation);
                      setShowVariationsDialog(false);
                    }
                  }}
                >
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
                      <span className="text-base font-bold text-primary">
                        R$ {selectedProduct ? getPdvPriceForVariation(selectedProduct, variation.price, paymentMethod).toFixed(2) : variation.price.toFixed(2)}
                      </span>
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

      {/* Diálogo de cadastro de cliente */}
      <Dialog open={showCustomerDialog} onOpenChange={setShowCustomerDialog}>
        <DialogContent className="max-w-md">
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
                <Input
                  id="cpf"
                  placeholder="000.000.000-00"
                  value={customerForm.cpf}
                  onChange={(e) => setCustomerForm({ ...customerForm, cpf: e.target.value })}
                  maxLength={14}
                />
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
              <Input
                id="cep"
                placeholder="00000-000"
                value={customerForm.cep}
                onChange={(e) => setCustomerForm({ ...customerForm, cep: e.target.value })}
                maxLength={9}
              />
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
                className="flex-1 bg-orange-500 hover:bg-orange-600"
              >
                <Check className="w-4 h-4 mr-2" />
                Salvar Cliente
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
      <Dialog open={showSavedSalesDialog} onOpenChange={setShowSavedSalesDialog}>
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
                                            const subtotal = items.reduce(
                                              (s: number, it: any) => s + (it.customPrice ?? it.product?.price ?? 0) * (it.quantity || 0),
                                              0
                                            );
                                            const discount = Math.max(0, subtotal - Number(sale.total_amount));
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
                                                unitPrice: it.customPrice ?? it.product?.price ?? 0,
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

      {tefEnabled && (
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
            // Re-dispara finalização agora com aprovação registrada
            setTimeout(() => { finalizeSale(); }, 50);
          }}
        />
      )}
    </div>
  );
}
