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

  const buildMeProducts = () =>
    products && products.length > 0
      ? products.map((p, i) => ({
          id: p.id || String(i + 1),
          width: SHIPPING_CONFIG.DEFAULT_DIMENSIONS.width,
          height: SHIPPING_CONFIG.DEFAULT_DIMENSIONS.height,
          length: SHIPPING_CONFIG.DEFAULT_DIMENSIONS.length,
          weight: SHIPPING_CONFIG.DEFAULT_WEIGHT / 1000,
          insurance_value: 0,
          quantity: p.quantity,
        }))
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

  const handleCalculateForAddress = async (addr: UserAddress) => {
    setLoadingAddressId(addr.id);
    setExpandedAddressId(addr.id);
    const opts = await fetchShippingForCep(addr.cep);
    if (opts) {
      setAddressOptions((prev) => ({ ...prev, [addr.id]: opts }));
    }
    setLoadingAddressId(null);
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
              return (
                <Card key={a.id} className="p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-0.5">
                        <span className="font-semibold text-sm">{a.label}</span>
                        {a.is_default && (
                          <span className="text-[10px] font-bold uppercase tracking-wider text-primary">
                            Padrão
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground truncate">
                        {a.street}, {a.number}
                        {a.complement ? ` — ${a.complement}` : ''} · {a.neighborhood}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {a.city}/{a.state} · CEP {formatCEP(a.cep)}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant={isExpanded ? 'secondary' : 'outline'}
                      onClick={() => handleCalculateForAddress(a)}
                      disabled={isLoadingThis}
                    >
                      {isLoadingThis ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : opts ? (
                        'Recalcular'
                      ) : (
                        'Calcular frete'
                      )}
                    </Button>
                  </div>

                  {isExpanded && opts && opts.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {opts.map((option) => {
                        const tag = `${a.id}::${option.codigo}`;
                        const sel = selectedOption === tag;
                        return (
                          <button
                            key={tag}
                            type="button"
                            onClick={() => handleSelectAddressOption(a, option)}
                            className={`w-full text-left rounded-lg border p-2.5 transition-all flex items-center justify-between gap-2 ${
                              sel
                                ? 'border-primary bg-primary/5 ring-2 ring-primary/30'
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
                                <p className="text-sm font-medium truncate">{option.nome}</p>
                                <p className="text-xs text-muted-foreground">
                                  Entrega em {option.prazoEntrega} dias úteis
                                </p>
                              </div>
                            </div>
                            <p className="font-bold text-sm shrink-0">
                              {option.valor === 0 ? 'GRÁTIS' : `R$ ${option.valor.toFixed(2)}`}
                            </p>
                          </button>
                        );
                      })}
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

      {options.length > 0 && (
        <div className="space-y-2">
          {options.map((option) => (
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
                    <p className="font-medium">{option.nome}</p>
                    <p className="text-sm text-muted-foreground">
                      Entrega em {option.prazoEntrega} dias úteis
                    </p>
                  </div>
                </div>
                <p className="font-bold text-lg">
                  {option.valor === 0 ? 'GRÁTIS' : `R$ ${option.valor.toFixed(2)}`}
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}

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
