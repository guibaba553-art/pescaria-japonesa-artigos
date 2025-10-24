import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Truck, Store } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { formatCEP, sanitizeNumericInput } from '@/utils/validation';
import { SHIPPING_CONFIG } from '@/config/constants';

interface ShippingOption {
  codigo: string;
  nome: string;
  valor: number;
  prazoEntrega: number;
}

interface ShippingCalculatorProps {
  onSelectShipping?: (option: ShippingOption) => void;
}

export function ShippingCalculator({ onSelectShipping }: ShippingCalculatorProps) {
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
    prazoEntrega: 0
  };

  const handleCepChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const numeric = sanitizeNumericInput(e.target.value);
    // Limitar a 8 dígitos
    if (numeric.length <= 8) {
      setCep(numeric);
    }
  };

  const calculateShipping = async () => {
    // Validação mais rigorosa do CEP
    if (!cep || cep.length !== 8) {
      toast({
        title: 'CEP inválido',
        description: 'Por favor, informe um CEP válido com 8 dígitos',
        variant: 'destructive'
      });
      return;
    }

    // Validar se CEP contém apenas números
    if (!/^\d{8}$/.test(cep)) {
      toast({
        title: 'CEP inválido',
        description: 'O CEP deve conter apenas números',
        variant: 'destructive'
      });
      return;
    }

    setLoading(true);
    setOptions([]);
    setSelectedOption(null); // Resetar seleção ao calcular novo frete

    try {
      const { data, error } = await supabase.functions.invoke('calculate-shipping', {
        body: {
          cepDestino: cep,
          peso: SHIPPING_CONFIG.DEFAULT_WEIGHT,
          formato: SHIPPING_CONFIG.DEFAULT_FORMAT,
          comprimento: SHIPPING_CONFIG.DEFAULT_DIMENSIONS.length,
          altura: SHIPPING_CONFIG.DEFAULT_DIMENSIONS.height,
          largura: SHIPPING_CONFIG.DEFAULT_DIMENSIONS.width
        }
      });

      if (error) throw error;

      if (data.success) {
        setOptions(data.options);
        toast({
          title: 'Frete calculado!',
          description: `${data.options.length} opções de envio disponíveis`
        });
      } else {
        throw new Error(data.error || 'Erro ao calcular frete');
      }
    } catch (error: any) {
      console.error('Erro ao calcular frete:', error);
      toast({
        title: 'Erro ao calcular frete',
        description: error.message || 'Tente novamente mais tarde',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleSelectOption = (option: ShippingOption) => {
    setSelectedOption(option.codigo);
    onSelectShipping?.(option);
  };

  return (
    <div className="space-y-4">
      {/* Opção de Retirada na Loja - sempre visível */}
      <div className="space-y-2">
        <Label>Opções de Entrega</Label>
        <Card
          className={`p-3 cursor-pointer transition-all ${
            selectedOption === 'RETIRADA' 
              ? 'border-primary bg-primary/5 border-2' 
              : 'hover:bg-accent'
          }`}
          onClick={() => handleSelectOption(pickupOption)}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Store className="h-5 w-5 text-primary" />
              <div>
                <p className="font-medium">Retirar na Loja</p>
                <p className="text-sm text-muted-foreground">
                  Disponível imediatamente - Sinop/MT
                </p>
              </div>
            </div>
            <p className="font-bold text-lg text-green-600">
              GRÁTIS
            </p>
          </div>
        </Card>
      </div>

      {/* Cálculo de Frete para Entrega */}
      <div className="space-y-2">
        <Label htmlFor="cep">Ou calcule o frete para entrega</Label>
        <div className="flex gap-2">
          <Input
            id="cep"
            placeholder="00000-000"
            value={formatCEP(cep)}
            onChange={handleCepChange}
            maxLength={9}
            className="flex-1"
          />
          <Button 
            onClick={calculateShipping}
            disabled={loading}
          >
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              'Calcular'
            )}
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
                  R$ {option.valor.toFixed(2)}
                </p>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
