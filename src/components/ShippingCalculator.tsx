import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Truck, Store, Plus, MapPin, Check } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { formatCEP, sanitizeNumericInput } from '@/utils/validation';
import { SHIPPING_CONFIG } from '@/config/constants';
import { useAuth } from '@/hooks/useAuth';
import { AddressFormDialog } from '@/components/AddressFormDialog';
import type { UserAddress } from '@/components/MyAddresses';

interface ShippingOption {
  codigo: string;
  nome: string;
  valor: number;
  prazoEntrega: number;
  company?: string | null;
  servico?: string | null;
}

interface ShippingProduct {
  id?: string;
  variationId?: string;
  quantity: number;
}

interface ShippingCalculatorProps {
  onSelectShipping?: (option: ShippingOption) => void;
  products?: ShippingProduct[];
}

export function ShippingCalculator({ onSelectShipping, products }: ShippingCalculatorProps) {
  const { user } = useAuth();
  const [cep, setCep] = useState('');
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<ShippingOption[]>([]);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const { toast } = useToast();

  // Endereços salvos
  const [savedAddresses, setSavedAddresses] = useState<UserAddress[]>([]);
  const [addressOptions, setAddressOptions] = useState<Record<string, ShippingOption[]>>({});
  const [loadingAddressId, setLoadingAddressId] = useState<string | null>(null);
  const [expandedAddressId, setExpandedAddressId] = useState<string | null>(null);
  const [newAddressOpen, setNewAddressOpen] = useState(false);

  // Opção de retirada na loja
  const pickupOption: ShippingOption = {
    codigo: 'RETIRADA',
    nome: 'Retirar na Loja',
    valor: 0,
    prazoEntrega: 0,
  };

  const loadSavedAddresses = async () => {
    if (!user) {
      setSavedAddresses([]);
      return;
    }
    const { data } = await supabase
      .from('user_addresses')
      .select('*')
      .eq('user_id', user.id)
      .order('is_default', { ascending: false })
      .order('created_at', { ascending: false });
    setSavedAddresses((data as UserAddress[]) || []);
  };

  useEffect(() => {
    loadSavedAddresses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const handleCepChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const numeric = sanitizeNumericInput(e.target.value);
    if (numeric.length <= 8) setCep(numeric);
  };

  // Cache de dimensões/peso reais carregados do banco
  const [productDims, setProductDims] = useState<
    Record<string, { weight_grams: number | null; length_cm: number | null; width_cm: number | null; height_cm: number | null }>
  >({});

  // Carrega peso e dimensões dos produtos do carrinho do banco
  useEffect(() => {
    const ids = (products || []).map((p) => p.id).filter((x): x is string => !!x);
    const missing = ids.filter((id) => !(id in productDims));
    if (missing.length === 0) return;
    (async () => {
      const { data } = await supabase
        .from('products')
        .select('id, weight_grams, length_cm, width_cm, height_cm')
        .in('id', missing);
      if (data) {
        setProductDims((prev) => {
          const next = { ...prev };
          data.forEach((p: any) => {
            next[p.id] = {
              weight_grams: p.weight_grams,
              length_cm: p.length_cm ? Number(p.length_cm) : null,
              width_cm: p.width_cm ? Number(p.width_cm) : null,
              height_cm: p.height_cm ? Number(p.height_cm) : null,
            };
          });
          return next;
        });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);

  const buildMeProducts = () =>
    products && products.length > 0
      ? products.map((p, i) => {
          const dims = (p.id && productDims[p.id]) || null;
          // Mínimos exigidos pelo Melhor Envio: width>=11, height>=2, length>=11, weight>=0.01kg
          const width = Math.max(11, dims?.width_cm ?? SHIPPING_CONFIG.DEFAULT_DIMENSIONS.width);
          const height = Math.max(2, dims?.height_cm ?? SHIPPING_CONFIG.DEFAULT_DIMENSIONS.height);
          const length = Math.max(11, dims?.length_cm ?? SHIPPING_CONFIG.DEFAULT_DIMENSIONS.length);
          const weightKg = Math.max(
            0.01,
            (dims?.weight_grams ?? SHIPPING_CONFIG.DEFAULT_WEIGHT) / 1000
          );
          return {
            id: p.id || String(i + 1),
            width,
            height,
            length,
            weight: weightKg,
            insurance_value: 0,
            quantity: p.quantity,
          };
        })
      : undefined;

  const fetchShippingForCep = async (cepDestino: string): Promise<ShippingOption[] | null> => {
    if (!/^\d{8}$/.test(cepDestino)) {
      toast({ title: 'CEP inválido', description: 'CEP deve conter 8 dígitos', variant: 'destructive' });
      return null;
    }
    const meProducts = buildMeProducts();
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
      toast({
        title: 'Erro ao calcular frete',
        description: data?.error || error?.message || 'Tente novamente',
        variant: 'destructive',
      });
      return null;
    }
    return data.options as ShippingOption[];
  };

  const calculateShipping = async () => {
    if (!cep || cep.length !== 8) {
      toast({ title: 'CEP inválido', description: 'Informe um CEP válido com 8 dígitos', variant: 'destructive' });
      return;
    }
    setLoading(true);
    setOptions([]);
    setSelectedOption(null);
    const opts = await fetchShippingForCep(cep);
    if (opts) {
      setOptions(opts);
      toast({ title: 'Frete calculado!', description: `${opts.length} opções disponíveis` });
    }
    setLoading(false);
  };

  const handleCalculateForAddress = async (addr: UserAddress, expand = true) => {
    setLoadingAddressId(addr.id);
    if (expand) setExpandedAddressId(addr.id);
    const opts = await fetchShippingForCep(addr.cep);
    if (opts) {
      setAddressOptions((prev) => ({ ...prev, [addr.id]: opts }));
    }
    setLoadingAddressId(null);
    return opts;
  };

  // Carrega automaticamente o frete mais barato de cada endereço (sem expandir)
  useEffect(() => {
    if (!user || savedAddresses.length === 0) return;
    savedAddresses.forEach((a) => {
      if (!addressOptions[a.id] && loadingAddressId !== a.id) {
        handleCalculateForAddress(a, false);
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedAddresses, user?.id]);

  // Remove a opção "Retirar na Loja" das listas por endereço (ela já aparece embaixo)
  const filterDeliveryOnly = (opts: ShippingOption[]) =>
    opts.filter(
      (o) =>
        o.codigo !== 'RETIRADA' &&
        !/retir/i.test(o.nome) &&
        !/retir/i.test(o.servico || '')
    );

  const cheapestFor = (addrId: string): ShippingOption | null => {
    const opts = addressOptions[addrId];
    if (!opts || opts.length === 0) return null;
    const delivery = filterDeliveryOnly(opts);
    if (delivery.length === 0) return null;
    return [...delivery].sort((a, b) => a.valor - b.valor)[0];
  };

  // Identifica o mais barato e o mais rápido em uma lista de opções
  const getHighlights = (opts: ShippingOption[]) => {
    if (!opts || opts.length === 0) return { cheapestCode: null, fastestCode: null };
    const cheapest = [...opts].sort((a, b) => a.valor - b.valor)[0];
    const fastest = [...opts].sort((a, b) => a.prazoEntrega - b.prazoEntrega)[0];
    return {
      cheapestCode: cheapest?.codigo ?? null,
      fastestCode: fastest?.codigo ?? null,
    };
  };

  // Ordena: mais barato primeiro, depois mais rápido, depois o resto por preço
  const sortByCheapestThenFastest = (opts: ShippingOption[]) => {
    const { cheapestCode, fastestCode } = getHighlights(opts);
    return [...opts].sort((a, b) => {
      if (a.codigo === cheapestCode) return -1;
      if (b.codigo === cheapestCode) return 1;
      if (a.codigo === fastestCode) return -1;
      if (b.codigo === fastestCode) return 1;
      return a.valor - b.valor;
    });
  };

  const handleSelectOption = (option: ShippingOption) => {
    setSelectedOption(option.codigo);
    onSelectShipping?.(option);
  };

  const handleSelectAddressOption = (addr: UserAddress, option: ShippingOption) => {
    const tagged: ShippingOption = {
      ...option,
      // Identificador único para diferenciar entre endereços
      codigo: `${addr.id}::${option.codigo}`,
      nome: `${option.nome} — ${addr.label}`,
    };
    setSelectedOption(tagged.codigo);
    onSelectShipping?.(tagged);
  };

  return (
    <div className="space-y-4">
      {/* Endereços salvos do usuário (acima de Retirar na Loja) */}
      {user && savedAddresses.length > 0 && (
        <div className="space-y-2">
          <Label className="flex items-center gap-1.5">
            <MapPin className="w-4 h-4" /> Meus endereços
          </Label>
          <div className="space-y-2">
            {savedAddresses.map((a) => {
              const opts = addressOptions[a.id];
              const isLoadingThis = loadingAddressId === a.id;
              const isExpanded = expandedAddressId === a.id;
              const cheapest = cheapestFor(a.id);
              const tagFor = (codigo: string) => `${a.id}::${codigo}`;
              const cardSelected = !!cheapest && selectedOption === tagFor(cheapest.codigo);
              const anySelectedHere = !!opts?.some((o) => selectedOption === tagFor(o.codigo));

              return (
                <Card
                  key={a.id}
                  className={`overflow-hidden transition-all ${
                    anySelectedHere
                      ? 'border-primary bg-primary/5 border-2'
                      : 'hover:bg-accent border'
                  }`}
                >
                  {/* Cabeçalho do endereço — clique = expande + seleciona o mais barato */}
                  <button
                    type="button"
                    onClick={() => {
                      setExpandedAddressId((prev) => (prev === a.id ? null : a.id));
                      if (cheapest && !anySelectedHere) {
                        handleSelectAddressOption(a, cheapest);
                      }
                    }}
                    className="w-full text-left p-3 cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-start gap-2 min-w-0">
                        <MapPin className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium">{a.label}</p>
                            {a.is_default && (
                              <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                                Padrão
                              </span>
                            )}
                          </div>
                          <p className="text-sm text-muted-foreground truncate">
                            {a.street}, {a.number} · {a.city}/{a.state}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        {isLoadingThis && !opts ? (
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        ) : cheapest ? (
                          <>
                            <p className="font-bold text-lg text-foreground">
                              R$ {cheapest.valor.toFixed(2).replace('.', ',')}
                            </p>
                            <p className="text-[11px] text-muted-foreground">
                              {cheapest.nome} · {cheapest.prazoEntrega}d
                            </p>
                          </>
                        ) : opts ? (
                          <span className="text-xs text-muted-foreground">
                            Sem entrega disponível
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Toque para calcular
                          </span>
                        )}
                      </div>
                    </div>
                  </button>

                  {/* Lista expandida com as outras opções */}
                  {isExpanded && opts && (
                    <div className="border-t border-border bg-background/60 p-3 space-y-1.5">
                      <p className="text-[11px] uppercase font-bold tracking-wider text-muted-foreground mb-1">
                        Opções de entrega
                      </p>
                      {filterDeliveryOnly(opts).length === 0 ? (
                        <p className="text-sm text-muted-foreground py-2 text-center">
                          Nenhuma transportadora atende esse CEP no momento.
                        </p>
                      ) : (
                        (() => {
                          const delivery = filterDeliveryOnly(opts);
                          const { cheapestCode, fastestCode } = getHighlights(delivery);
                          return sortByCheapestThenFastest(delivery).map((option) => {
                            const tag = tagFor(option.codigo);
                            const sel = selectedOption === tag;
                            const isCheapest = option.codigo === cheapestCode;
                            const isFastest = option.codigo === fastestCode && !isCheapest;
                            return (
                              <button
                                key={tag}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleSelectAddressOption(a, option);
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
                        })()
                      )}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCalculateForAddress(a, false);
                        }}
                        className="w-full text-xs text-muted-foreground hover:text-foreground pt-1"
                      >
                        ↻ Recalcular fretes
                      </button>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Opção de Retirada na Loja */}
      <div className="space-y-2">
        {!(user && savedAddresses.length > 0) && <Label>Opções de Entrega</Label>}
        <Card
          className={`p-3 cursor-pointer transition-all ${
            selectedOption === 'RETIRADA' ? 'border-primary bg-primary/5 border-2' : 'hover:bg-accent'
          }`}
          onClick={() => handleSelectOption(pickupOption)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Store className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium">Retirar na Loja</p>
                <p className="text-sm text-muted-foreground">Disponível imediatamente - Sinop/MT</p>
              </div>
            </div>
            <p className="font-bold text-lg text-green-600">GRÁTIS</p>
          </div>
        </Card>
      </div>

      {/* Cadastrar novo endereço (abaixo de Retirar na Loja) */}
      {user && (
        <Button
          type="button"
          variant="outline"
          className="w-full rounded-full"
          onClick={() => setNewAddressOpen(true)}
        >
          <Plus className="w-4 h-4 mr-1.5" />
          Cadastrar endereço
        </Button>
      )}

      {/* Cálculo de Frete por CEP avulso */}
      <div className="space-y-2">
        <Label htmlFor="cep">Ou calcule o frete para outro CEP</Label>
        <div className="flex gap-2">
          <Input
            id="cep"
            placeholder="00000-000"
            value={formatCEP(cep)}
            onChange={handleCepChange}
            maxLength={9}
            className="flex-1"
          />
          <Button onClick={calculateShipping} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Calcular'}
          </Button>
        </div>
      </div>

      {options.length > 0 && (() => {
        const delivery = filterDeliveryOnly(options);
        const pickup = options.filter((o) => !delivery.includes(o));
        const { cheapestCode, fastestCode } = getHighlights(delivery);
        const sorted = [...sortByCheapestThenFastest(delivery), ...pickup];
        return (
          <div className="space-y-2">
            {sorted.map((option) => {
              const isCheapest = option.codigo === cheapestCode;
              const isFastest = option.codigo === fastestCode && !isCheapest;
              return (
                <Card
                  key={option.codigo}
                  className={`p-3 cursor-pointer transition-all ${
                    selectedOption === option.codigo
                      ? 'border-primary bg-primary/5 border-2'
                      : 'hover:bg-accent'
                  }`}
                  onClick={() => handleSelectOption(option)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Truck className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-medium">{option.nome}</p>
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
                        <p className="text-sm text-muted-foreground">
                          {option.codigo === 'RETIRADA'
                            ? 'Disponível em até 24h após pagamento'
                            : `Entrega em ${option.prazoEntrega} dias úteis`}
                        </p>
                      </div>
                    </div>
                    <p className="font-bold text-lg">
                      {option.valor === 0 ? 'GRÁTIS' : `R$ ${option.valor.toFixed(2)}`}
                    </p>
                  </div>
                </Card>
              );
            })}
          </div>
        );
      })()}

      <AddressFormDialog
        open={newAddressOpen}
        onOpenChange={setNewAddressOpen}
        onSaved={async (addr) => {
          await loadSavedAddresses();
          // Calcula frete automaticamente para o novo endereço
          handleCalculateForAddress(addr);
        }}
      />
    </div>
  );
}
