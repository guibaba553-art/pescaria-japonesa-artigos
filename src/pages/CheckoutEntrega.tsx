import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Header } from '@/components/Header';
import Footer from '@/components/Footer';
import { useCart } from '@/hooks/useCart';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ArrowLeft, MapPin, Pencil, Plus, Trash2, CreditCard, Loader2, Store, Check, Truck } from 'lucide-react';
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

  const selectedAddress = typeof selectedOption === 'string' && selectedOption !== 'pickup'
    ? addresses.find((a) => a.id === selectedOption) ?? null
    : null;

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
        setShippingOptions(data.options || []);
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
      return;
    }
    calculateShipping(selectedAddress.cep);
  }, [selectedAddress?.id, calculateShipping]);

  // Frete exibido: pickup = 0, endereço = mais barato calculado, fallback = URL param
  const cheapestShipping = shippingOptions
    ? [...shippingOptions].filter((o) => o.codigo !== 'RETIRADA' && !o.codigo.startsWith('frenet-')).sort((a, b) => a.valor - b.valor)[0]
    : null;

  const displayFreteNome = selectedOption === 'pickup'
    ? 'Retirar na loja'
    : cheapestShipping
      ? cheapestShipping.nome
      : (shippingError ? 'Frete indisponível' : (freteNome || 'Frete'));
  const displayFreteValor = selectedOption === 'pickup'
    ? 0
    : cheapestShipping
      ? cheapestShipping.valor
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

  if (loading) return null;
  if (!user) {
    navigate('/auth?redirect=/checkout/entrega');
    return null;
  }

  const isEditing = editMode !== null;

  return (
    <div className="min-h-screen flex flex-col bg-muted/20">
      <Header />
      <main className="flex-1 container mx-auto py-8">
        <button
          onClick={() => navigate('/checkout')}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          Voltar
        </button>

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

                  {/* ---- ENDEREÇOS ---- */}
                  {addresses.map((a) => (
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
                    </Card>
                  ))}

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

            {/* Método de pagamento (placeholder) */}
            <div className="bg-card rounded-xl border p-4">
              <h2 className="font-semibold flex items-center gap-2 mb-3">
                <CreditCard className="w-4 h-4 text-primary" />
                Método de pagamento
              </h2>
              <p className="text-sm text-muted-foreground">Em breve</p>
            </div>
          </div>

          {/* Coluna Direita: Resumo */}
          <div className="lg:col-span-1">
            <div className="bg-card rounded-xl border p-4 space-y-3 sticky top-20">
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
              <Button className="w-full rounded-full font-bold" size="lg">
                Finalizar pedido
              </Button>
            </div>
          </div>
        </div>
      </main>
      <Footer />

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
