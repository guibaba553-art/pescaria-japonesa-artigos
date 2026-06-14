import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Truck, Store } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { formatCEP, sanitizeNumericInput } from '@/utils/validation';
import { SHIPPING_CONFIG } from '@/config/constants';

import { packItems } from '@/utils/packShipment';

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
  price?: number;
}

interface ShippingCalculatorProps {
  onSelectShipping?: (option: ShippingOption) => void;
  products?: ShippingProduct[];
}

export function ShippingCalculator({ onSelectShipping, products }: ShippingCalculatorProps) {
  const [cep, setCep] = useState('');
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<ShippingOption[]>([]);
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const { toast } = useToast();

  // Opção de retirada na loja
  const pickupOption: ShippingOption = {
    codigo: 'RETIRADA',
    nome: 'Retirar na Loja',
    valor: 0,
    prazoEntrega: 0,
  };

  const handleCepChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const numeric = sanitizeNumericInput(e.target.value);
    if (numeric.length <= 8) setCep(numeric);
  };

  // Cache de dimensões/peso reais carregados do banco (produtos e variações)
  const [productDims, setProductDims] = useState<
    Record<string, { weight_grams: number | null; length_cm: number | null; width_cm: number | null; height_cm: number | null }>
  >({});
  const [variationDims, setVariationDims] = useState<
    Record<string, { weight_grams: number | null; length_cm: number | null; width_cm: number | null; height_cm: number | null }>
  >({});

  // Carrega peso e dimensões dos produtos e variações do carrinho
  useEffect(() => {
    const productIds = (products || []).map((p) => p.id).filter((x): x is string => !!x);
    const variationIds = (products || []).map((p) => p.variationId).filter((x): x is string => !!x);
    const missingProducts = productIds.filter((id) => !(id in productDims));
    const missingVariations = variationIds.filter((id) => !(id in variationDims));

    if (missingProducts.length === 0 && missingVariations.length === 0) return;

    (async () => {
      if (missingProducts.length > 0) {
        const { data } = await supabase
          .from('products')
          .select('id, weight_grams, length_cm, width_cm, height_cm')
          .in('id', missingProducts);
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
      }
      if (missingVariations.length > 0) {
        const { data } = await supabase
          .from('product_variations')
          .select('id, weight_grams, length_cm, width_cm, height_cm')
          .in('id', missingVariations);
        if (data) {
          setVariationDims((prev) => {
            const next = { ...prev };
            data.forEach((v: any) => {
              next[v.id] = {
                weight_grams: v.weight_grams,
                length_cm: v.length_cm ? Number(v.length_cm) : null,
                width_cm: v.width_cm ? Number(v.width_cm) : null,
                height_cm: v.height_cm ? Number(v.height_cm) : null,
              };
            });
            return next;
          });
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [products]);

  // Detecta itens sem medidas/peso cadastrados — frete não pode ser calculado
  const itemsMissingDims = (): { id: string; quantity: number }[] => {
    if (!products || products.length === 0) return [];
    return products
      .map((p) => {
        const productD = (p.id && productDims[p.id]) || null;
        const variationD = (p.variationId && variationDims[p.variationId]) || null;
        const w = variationD?.weight_grams ?? productD?.weight_grams ?? null;
        const l = variationD?.length_cm ?? productD?.length_cm ?? null;
        const wd = variationD?.width_cm ?? productD?.width_cm ?? null;
        const h = variationD?.height_cm ?? productD?.height_cm ?? null;
        const missing = !w || !l || !wd || !h;
        return missing ? { id: p.variationId || p.id || '', quantity: p.quantity } : null;
      })
      .filter((x): x is { id: string; quantity: number } => !!x);
  };

  // Aguarda o cache de dimensões carregar antes de decidir
  const dimsReady = (() => {
    if (!products || products.length === 0) return true;
    return products.every((p) => {
      const pidOk = !p.id || p.id in productDims;
      const vidOk = !p.variationId || p.variationId in variationDims;
      return pidOk && vidOk;
    });
  })();

  const hasItemsWithoutDims = dimsReady && itemsMissingDims().length > 0;

  const buildMeProducts = () => {
    if (!products || products.length === 0) return undefined;
    const shipmentItems = products.map((p, i) => {
      const productD = (p.id && productDims[p.id]) || null;
      const variationD = (p.variationId && variationDims[p.variationId]) || null;
      // Variação tem prioridade quando tem valor; senão cai pro produto
      return {
        id: p.variationId || p.id || String(i + 1),
        quantity: p.quantity,
        width_cm: variationD?.width_cm ?? productD?.width_cm ?? null,
        height_cm: variationD?.height_cm ?? productD?.height_cm ?? null,
        length_cm: variationD?.length_cm ?? productD?.length_cm ?? null,
        weight_grams: variationD?.weight_grams ?? productD?.weight_grams ?? null,
      };
    });
    // Política: enviar SEM seguro declarado para reduzir o frete ao mínimo.
    // A NF emitida ainda carrega o valor real (exigência fiscal); apenas o valor
    // declarado à transportadora vai zerado, abrindo mão da cobertura adicional.
    return packItems(shipmentItems, 0);
  };

  const fetchShippingForCep = async (cepDestino: string): Promise<ShippingOption[] | null> => {
    if (hasItemsWithoutDims) {
      toast({
        title: 'Frete indisponível',
        description: 'Há itens no carrinho sem peso/medidas cadastradas. Escolha "Retirar na Loja" ou contate o vendedor.',
        variant: 'destructive',
      });
      return null;
    }
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
    }
    setLoading(false);
  };

  // Remove a opção "Retirar na Loja" e qualquer transportadora que a loja não consiga
  // gerar etiqueta (hoje só compramos etiqueta pelo Melhor Envio — opções "frenet-..."
  // não são oferecidas ao cliente para evitar pedido sem como despachar).
  const filterDeliveryOnly = (opts: ShippingOption[]) =>
    opts.filter(
      (o) =>
        o.codigo !== 'RETIRADA' &&
        !o.codigo.startsWith('frenet-') &&
        !/retir/i.test(o.nome) &&
        !/retir/i.test(o.servico || '')
    );

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

  return (
    <div className="space-y-4">

      {/* Opção de Retirada na Loja */}
      <div className="space-y-2">
        <Label>Opções de Entrega</Label>
        <Card
          className={`p-3 cursor-pointer transition-all ${
            selectedOption === 'RETIRADA' ? 'border-primary bg-primary/5 border-2' : 'hover:border-accent'
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
        {hasItemsWithoutDims && (
          <>
            <p className="text-sm text-muted-foreground">
              Este produto está disponível apenas para <strong>Retirada na Loja</strong>.
            </p>
            <Separator />
          </>
        )}
      </div>

      {/* Cálculo de Frete por CEP avulso */}
      {!hasItemsWithoutDims && (
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
      )}

      {options.length > 0 && (() => {
        const delivery = filterDeliveryOnly(options);
        if (delivery.length === 0) return null;
        const { cheapestCode, fastestCode } = getHighlights(delivery);
        return (
          <div className="space-y-2">
            {sortByCheapestThenFastest(delivery).map((option) => {
              const isCheapest = option.codigo === cheapestCode;
              const isFastest = option.codigo === fastestCode && !isCheapest;
              return (
                <Card
                  key={option.codigo}
                  className={`p-3 cursor-pointer transition-all ${
                    selectedOption === option.codigo
                      ? 'border-primary bg-primary/5 border-2'
                      : 'hover:border-accent'
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
                          Entrega em {option.prazoEntrega} dias úteis
                        </p>
                      </div>
                    </div>
                    <p className="font-bold text-lg">
                      {option.valor === 0 ? 'GRÁTIS' : `R$ ${option.valor.toFixed(2).replace('.', ',')}`}
                    </p>
                  </div>
                </Card>
              );
            })}
          </div>
        );
      })()}

    </div>
  );
}
