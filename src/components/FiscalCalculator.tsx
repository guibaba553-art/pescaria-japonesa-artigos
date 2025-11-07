import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Calculator, Loader2, TrendingUp, DollarSign } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

interface Product {
  id: string;
  name: string;
  price: number;
  cost?: number;
}

interface FiscalCalculatorProps {
  products: Product[];
}

interface CalculationResult {
  products: Array<{
    id: string;
    name: string;
    cost: number;
    expenses: number;
    taxes: {
      federal: number;
      state: number;
      total: number;
    };
    margins: {
      gross: number;
      net: number;
    };
    suggested_price: number;
    breakdown: string;
  }>;
  summary: {
    total_cost: number;
    total_taxes: number;
    total_revenue: number;
    net_profit: number;
  };
}

export function FiscalCalculator({ products }: FiscalCalculatorProps) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [regimeTributario, setRegimeTributario] = useState("simples_nacional");
  const [result, setResult] = useState<CalculationResult | null>(null);

  const handleCalculate = async () => {
    if (products.length === 0) {
      toast({
        title: "Nenhum produto",
        description: "Adicione produtos para calcular",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);

    try {
      const { data, error } = await supabase.functions.invoke('calculate-fiscal', {
        body: {
          products: products.map(p => ({
            id: p.id,
            name: p.name,
            price: p.price,
            cost: p.cost || p.price * 0.6, // Estimar custo se não fornecido
          })),
          tipo: regimeTributario,
        },
      });

      if (error) throw error;

      setResult(data);

      toast({
        title: "Cálculo concluído!",
        description: `${data.products.length} produtos calculados`,
      });
    } catch (error: any) {
      console.error("Erro ao calcular:", error);
      toast({
        title: "Erro no cálculo",
        description: error.message || "Erro ao calcular impostos",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Calculator className="w-5 h-5" />
            Calculadora Fiscal com IA
          </CardTitle>
          <CardDescription>
            Calcule impostos, despesas e margem de lucro automaticamente
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Regime Tributário</Label>
            <Select value={regimeTributario} onValueChange={setRegimeTributario}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="simples_nacional">Simples Nacional</SelectItem>
                <SelectItem value="lucro_presumido">Lucro Presumido</SelectItem>
                <SelectItem value="lucro_real">Lucro Real</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button
            onClick={handleCalculate}
            disabled={loading || products.length === 0}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Calculando...
              </>
            ) : (
              <>
                <Calculator className="w-4 h-4 mr-2" />
                Calcular Impostos e Margens
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Resultado dos Cálculos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Resumo Geral */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Custo Total</p>
                <p className="text-xl font-bold">
                  R$ {result.summary.total_cost.toFixed(2)}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Impostos</p>
                <p className="text-xl font-bold text-red-600">
                  R$ {result.summary.total_taxes.toFixed(2)}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Receita</p>
                <p className="text-xl font-bold text-green-600">
                  R$ {result.summary.total_revenue.toFixed(2)}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-sm text-muted-foreground">Lucro Líquido</p>
                <p className="text-xl font-bold text-primary">
                  R$ {result.summary.net_profit.toFixed(2)}
                </p>
              </div>
            </div>

            <Separator />

            {/* Detalhes por Produto */}
            <div className="space-y-3">
              <h4 className="font-semibold">Detalhes por Produto</h4>
              {result.products.map((product) => (
                <Card key={product.id}>
                  <CardContent className="pt-4 space-y-3">
                    <div className="flex items-start justify-between">
                      <div>
                        <h5 className="font-semibold">{product.name}</h5>
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {product.breakdown}
                        </p>
                      </div>
                      <Badge variant="outline">
                        {product.margins.net.toFixed(1)}% lucro
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      <div>
                        <p className="text-muted-foreground">Custo</p>
                        <p className="font-medium">R$ {product.cost.toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Impostos</p>
                        <p className="font-medium text-red-600">
                          R$ {product.taxes.total.toFixed(2)}
                        </p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Margem Bruta</p>
                        <p className="font-medium">{product.margins.gross.toFixed(1)}%</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Preço Sugerido</p>
                        <p className="font-medium text-green-600">
                          R$ {product.suggested_price.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
