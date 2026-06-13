import { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Header } from '@/components/Header';
import Footer from '@/components/Footer';
import { useCart } from '@/hooks/useCart';
import { useAuth } from '@/hooks/useAuth';
import { PixPaymentDialog } from '@/components/PixPaymentDialog';
import { CreditCardForm, type CreditCardFormData, type CreditCardFormHandle, type SavedCard } from '@/components/CreditCardForm';
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
import { MapPin, Pencil, Plus, Trash2, CreditCard, Loader2, Store, Check, Truck, Smartphone, Wallet, ShoppingCart } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { SavedMethod, PaymentOrder } from '@/types/payment';
import { formatCEP } from '@/utils/validation';
import { packItems } from '@/utils/packShipment';
import { SHIPPING_CONFIG } from '@/config/constants';
import type { UserAddress } from '@/components/MyAddresses';
import { AddressFields } from '@/components/AddressFields';

interface FormState {
  label: string;
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
  label: 'Casa',
  recipient_name: '',
  cep: '',
  street: '',
  number: '',
  complement: '',
  neighborhood: '',
  city: '',
  state: '',
};

function addressToForm(a: UserAddress): FormState {
  return {
    label: a.label,
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
  const { items, total, itemCount, clearCart } = useCart();

  const freteNome = searchParams.get('frete');
  const freteValor = parseFloat(searchParams.get('frete_valor') || '0');
  const isPickup = freteNome === 'Retirar na Loja';

  // Endereço
  const [addresses, setAddresses] = useState<UserAddress[]>([]);
  const [loadingAddresses, setLoadingAddresses] = useState(true);
  const [editMode, setEditMode] = useState<'new' | string | null>(null); // null = not editing, 'new' = new, string = address id
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [selectedOption, setSelectedOption] = useState<'pickup' | string>(
    isPickup ? 'pickup' : ''
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<'pix' | 'credit_card'>('pix');
  const handlePaymentChange = (method: 'pix' | 'credit_card') => {
    setSelectedPayment(method);
  };
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [savedCards, setSavedCards] = useState<SavedMethod[]>([]);
  const creditCardRef = useRef<CreditCardFormHandle>(null);
  const [installments, setInstallments] = useState(1);
  const [shouldSaveCard, setShouldSaveCard] = useState(false);
  const [cardLoading, setCardLoading] = useState(false);
  const [cardError, setCardError] = useState<string | undefined>();
  // Profile data for pre-filling card holder info
  const [profileData, setProfileData] = useState<{ name: string; email: string; cpf: string; phone: string } | null>(null);

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
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [processingStep, setProcessingStep] = useState('');
  const [pixCloseConfirmOpen, setPixCloseConfirmOpen] = useState(false);
  const [pixDialog, setPixDialog] = useState<{ open: boolean; qrCode: string; qrCodeBase64: string; orderId: string; expiresAt?: string; gateway?: 'abacatepay' | 'asaas' }>({
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
        if (data.length > 0) {
          const def = data.find((a) => a.is_default) ?? data[0];
          if (def) setSelectedOption(def.id);
        } else {
          // Sem endereços — auto-seleciona retirada na loja
          setSelectedOption('pickup');
        }
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

  // Auto-seleciona o primeiro cartão salvo quando a lista carrega
  useEffect(() => {
    if (savedCards.length > 0 && !selectedCardId) {
      setSelectedCardId(savedCards[0].id);
    }
  }, [savedCards]);

  // Load profile data for pre-filling card holder info
  useEffect(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('full_name, cpf, phone')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data) {
          setProfileData({
            name: data.full_name || '',
            email: user.email || '',
            cpf: data.cpf || '',
            phone: data.phone || '',
          });
        }
      });
  }, [user]);

  const openNew = () => {
    setForm({ ...emptyForm, recipient_name: profileData?.name || '' });
    setEditMode('new');
  };

  const openEdit = (a: UserAddress) => {
    setForm(addressToForm(a));
    setEditMode(a.id);
  };

  const cancelEdit = () => {
    setEditMode(null);
  };

  const handleSave = async () => {
    if (!user) return;
    if (form.cep.length !== 8) return toast.error('CEP inválido');
    if (!form.street.trim() || !form.number.trim() || !form.neighborhood.trim() || !form.city.trim() || form.state.length !== 2) {
      return toast.error('Preencha o endereço completo');
    }

    setSaving(true);
    const effectiveRecipient = profileData?.name || form.recipient_name.trim() || 'Cliente';
    const payload = {
      user_id: user.id,
      label: form.label.trim() || 'Endereço',
      recipient_name: effectiveRecipient,
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

    // ── Validações de formulário (backend guard) ──────────────
    if (!selectedOption) {
      toast.error('Selecione uma forma de entrega antes de finalizar o pedido.');
      return;
    }
    if (selectedOption !== 'pickup' && !selectedShippingOption) {
      toast.error('Selecione um frete para entrega antes de finalizar o pedido.');
      return;
    }
    if (!selectedPayment) {
      toast.error('Selecione uma forma de pagamento antes de finalizar o pedido.');
      return;
    }

    setFinalizing(true);
    setProcessingStep('Validando dados...');

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

      // 2. Limpar pedidos abandonados anteriores (apenas sem pagamento e criados há mais de 5 min)
      // Usa condição WHERE no DELETE para evitar race condition entre SELECT e DELETE
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();

      // Libera reserva de estoque dos pedidos abandonados
      const { data: abandonedIds } = await supabase
        .from('orders')
        .select('id')
        .eq('user_id', user!.id)
        .eq('status', 'aguardando_pagamento')
        .is('payment_id', null)
        .is('asaas_payment_id', null)
        .lt('created_at', fiveMinutesAgo);
      for (const ab of abandonedIds || []) {
        try { await supabase.rpc('release_stock_reservation', { p_order_id: ab.id }); } catch {}
        try { await supabase.from('order_items').delete().eq('order_id', ab.id); } catch {}
      }

      // DELETE único com WHERE — atômico, elimina race condition
      await supabase
        .from('orders')
        .delete()
        .eq('user_id', user!.id)
        .eq('status', 'aguardando_pagamento')
        .is('payment_id', null)
        .is('asaas_payment_id', null)
        .lt('created_at', fiveMinutesAgo);

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

      // 5. Verificar disponibilidade de estoque (usa get_available_stock que considera reservas ativas)
      setProcessingStep('Verificando estoque...');
      for (const item of items) {
        const { data: available, error: stockErr } = await supabase.rpc('get_available_stock', {
          p_product_id: item.id,
          p_variation_id: item.variationId || null,
        });
        if (stockErr || (available ?? 0) < item.quantity) {
          throw new Error(`${item.name}: apenas ${available ?? 0} unidade(s) disponível(is) no estoque.`);
        }
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
        await supabase.from('order_items').delete().eq('order_id', orderData.id);
        await supabase.from('orders').delete().eq('id', orderData.id);
        throw new Error(promoError.message || 'Limite de promoção atingido.');
      }

      // 7. Marcar pedido como colocado — impede duplicata se o usuário recarregar a página
      setOrderPlaced(true);

      // 8. Processar pagamento conforme método selecionado
      if (selectedPayment === 'pix') {
        setProcessingStep('Gerando QR Code PIX...');
        // PIX via AbacatePay Transparente com fallback Asaas
        const amountInCents = Math.round((total + displayFreteValor) * 100);

        // Busca dados completos do usuário para o customer
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name, cpf, phone')
          .eq('id', user!.id)
          .single();

        // Tenta AbacatePay primeiro
        let pixSuccess = false;
        let pixResult: any = null;
        let usedGateway: 'abacatepay' | 'asaas' = 'abacatepay';

        try {
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

          if (!pixError && pixData?.success && pixData?.data) {
            pixSuccess = true;
            pixResult = pixData.data;
          }
        } catch (abacatepayErr) {
          console.error('AbacatePay PIX error, trying fallback');
        }

        // Fallback: se AbacatePay falhou, tenta Asaas
        if (!pixSuccess) {
          try {
            const { data: asaasData, error: asaasError } = await supabase.functions.invoke(
              'create-asaas-pix',
              {
                body: { orderId: orderData.id },
              }
            );

            if (asaasError || !asaasData?.success) {
              throw new Error(asaasData?.error || asaasError?.message || 'PIX temporariamente indisponível');
            }

            pixSuccess = true;
            pixResult = asaasData.data;
            usedGateway = 'asaas';
          } catch (asaasErr) {
            // Ambos falharam — fazer rollback (sem reserva para liberar)
            await supabase.rpc('release_promo_limits', {
              p_items: items.map(item => ({
                product_id: item.id,
                variation_id: item.variationId || null,
                quantity: item.quantity,
              })),
            }).catch(() => {});
            await supabase.from('order_items').delete().eq('order_id', orderData.id);
            await supabase.from('orders').delete().eq('id', orderData.id);
            throw new Error('PIX temporariamente indisponível. Tente novamente mais tarde.');
          }
        }

        // Reservar estoque após PIX gerado com sucesso
        setProcessingStep('Reservando estoque...');
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
          // Race condition rara: estoque esgotou entre a verificação e a geração do QR
          await supabase.rpc('release_promo_limits', {
            p_items: items.map(item => ({
              product_id: item.id,
              variation_id: item.variationId || null,
              quantity: item.quantity,
            })),
          }).catch(() => {});
          await supabase.from('order_items').delete().eq('order_id', orderData.id);
          await supabase.from('orders').delete().eq('id', orderData.id);
          throw new Error('Estoque indisponível no momento. Seu PIX foi gerado mas não pôde ser confirmado. Tente novamente.');
        }

        // Abre dialog com QR Code PIX
        setPixDialog({
          open: true,
          qrCode: pixResult.brCode || '',
          qrCodeBase64: pixResult.brCodeBase64 || '',
          orderId: orderData.id,
          expiresAt: pixResult.expiresAt,
          gateway: usedGateway,
        });

        // Limpar carrinho somente após PIX gerado com sucesso
        clearCart();
        return;
      }

      if (selectedPayment === 'credit_card') {
        setProcessingStep('Processando pagamento...');
        // Obtém dados validados do formulário via ref — mostra erros inline se inválido
        const cardData = creditCardRef.current?.getData();
        if (!cardData) {
          toast.error('Corrija os erros no formulário do cartão antes de continuar.');
          return;
        }

        setCardLoading(true);
        setCardError(undefined);

        try {
          // Busca dados do perfil para customerData
          const { data: profile } = await supabase
            .from('profiles')
            .select('full_name, cpf, phone')
            .eq('id', user!.id)
            .single();

          // Capturar IP do cliente
          let remoteIp = '';
          try {
            const ipResp = await fetch('https://api.ipify.org?format=json');
            const ipData = await ipResp.json();
            remoteIp = ipData.ip;
          } catch {
            remoteIp = '127.0.0.1';
          }

          const { data: paymentResult, error: paymentError } = await supabase.functions.invoke(
            'create-payment-asaas',
            {
              body: {
                orderId: orderData.id,
                installmentCount: cardData.installmentCount,
                saveCard: cardData.saveCard,
                creditCard: cardData.creditCard,
                creditCardHolderInfo: cardData.creditCardHolderInfo,
                creditCardToken: cardData.creditCardToken,
                remoteIp,
                customerData: {
                  name: profile?.full_name || cardData.creditCardHolderInfo?.name || '',
                  email: user?.email || '',
                  cpfCnpj: profile?.cpf || cardData.creditCardHolderInfo?.cpfCnpj || '',
                  phone: profile?.phone || cardData.creditCardHolderInfo?.phone || '',
                },
              },
            }
          );

          if (paymentError || !paymentResult?.success) {
            // Cartão recusado — sem rollback
            const attemptsLeft = paymentResult?.attemptsRemaining ?? 2;
            setCardError(paymentResult?.error || 'Cartão recusado. Verifique os dados e tente novamente.');
            toast.error(`Cartão recusado. ${attemptsLeft} tentativa(s) restante(s).`);

            setCardLoading(false);
            return;
          }

          // Pagamento aprovado
          toast.success('Pagamento aprovado!');
          clearCart();

          setProcessingStep('Redirecionando...');
          navigate('/conta');
          return;
        } catch (cardErr: any) {
          setCardError(cardErr?.message || 'Erro ao processar pagamento');
          toast.error('Erro ao processar pagamento. Tente novamente.');
          return;
        } finally {
          setCardLoading(false);
        }
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
  if (items.length === 0 && !orderPlaced) {
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
                                    className={`w-full text-left rounded-lg border p-2.5 transition-all flex items-center justify-between gap-2 group ${
                                      sel
                                        ? 'border-primary bg-primary/10 ring-2 ring-primary/30'
                                        : 'border-border hover:border-accent hover:bg-accent/5'
                                    }`}
                                  >
                                    <div className="flex items-center gap-2 min-w-0">
                                      <div
                                        className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 transition-colors ${
                                          sel ? 'border-primary bg-primary' : 'border-muted-foreground/30 group-hover:border-accent'
                                        }`}
                                      >
                                        {sel && <Check className="w-2.5 h-2.5 text-primary-foreground" />}
                                      </div>
                                      <Truck className={`h-3.5 w-3.5 shrink-0 transition-colors ${
                                        sel ? 'text-primary' : 'text-muted-foreground'
                                      }`} />
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
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Apelido</Label>
                    <Input
                      value={form.label}
                      onChange={(e) => setForm({ ...form, label: e.target.value })}
                      placeholder="Casa, Trabalho..."
                    />
                  </div>
                  <AddressFields
                    value={{
                      cep: form.cep,
                      street: form.street,
                      number: form.number,
                      complement: form.complement,
                      neighborhood: form.neighborhood,
                      city: form.city,
                      state: form.state,
                    }}
                    onChange={(addr) => setForm({ ...form, ...addr })}
                    hideSavedAddresses
                  />
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
                  onClick={() => handlePaymentChange('pix')}
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

                {/* Cartão de Crédito — Checkout Transparente Asaas */}
                <div
                  className={`rounded-xl border p-4 cursor-pointer transition-all ${
                    selectedPayment === 'credit_card'
                      ? 'border-primary ring-2 ring-primary/30'
                      : 'border-border hover:border-primary/40'
                  }`}
                  onClick={() => handlePaymentChange('credit_card')}
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
                        Pagamento seguro com checkout transparente — até 10x sem juros
                      </p>
                    </div>
                  </div>

                  {/* CreditCardForm — visível apenas quando selecionado */}
                  {selectedPayment === 'credit_card' && (
                    <div className="mt-3 pt-3 border-t" onClick={(e) => e.stopPropagation()}>
                      <CreditCardForm
                        ref={creditCardRef}
                        totalAmount={total + displayFreteValor}
                        onInstallmentChange={setInstallments}
                        saveCard={shouldSaveCard}
                        onSaveCardChange={setShouldSaveCard}
                        loading={cardLoading}
                        savedCards={savedCards.map(c => ({
                          id: c.id,
                          cardBrand: c.card_brand,
                          cardLast4: c.card_last4,
                          cardExpMonth: c.card_exp_month,
                          cardExpYear: c.card_exp_year,
                          cardholderName: c.cardholder_name,
                          asaasCreditCardToken: c.asaas_credit_card_token,
                        }))}
                        onSelectSavedCard={setSelectedCardId}
                        selectedSavedCardId={selectedCardId}
                        error={cardError}
                        initialHolderInfo={profileData ?? undefined}
                        savedAddresses={addresses.map(a => ({
                          id: a.id,
                          cep: a.cep,
                          street: a.street,
                          number: a.number,
                          complement: a.complement || undefined,
                          neighborhood: a.neighborhood,
                          city: a.city,
                          state: a.state,
                        }))}
                      />
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
                disabled={finalizing || selectedOption === '' || (selectedOption !== 'pickup' && !selectedShippingOption)}
              >
                {finalizing ? (
                  <span className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {processingStep || 'Processando…'}
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
        onOpenChange={(open) => {
          if (!open && pixDialog.open) {
            // User is trying to close — show confirmation
            setPixCloseConfirmOpen(true);
          } else {
            setPixDialog((prev) => ({ ...prev, open }));
          }
        }}
        qrCode={pixDialog.qrCode}
        qrCodeBase64={pixDialog.qrCodeBase64}
        orderId={pixDialog.orderId}
        expiresAt={pixDialog.expiresAt}
        gateway={pixDialog.gateway}
        onRefreshPix={async () => {
          setProcessingStep('Gerando novo PIX...');
          try {
            const gateway = pixDialog.gateway || 'abacatepay';
            const fnName = gateway === 'asaas' ? 'create-asaas-pix' : 'create-abacatepay-pix';
            const { data: newPix, error: pixError } = await supabase.functions.invoke(fnName, {
              body: { orderId: pixDialog.orderId },
            });
            if (pixError || !newPix?.success) {
              toast.error('Erro ao gerar novo PIX. Tente novamente.');
              return;
            }
            setPixDialog({
              open: true,
              qrCode: newPix.data.brCode || '',
              qrCodeBase64: newPix.data.brCodeBase64 || '',
              orderId: pixDialog.orderId,
              expiresAt: newPix.data.expiresAt,
              gateway,
            });
          } catch {
            toast.error('Erro ao gerar novo PIX.');
          }
        }}
      />

      {/* Confirmação ao fechar PIX */}
      <AlertDialog open={pixCloseConfirmOpen} onOpenChange={setPixCloseConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Pagamento pendente</AlertDialogTitle>
            <AlertDialogDescription>
              Seu pedido foi criado e está aguardando pagamento. Deseja acompanhá-lo em /conta?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPixCloseConfirmOpen(false)}>
              Continuar aqui
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                clearCart();
                setPixCloseConfirmOpen(false);
                setPixDialog((prev) => ({ ...prev, open: false }));
                navigate('/conta');
              }}
            >
              Ir para /conta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
