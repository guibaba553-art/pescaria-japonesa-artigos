import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Header } from '@/components/Header';
import Footer from '@/components/Footer';
import { useCart } from '@/hooks/useCart';
import { useAuth } from '@/hooks/useAuth';
import { PixPaymentDialog } from '@/components/PixPaymentDialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { MapPin, Pencil, Plus, Trash2, CreditCard, Loader2, Store, Check, Truck, Smartphone, Wallet, ShoppingCart } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { sanitizeNumericInput, formatCEP } from '@/utils/validation';
import { packItems } from '@/utils/packShipment';
import { SHIPPING_CONFIG } from '@/config/constants';
import type { UserAddress } from '@/components/MyAddresses';

interface FormState {
  recipient_name: string;
  cep: string;
  street: string;
  number: string;
  complement: string;
  neighborhood: string;
  city: string;
  state: string;
}

const emptyForm: FormState = {
  recipient_name: '',
  cep: '',
  street: '',
  number: '',
  complement: '',
  neighborhood: '',
  city: '',
  state: '',
};

interface SavedMethod {
  id: string;
  payment_method: string;
  card_brand: string | null;
  card_last4: string | null;
  card_exp_month: string | null;
  card_exp_year: string | null;
  cardholder_name: string | null;
  is_default: boolean;
  last_used_at: string | null;
}

function addressToForm(a: UserAddress): FormState {
  return {
    recipient_name: a.recipient_name,
    cep: a.cep,
    street: a.street,
    number: a.number,
    complement: a.complement || '',
    neighborhood: a.neighborhood,
    city: a.city,
    state: a.state,
  };
}

export default function CheckoutEntrega() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, loading } = useAuth();
  const { items, total, itemCount } = useCart();

  const freteNome = searchParams.get('frete');
  const freteValor = parseFloat(searchParams.get('frete_valor') || '0');
  const isPickup = freteNome === 'Retirar na Loja';

  // Endereço
  const [addresses, setAddresses] = useState<UserAddress[]>([]);
  const [loadingAddresses, setLoadingAddresses] = useState(true);
  const [editMode, setEditMode] = useState<'new' | string | null>(null); // null = not editing, 'new' = new, string = address id
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [selectedOption, setSelectedOption] = useState<'pickup' | string>(
    isPickup ? 'pickup' : ''
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<'pix' | 'credit_card'>('pix');
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [savedCards, setSavedCards] = useState<SavedMethod[]>([]);

  const selectedAddress = typeof selectedOption === 'string' && selectedOption !== 'pickup'
    ? addresses.find((a) => a.id === selectedOption) ?? null
    : null;
  // Endereço atual em destaque (primary spot) — inicializa com o padrão
  const [primaryAddressId, setPrimaryAddressId] = useState<string | null>(null);
  useEffect(() => {
    if (addresses.length > 0 && !primaryAddressId) {
      const def = addresses.find((a) => a.is_default) ?? addresses[0];
      if (def) setPrimaryAddressId(def.id);
    }
  }, [addresses]);
  const primaryAddress = primaryAddressId ? addresses.find((a) => a.id === primaryAddressId) ?? null : null;
  const hiddenAddresses = primaryAddress ? addresses.filter((a) => a.id !== primaryAddress.id) : [];
  const [addressDialogOpen, setAddressDialogOpen] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [pixDialog, setPixDialog] = useState<{ open: boolean; qrCode: string; qrCodeBase64: string; orderId: string; expiresAt?: string }>({
    open: false,
    qrCode: '',
    qrCodeBase64: '',
    orderId: '',
  });

  // Dimensões dos produtos (para cálculo de frete)
  const [productDims, setProductDims] = useState<Record<string, { weight_grams: number | null; length_cm: number | null; width_cm: number | null; height_cm: number | null }>>({});
  const [variationDims, setVariationDims] = useState<Record<string, { weight_grams: number | null; length_cm: number | null; width_cm: number | null; height_cm: number | null }>>({});

  // Carrega dimensões dos produtos/variations do carrinho
  useEffect(() => {
    const productIds = items.map((p) => p.id).filter(Boolean);
    const variationIds = items.map((p) => p.variationId).filter((x): x is string => !!x);
    const missingProducts = productIds.filter((id) => !(id in productDims));
    const missingVariations = variationIds.filter((id) => !(id in variationDims));
    if (missingProducts.length === 0 && missingVariations.length === 0) return;

    (async () => {
      if (missingProducts.length > 0) {
        const { data } = await supabase.from('products').select('id, weight_grams, length_cm, width_cm, height_cm').in('id', missingProducts);
        if (data) {
          setProductDims((prev) => {
            const next = { ...prev };
            data.forEach((p: any) => { next[p.id] = { weight_grams: p.weight_grams, length_cm: p.length_cm ? Number(p.length_cm) : null, width_cm: p.width_cm ? Number(p.width_cm) : null, height_cm: p.height_cm ? Number(p.height_cm) : null }; });
            return next;
          });
        }
      }
      if (missingVariations.length > 0) {
        const { data } = await supabase.from('product_variations').select('id, weight_grams, length_cm, width_cm, height_cm').in('id', missingVariations);
        if (data) {
          setVariationDims((prev) => {
            const next = { ...prev };
            data.forEach((v: any) => { next[v.id] = { weight_grams: v.weight_grams, length_cm: v.length_cm ? Number(v.length_cm) : null, width_cm: v.width_cm ? Number(v.width_cm) : null, height_cm: v.height_cm ? Number(v.height_cm) : null }; });
            return next;
          });
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  // Frete calculado
  const [shippingLoading, setShippingLoading] = useState(false);
  const [shippingOptions, setShippingOptions] = useState<Array<{ codigo: string; nome: string; valor: number; prazoEntrega: number }> | null>(null);
  const [shippingError, setShippingError] = useState(false);
  const [selectedShippingOption, setSelectedShippingOption] = useState<{ codigo: string; nome: string; valor: number; prazoEntrega: number } | null>(null);

  const calculateShipping = useCallback(async (cepDestino: string) => {
    if (!/^\d{8}$/.test(cepDestino)) return;
    setShippingLoading(true);
    setShippingError(false);

    try {
      const shipmentItems = items.map((p, i) => {
        const pd = (p.id && productDims[p.id]) || null;
        const vd = (p.variationId && variationDims[p.variationId]) || null;
        return {
          id: p.variationId || p.id || String(i + 1),
          quantity: p.quantity,
          width_cm: vd?.width_cm ?? pd?.width_cm ?? null,
          height_cm: vd?.height_cm ?? pd?.height_cm ?? null,
          length_cm: vd?.length_cm ?? pd?.length_cm ?? null,
          weight_grams: vd?.weight_grams ?? pd?.weight_grams ?? null,
        };
      });
      const meProducts = packItems(shipmentItems, 0);

      const { data, error } = await supabase.functions.invoke('calculate-shipping', {
        body: {
          cepDestino,
          products: meProducts,
          peso: SHIPPING_CONFIG.DEFAULT_WEIGHT,
          formato: SHIPPING_CONFIG.DEFAULT_FORMAT,
          comprimento: SHIPPING_CONFIG.DEFAULT_DIMENSIONS.length,
          altura: SHIPPING_CONFIG.DEFAULT_DIMENSIONS.height,
          largura: SHIPPING_CONFIG.DEFAULT_DIMENSIONS.width,
        },
      });

      if (error || !data?.success) {
        setShippingError(true);
        setShippingOptions(null);
      } else {
        const opts = (data.options || []) as Array<{ codigo: string; nome: string; valor: number; prazoEntrega: number }>;
        setShippingOptions(opts);
        // Auto-seleciona a opção mais barata se nada foi selecionado ainda
        const cheapest = [...opts]
          .filter((o) => o.codigo !== 'RETIRADA' && !o.codigo.startsWith('frenet-'))
          .sort((a, b) => a.valor - b.valor)[0];
        if (cheapest) setSelectedShippingOption(cheapest);
      }
    } catch {
      setShippingError(true);
      setShippingOptions(null);
    } finally {
      setShippingLoading(false);
    }
  }, [items, productDims, variationDims]);

  // Recalcular frete ao trocar de endereço
  useEffect(() => {
    if (!selectedAddress) {
      setShippingOptions(null);
      setShippingError(false);
      setSelectedShippingOption(null);
      return;
    }
    calculateShipping(selectedAddress.cep);
  }, [selectedAddress?.id, calculateShipping]);

  // Frete exibido: pickup = 0, endereço = opção selecionada (ou mais barato), fallback = URL param
  const cheapestShipping = shippingOptions
    ? [...shippingOptions].filter((o) => o.codigo !== 'RETIRADA' && !o.codigo.startsWith('frenet-')).sort((a, b) => a.valor - b.valor)[0]
    : null;

  const activeShipping = selectedShippingOption ?? cheapestShipping;

  const displayFreteNome = selectedOption === 'pickup'
    ? 'Retirar na loja'
    : activeShipping
      ? activeShipping.nome
      : (shippingError ? 'Frete indisponível' : (freteNome || 'Frete'));
  const displayFreteValor = selectedOption === 'pickup'
    ? 0
    : activeShipping
      ? activeShipping.valor
      : (shippingError ? 0 : freteValor);

  const loadAddresses = async () => {
    if (!user) return;
    setLoadingAddresses(true);
    const { data } = await supabase
      .from('user_addresses')
      .select('*')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });
    if (data) {
      setAddresses(data);
      // Auto-select default if nothing selected yet and not pickup
      if (!isPickup && !selectedOption) {
        const def = data.find((a) => a.is_default) ?? data[0];
        if (def) setSelectedOption(def.id);
      }
    }
    setLoadingAddresses(false);
  };

  useEffect(() => {
    loadAddresses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Carrega cartões salvos
  useEffect(() => {
    if (!user) return;
    supabase
      .from('saved_payment_methods')
      .select('*')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })
      .order('last_used_at', { ascending: false })
      .then(({ data }) => setSavedCards((data as SavedMethod[]) || []));
  }, [user?.id]);

  const openNew = () => {
    setForm(emptyForm);
    setEditMode('new');
  };

  const openEdit = (a: UserAddress) => {
    setForm(addressToForm(a));
    setEditMode(a.id);
  };

  const cancelEdit = () => {
    setEditMode(null);
  };

  const lookupCep = async (cep: string) => {
    if (cep.length !== 8) return;
    setCepLoading(true);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const d = await r.json();
      if (!d.erro) {
        setForm((p) => ({
          ...p,
          street: d.logradouro || p.street,
          neighborhood: d.bairro || p.neighborhood,
          city: d.localidade || p.city,
          state: d.uf || p.state,
        }));
      }
    } catch {
      // silencioso
    } finally {
      setCepLoading(false);
    }
  };

  const handleSave = async () => {
    if (!user) return;
    if (!form.recipient_name.trim()) return toast.error('Informe o destinatário');
    if (form.cep.length !== 8) return toast.error('CEP inválido');
    if (!form.street.trim() || !form.number.trim() || !form.neighborhood.trim() || !form.city.trim() || form.state.length !== 2) {
      return toast.error('Preencha o endereço completo');
    }

    setSaving(true);
    const payload = {
      user_id: user.id,
      label: 'Endereço',
      recipient_name: form.recipient_name.trim(),
      recipient_phone: null,
      cep: form.cep,
      street: form.street.trim(),
      number: form.number.trim(),
      complement: form.complement.trim() || null,
      neighborhood: form.neighborhood.trim(),
      city: form.city.trim(),
      state: form.state.toUpperCase(),
      is_default: addresses.length === 0,
    };

    const isUpdate = editMode !== null && editMode !== 'new';
    let result;
    if (isUpdate) {
      result = await supabase
        .from('user_addresses')
        .update(payload)
        .eq('id', editMode)
        .select()
        .single();
    } else {
      result = await supabase
        .from('user_addresses')
        .insert(payload)
        .select()
        .single();
    }
    setSaving(false);

    if (result.error) {
      toast.error('Erro ao salvar: ' + result.error.message);
      return;
    }
    toast.success(isUpdate ? 'Endereço atualizado' : 'Endereço salvo');
    setEditMode(null);
    await loadAddresses();
    if (result.data) setSelectedOption(result.data.id);
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    const { error } = await supabase.from('user_addresses').delete().eq('id', deletingId);
    if (error) {
      toast.error('Erro ao excluir');
    } else {
      toast.success('Endereço excluído');
      if (selectedOption === deletingId) setSelectedOption('pickup');
      await loadAddresses();
    }
    setDeletingId(null);
  };

  const handleFinalizeOrder = async () => {
    if (finalizing) return;
    setFinalizing(true);

    try {
      // 1. Validar carrinho
      const { validateSiteCart } = await import('@/utils/siteCartValidation');
      const validation = await validateSiteCart(items);
      if (!validation.valid) {
        const orphan = validation.issues.find(
          (i) => i.reason === 'product_not_found' || i.reason === 'variation_not_found',
        );
        if (orphan) {
          toast.error(`${orphan.name}: ${orphan.details} Remova-o do carrinho e tente novamente.`);
          return;
        }
        const oos = validation.issues.find((i) => i.reason === 'out_of_stock');
        if (oos) {
          toast.error(`${oos.name}: ${oos.details}`);
          return;
        }
        const price = validation.issues.find((i) => i.reason === 'price_changed');
        if (price) {
          toast.error(`O preço de "${price.name}" foi atualizado. Atualize a página para ver o novo valor.`);
          return;
        }
      }

      // 2. Limpar pedidos abandonados anteriores
      const { data: abandonedOrders } = await supabase
        .from('orders')
        .select('id')
        .eq('user_id', user!.id)
        .eq('status', 'aguardando_pagamento')
        .is('payment_id', null);
      for (const ab of abandonedOrders || []) {
        try { await supabase.rpc('release_stock_reservation', { p_order_id: ab.id }); } catch {}
        try { await supabase.from('order_items').delete().eq('order_id', ab.id); } catch {}
        try { await supabase.from('orders').delete().eq('id', ab.id); } catch {}
      }

      // 3. Montar dados do pedido
      const isPickup = selectedOption === 'pickup';
      const address = isPickup ? null : selectedAddress;

      const meServiceMatch = selectedShippingOption?.codigo?.match(/^me-(\d+)$/);
      const meServiceId = meServiceMatch ? parseInt(meServiceMatch[1], 10) : null;

      const { data: orderData, error: orderError } = await supabase
        .from('orders')
        .insert({
          user_id: user!.id,
          total_amount: total + displayFreteValor,
          shipping_cost: displayFreteValor,
          shipping_address: address
            ? `${address.street}, ${address.number}${address.complement ? ` — ${address.complement}` : ''} — ${address.neighborhood}, ${address.city}/${address.state}`
            : 'Retirada na loja',
          shipping_cep: address ? address.cep : SHIPPING_CONFIG.ORIGIN_CEP,
          shipping_recipient_name: address?.recipient_name ?? null,
          shipping_recipient_phone: address?.recipient_phone ?? null,
          shipping_street: address?.street ?? null,
          shipping_number: address?.number ?? null,
          shipping_complement: address?.complement ?? null,
          shipping_neighborhood: address?.neighborhood ?? null,
          shipping_city: address?.city ?? null,
          shipping_uf: address?.state ?? null,
          status: 'aguardando_pagamento',
          delivery_type: isPickup ? 'pickup' : 'delivery',
          shipping_service_id: meServiceId,
        })
        .select()
        .single();

      if (orderError || !orderData) {
        throw new Error(orderError?.message || 'Erro ao criar pedido');
      }

      // 4. Criar itens do pedido
      const orderItems = items.map(item => ({
        order_id: orderData.id,
        product_id: item.id,
        variation_id: item.variationId || null,
        quantity: item.quantity,
        price_at_purchase: item.price,
      }));
      await supabase.from('order_items').insert(orderItems);

      // 5. Reservar estoque
      const { error: resvError } = await supabase.rpc('reserve_stock_for_order', {
        p_order_id: orderData.id,
        p_items: items.map(item => ({
          product_id: item.id,
          variation_id: item.variationId || null,
          quantity: item.quantity,
        })),
        p_ttl_minutes: 30,
      });
      if (resvError) {
        await supabase.from('order_items').delete().eq('order_id', orderData.id);
        await supabase.from('orders').delete().eq('id', orderData.id);
        throw new Error(resvError.message || 'Estoque indisponível para um ou mais itens.');
      }

      // 6. Consumir limite de promoções
      const { error: promoError } = await supabase.rpc('consume_promo_limits', {
        p_items: items.map(item => ({
          product_id: item.id,
          variation_id: item.variationId || null,
          quantity: item.quantity,
        })),
      });
      if (promoError) {
        try { await supabase.rpc('release_stock_reservation', { p_order_id: orderData.id }); } catch {}
        await supabase.from('order_items').delete().eq('order_id', orderData.id);
        await supabase.from('orders').delete().eq('id', orderData.id);
        throw new Error(promoError.message || 'Limite de promoção atingido.');
      }

      // 7. Processar pagamento conforme método selecionado
      if (selectedPayment === 'pix') {
        // PIX via AbacatePay Transparente
        const amountInCents = Math.round((total + displayFreteValor) * 100);

        // Busca dados completos do usuário para o customer
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, cpf, phone')
          .eq('id', user!.id)
          .single();

        const { data: pixData, error: pixError } = await supabase.functions.invoke(
          'create-abacatepay-pix',
          {
            body: {
              orderId: orderData.id,
              amount: amountInCents,
              description: `Pedido ${orderData.id.substring(0, 8)}`,
              customerName: profile?.full_name || selectedAddress?.recipient_name || user?.user_metadata?.name,
              customerTaxId: profile?.cpf || undefined,
              customerEmail: user?.email,
              customerCellphone: profile?.phone || undefined,
            },
          }
        );

        if (pixError || !pixData?.success || !pixData?.data) {
          try { await supabase.rpc('release_stock_reservation', { p_order_id: orderData.id }); } catch {}
          await supabase.from('order_items').delete().eq('order_id', orderData.id);
          await supabase.from('orders').delete().eq('id', orderData.id);
          throw new Error(pixData?.error || pixError?.message || 'Erro ao gerar PIX');
        }

        // Abre dialog com QR Code PIX
        setPixDialog({
          open: true,
          qrCode: pixData.data.brCode || '',
          qrCodeBase64: pixData.data.brCodeBase64 || '',
          orderId: orderData.id,
          expiresAt: pixData.data.expiresAt,
        });
        return;
        return;
      }

      if (selectedPayment === 'credit_card') {
        // Checkout hospedado via AbacatePay
        const isCardOnly = selectedPayment === 'credit_card';
        const { data: checkoutData, error: checkoutError } = await supabase.functions.invoke(
          'create-abacatepay-checkout',
          {
            body: {
              orderId: orderData.id,
              items: items.map(item => ({
                id: item.id,
                name: item.name,
                quantity: item.quantity,
                price: item.price,
                variationId: item.variationId,
              })),
              methods: isCardOnly ? ['CARD'] : ['PIX', 'CARD'],
              successUrl: `${window.location.origin}/conta?payment=success`,
              returnUrl: `${window.location.origin}/checkout/entrega`,
            },
          }
        );

        if (checkoutError || !checkoutData?.success || !checkoutData?.data?.url) {
          try { await supabase.rpc('release_stock_reservation', { p_order_id: orderData.id }); } catch {}
          await supabase.from('order_items').delete().eq('order_id', orderData.id);
          await supabase.from('orders').delete().eq('id', orderData.id);
          throw new Error(checkoutData?.error || checkoutError?.message || 'Erro ao criar checkout');
        }

        // Redireciona para o checkout AbacatePay
        window.location.href = checkoutData.data.url;
        return;
      }

    } catch (err: any) {
      toast.error(err?.message || 'Erro ao finalizar pedido');
    } finally {
      setFinalizing(false);
    }
  };

  if (loading) return null;
  if (!user) {
    navigate('/auth?redirect=/checkout/entrega');
    return null;
  }
  if (items.length === 0) {
    return (
      <div className="min-h-screen flex flex-col pt-20 lg:pt-32">
        <Header />
        <main className="flex-1 container mx-auto py-12 text-center">
          <ShoppingCart className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
          <h1 className="text-2xl font-bold mb-2">Seu carrinho está vazio</h1>
          <p className="text-muted-foreground mb-6">Adicione produtos antes de finalizar a compra.</p>
          <Button onClick={() => navigate('/produtos')}>Ver produtos</Button>
        </main>
        <Footer />
      </div>
    );
  }

  const isEditing = editMode !== null;

  return (
    <div className="min-h-screen flex flex-col bg-muted/20 pt-20 lg:pt-32">
      <Header />
      <main className="flex-1 container mx-auto py-8">
        <h1 className="text-2xl font-bold mb-6">Entrega e pagamento</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Coluna Esquerda */}
          <div className="lg:col-span-2 space-y-6">
            {/* Seletor de entrega */}
            <div className="bg-card rounded-xl border p-4">
              <h2 className="font-semibold flex items-center gap-2 mb-4">
                <MapPin className="w-4 h-4 text-primary" />
                Forma de entrega
              </h2>

              {loadingAddresses ? (
                <p className="text-sm text-muted-foreground">Carregando...</p>
              ) : (
                <div className="space-y-3">
                  {/* ---- RETIRADA NA LOJA ---- */}
                  <Card
                    className={`rounded-2xl cursor-pointer transition-all ${
                      selectedOption === 'pickup'
                        ? 'border-primary ring-2 ring-primary/30'
                        : 'border-border hover:border-primary/40'
                    }`}
                    onClick={() => setSelectedOption('pickup')}
                  >
                    <CardContent className="p-4 flex items-start gap-3">
                      <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                        selectedOption === 'pickup' ? 'border-primary bg-primary' : 'border-muted-foreground/40'
                      }`}>
                        {selectedOption === 'pickup' && <Check className="w-3 h-3 text-primary-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <Store className="w-4 h-4 text-muted-foreground" />
                          <p className="font-semibold text-sm">Retirar na loja</p>
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5">
                          Retire seu pedido diretamente em nossa loja. Nenhum endereço de entrega é necessário.
                        </p>
                      </div>
                    </CardContent>
                  </Card>

                  {/* ---- ENDEREÇO EM DESTAQUE ---- */}
                  {primaryAddress && (() => {
                    const a = primaryAddress;
                    return (
                      <Card
                        key={a.id}
                        className={`rounded-2xl cursor-pointer transition-all ${
                          selectedOption === a.id
                            ? 'border-primary ring-2 ring-primary/30'
                            : 'border-border hover:border-primary/40'
                        }`}
                        onClick={() => setSelectedOption(a.id)}
                      >
                        <CardContent className="p-4 flex items-start gap-3">
                          <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                            selectedOption === a.id ? 'border-primary bg-primary' : 'border-muted-foreground/40'
                          }`}>
                            {selectedOption === a.id && <Check className="w-3 h-3 text-primary-foreground" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground">
                                <MapPin className="w-3 h-3" /> {a.label}
                              </span>
                              {a.is_default && (
                                <span className="text-xs text-primary font-medium">Padrão</span>
                              )}
                            </div>
                            <p className="font-semibold text-sm mt-1">{a.recipient_name}</p>
                            <p className="text-sm text-muted-foreground">
                              {a.street}, {a.number}
                              {a.complement ? ` — ${a.complement}` : ''}
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {a.neighborhood} — {a.city}/{a.state} — CEP: {formatCEP(a.cep)}
                            </p>
                            <div className="flex gap-1 mt-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs rounded-full"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openEdit(a);
                                }}
                              >
                                <Pencil className="w-3 h-3 mr-1" /> Editar
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-xs rounded-full text-destructive hover:text-destructive"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setDeletingId(a.id);
                                }}
                              >
                                <Trash2 className="w-3 h-3 mr-1" /> Excluir
                              </Button>
                            </div>
                          </div>
                        </CardContent>

                        {/* Opções de frete para este endereço (visível quando selecionado) */}
                        {selectedOption === a.id && shippingOptions && !shippingLoading && (
                          <div className="border-t border-border px-4 pb-4 pt-3 space-y-2">
                            <p className="text-[11px] uppercase font-bold tracking-wider text-muted-foreground">
                              Opções de frete
                            </p>
                            {(() => {
                              const delivery = [...shippingOptions].filter(
                                (o) => o.codigo !== 'RETIRADA' && !o.codigo.startsWith('frenet-')
                              );
                              if (delivery.length === 0) {
                                return (
                                  <p className="text-sm text-muted-foreground py-2 text-center">
                                    Nenhuma transportadora atende esse CEP no momento.
                                  </p>
                                );
                              }
                              const cheapest = [...delivery].sort((a, b) => a.valor - b.valor)[0];
                              const fastest = [...delivery].sort((a, b) => a.prazoEntrega - b.prazoEntrega)[0];
                              const sorted = [...delivery].sort((a, b) => {
                                if (a.codigo === cheapest.codigo) return -1;
                                if (b.codigo === cheapest.codigo) return 1;
                                if (a.codigo === fastest.codigo) return -1;
                                if (b.codigo === fastest.codigo) return 1;
                                return a.valor - b.valor;
                              });
                              return sorted.map((option) => {
                                const sel = selectedShippingOption?.codigo === option.codigo;
                                const isCheapest = option.codigo === cheapest.codigo;
                                const isFastest = option.codigo === fastest.codigo && !isCheapest;
                                return (
                                  <button
                                    key={option.codigo}
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedShippingOption(
                                        sel ? null : option
                                      );
                                    }}
                                    className={`w-full text-left rounded-lg border p-2.5 transition-all flex items-center justify-between gap-2 ${
                                      sel
                                        ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
                                        : 'border-border hover:bg-accent'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <div
                                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                          sel ? 'border-primary bg-primary' : 'border-muted-foreground/30'
                                        }`}
                                      >
                                        {sel && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                                      </div>
                                      <Truck className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                      <div className="min-w-0">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <p className="text-sm font-medium truncate">{option.nome}</p>
                                          {isCheapest && (
                                            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                                              Mais barato
                                            </span>
                                          )}
                                          {isFastest && (
                                            <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-700 dark:text-blue-400 border border-blue-500/30">
                                              Mais rápido
                                            </span>
                                          )}
                                        </div>
                                        <p className="text-xs text-muted-foreground">
                                          Entrega em {option.prazoEntrega} dias úteis
                                        </p>
                                      </div>
                                    </div>
                                    <p className="font-bold text-sm shrink-0">
                                      R$ {option.valor.toFixed(2).replace('.', ',')}
                                    </p>
                                  </button>
                                );
                              });
                            })()}
                          </div>
                        )}

                        {/* Loading state */}
                        {selectedOption === a.id && shippingLoading && (
                          <div className="border-t border-border px-4 pb-4 pt-3">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Calculando fretes...
                            </div>
                          </div>
                        )}
                      </Card>
                    );
                  })()}

                  {/* ---- BOTÃO SELECIONAR OUTRO ENDEREÇO ---- */}
                  {hiddenAddresses.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setAddressDialogOpen(true)}
                      className="w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl border border-dashed border-border hover:border-primary/40 hover:bg-accent/50 text-sm text-muted-foreground hover:text-foreground transition-all"
                    >
                      <MapPin className="w-4 h-4" />
                      Selecionar outro endereço
                    </button>
                  )}

                  {/* ---- BOTÃO NOVO ENDEREÇO ---- */}
                  <Button
                    variant="outline"
                    size="sm"
                    className="rounded-full"
                    onClick={openNew}
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Cadastrar novo endereço
                  </Button>
                </div>
              )}

              {/* ---- FORMULÁRIO INLINE ---- */}
              {isEditing && (
                <div className="mt-4 pt-4 border-t space-y-3">
                  <p className="text-sm font-semibold text-muted-foreground">
                    {editMode !== null && editMode !== 'new' ? 'Editar endereço' : 'Novo endereço'}
                  </p>
                  <div>
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">CEP</Label>
                    <div className="relative">
                      <Input
                        value={formatCEP(form.cep)}
                        onChange={(e) => {
                          const v = sanitizeNumericInput(e.target.value);
                          setForm({ ...form, cep: v });
                          if (v.length === 8) lookupCep(v);
                        }}
                        maxLength={9}
                        placeholder="00000-000"
                      />
                      {cepLoading && (
                        <Loader2 className="w-4 h-4 absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
                      )}
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Destinatário</Label>
                    <Input
                      value={form.recipient_name}
                      onChange={(e) => setForm({ ...form, recipient_name: e.target.value })}
                      placeholder="Nome"
                    />
                  </div>
                  <div className="grid grid-cols-[1fr_100px] gap-3">
                    <div>
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Endereço</Label>
                      <Input
                        value={form.street}
                        onChange={(e) => setForm({ ...form, street: e.target.value })}
                        placeholder="Endereço"
                      />
                    </div>
                    <div>
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Número</Label>
                      <Input
                        value={form.number}
                        onChange={(e) => setForm({ ...form, number: e.target.value })}
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Complemento</Label>
                    <Input
                      value={form.complement}
                      onChange={(e) => setForm({ ...form, complement: e.target.value })}
                      placeholder="Apto, bloco..."
                    />
                  </div>
                  <div>
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Bairro</Label>
                    <Input
                      value={form.neighborhood}
                      onChange={(e) => setForm({ ...form, neighborhood: e.target.value })}
                      placeholder="Bairro"
                    />
                  </div>
                  <div className="grid grid-cols-[1fr_80px] gap-3">
                    <div>
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Cidade</Label>
                      <Input
                        value={form.city}
                        onChange={(e) => setForm({ ...form, city: e.target.value })}
                        placeholder="Cidade"
                      />
                    </div>
                    <div>
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">Estado</Label>
                      <Input
                        value={form.state}
                        onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase() })}
                        maxLength={2}
                        placeholder="UF"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button onClick={handleSave} disabled={saving} className="rounded-full">
                      {saving ? 'Salvando...' : 'Salvar endereço'}
                    </Button>
                    <Button variant="outline" onClick={cancelEdit} disabled={saving} className="rounded-full">
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* Método de pagamento */}
            <div className="bg-card rounded-xl border p-4">
              <h2 className="font-semibold flex items-center gap-2 mb-4">
                <CreditCard className="w-4 h-4 text-primary" />
                Método de pagamento
              </h2>

              <div className="space-y-3">
                {/* PIX */}
                <div
                  className={`rounded-xl border p-4 cursor-pointer transition-all ${
                    selectedPayment === 'pix'
                      ? 'border-primary ring-2 ring-primary/30'
                      : 'border-border hover:border-primary/40'
                  }`}
                  onClick={() => setSelectedPayment('pix')}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      selectedPayment === 'pix' ? 'border-primary bg-primary' : 'border-muted-foreground/40'
                    }`}>
                      {selectedPayment === 'pix' && <Check className="w-3 h-3 text-primary-foreground" />}
                    </div>
                    <Smartphone className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold">PIX</p>
                        <Badge variant="secondary" className="text-[10px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30">
                          Mais rápido
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">Aprovação instantânea via QR Code</p>
                    </div>
                  </div>
                </div>

                {/* Cartão de Crédito */}
                <div
                  className={`rounded-xl border p-4 cursor-pointer transition-all ${
                    selectedPayment === 'credit_card'
                      ? 'border-primary ring-2 ring-primary/30'
                      : 'border-border hover:border-primary/40'
                  }`}
                  onClick={() => setSelectedPayment('credit_card')}
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                      selectedPayment === 'credit_card' ? 'border-primary bg-primary' : 'border-muted-foreground/40'
                    }`}>
                      {selectedPayment === 'credit_card' && <Check className="w-3 h-3 text-primary-foreground" />}
                    </div>
                    <CreditCard className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <p className="font-semibold">Cartão de Crédito</p>
                      <p className="text-sm text-muted-foreground">
                        {savedCards.length > 0
                          ? 'Selecione um cartão salvo'
                          : 'Nenhum cartão salvo ainda'}
                      </p>
                    </div>
                  </div>

                  {/* Lista de cartões salvos (visível apenas quando selecionado) */}
                  {selectedPayment === 'credit_card' && savedCards.length > 0 && (
                    <div className="mt-3 pt-3 border-t space-y-2">
                      {savedCards.map((card) => (
                        <div
                          key={card.id}
                          className={`rounded-lg border p-3 cursor-pointer transition-all ${
                            selectedCardId === card.id
                              ? 'border-primary bg-primary/5'
                              : 'border-border hover:bg-accent'
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedCardId(selectedCardId === card.id ? null : card.id);
                          }}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <CreditCard className="w-4 h-4 text-primary shrink-0" />
                              <div className="min-w-0">
                                <p className="text-sm font-medium truncate">
                                  {card.card_brand ?? 'Cartão'} •••• {card.card_last4 ?? '????'}
                                </p>
                                <p className="text-xs text-muted-foreground truncate">
                                  {card.cardholder_name ?? '—'}
                                  {card.card_exp_month && card.card_exp_year
                                    ? ` · ${card.card_exp_month}/${card.card_exp_year.slice(-2)}`
                                    : ''}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              {card.is_default && (
                                <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                                  Padrão
                                </span>
                              )}
                              <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                                selectedCardId === card.id ? 'border-primary bg-primary' : 'border-muted-foreground/30'
                              }`}>
                                {selectedCardId === card.id && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-xs rounded-full"
                        onClick={(e) => {
                          e.stopPropagation();
                          // Futuro: abrir cadastro de novo cartão
                        }}
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        Cadastrar novo cartão
                      </Button>
                    </div>
                  )}

                  {/* Estado vazio: sem cartões salvos */}
                  {selectedPayment === 'credit_card' && savedCards.length === 0 && (
                    <div className="mt-3 pt-3 border-t">
                      <Button
                        variant="outline"
                        size="sm"
                        className="rounded-full text-xs"
                        onClick={(e) => {
                          e.stopPropagation();
                          // Futuro: abrir dialog para cadastrar cartão
                        }}
                      >
                        <Plus className="w-3.5 h-3.5 mr-1" />
                        Cadastrar cartão
                      </Button>
                    </div>
                  )}
                </div>

              </div>
            </div>
          </div>

          {/* Coluna Direita: Resumo */}
          <div className="lg:col-span-1">
            <div className="bg-card rounded-xl border p-4 space-y-3 sticky top-20 lg:top-32">
              <h2 className="font-semibold">Resumo</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal ({itemCount} {itemCount === 1 ? 'item' : 'itens'})</span>
                  <span>R$ {total.toFixed(2).replace('.', ',')}</span>
                </div>
                <div className="flex justify-between text-muted-foreground">
                  <span className="flex items-center gap-1.5">
                    {shippingLoading ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : cheapestShipping ? (
                      <Truck className="w-3 h-3" />
                    ) : null}
                    {shippingLoading ? 'Calculando frete...' : displayFreteNome || 'Frete'}
                  </span>
                  <span>
                    {shippingLoading ? (
                      <Loader2 className="w-3 h-3 animate-spin inline" />
                    ) : shippingError ? (
                      <span className="text-destructive text-xs">Indisponível</span>
                    ) : displayFreteValor === 0 ? (
                      'Grátis'
                    ) : (
                      `R$ ${displayFreteValor.toFixed(2).replace('.', ',')}`
                    )}
                  </span>
                </div>
                <Separator />
                <div className="flex justify-between items-baseline">
                  <span className="font-bold text-base">Total</span>
                  <span className="text-xl font-bold text-primary">
                    R$ {(total + displayFreteValor).toFixed(2).replace('.', ',')}
                  </span>
                </div>
              </div>
              <Button
                className="w-full rounded-full font-bold"
                size="lg"
                onClick={handleFinalizeOrder}
                disabled={finalizing}
              >
                {finalizing ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Processando…
                  </span>
                ) : (
                  'Finalizar pedido'
                )}
              </Button>
            </div>
          </div>
        </div>
      </main>
      <Footer />

      {/* PIX Dialog */}
      <PixPaymentDialog
        open={pixDialog.open}
        onOpenChange={(open) => setPixDialog((prev) => ({ ...prev, open }))}
        qrCode={pixDialog.qrCode}
        qrCodeBase64={pixDialog.qrCodeBase64}
        orderId={pixDialog.orderId}
        expiresAt={pixDialog.expiresAt}
      />

      {/* Modal de seleção de endereço */}
      <Dialog open={addressDialogOpen} onOpenChange={setAddressDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Selecionar endereço</DialogTitle>
            <DialogDescription>
              Escolha um dos seus endereços para entrega.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
            {hiddenAddresses.map((a) => (
              <div
                key={a.id}
                className={`rounded-xl border p-4 cursor-pointer transition-all ${
                  selectedOption === a.id
                    ? 'border-primary ring-2 ring-primary/30'
                    : 'border-border hover:border-primary/40'
                }`}
                onClick={() => {
                  setSelectedOption(a.id);
                  setPrimaryAddressId(a.id);
                  setAddressDialogOpen(false);
                }}
              >
                <div className="flex items-start gap-3">
                  <div className={`mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                    selectedOption === a.id ? 'border-primary bg-primary' : 'border-muted-foreground/40'
                  }`}>
                    {selectedOption === a.id && <Check className="w-3 h-3 text-primary-foreground" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-muted text-muted-foreground">
                        <MapPin className="w-3 h-3" /> {a.label}
                      </span>
                    </div>
                    <p className="font-semibold text-sm mt-1">{a.recipient_name}</p>
                    <p className="text-sm text-muted-foreground">
                      {a.street}, {a.number}
                      {a.complement ? ` — ${a.complement}` : ''}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {a.neighborhood} — {a.city}/{a.state} — CEP: {formatCEP(a.cep)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Diálogo de confirmação de exclusão */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDeletingId(null)}>
          <div className="bg-card rounded-xl border p-6 max-w-sm mx-4 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold mb-2">Excluir endereço?</h3>
            <p className="text-sm text-muted-foreground mb-4">Esta ação não pode ser desfeita.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setDeletingId(null)}>Cancelar</Button>
              <Button size="sm" variant="destructive" onClick={handleDelete}>Excluir</Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
