import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PackageX, Search, TrendingDown, AlertTriangle, Clock } from 'lucide-react';
import { PanelHeader } from '@/components/admin/PanelHeader';
import { useToast } from '@/hooks/use-toast';
import { useSalesVelocity, SalesVelocity } from '@/hooks/useSalesVelocity';

interface Product {
  id: string;
  name: string;
  category: string;
  image_url: string | null;
  stock: number;
  price: number;
}

interface RestockProps {
  onChange?: () => void;
}

export function RestockManagement({ onChange }: RestockProps) {
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [windowDays, setWindowDays] = useState(60);
  const { velocities, loading: loadingVel, reload } = useSalesVelocity({
    daysWindow: windowDays,
    warningDays: 14,
    criticalDays: 7,
  });

  const load = async () => {
    const { data, error } = await supabase
      .from('products')
      .select('id, name, category, image_url, stock, price')
      .neq('category', 'Pendente Revisão');
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else {
      setProducts(data || []);
    }
  };

  useEffect(() => { load(); }, []);

  // Produtos que precisam de reestoque: estoque ≤ 7 dias OU já esgotados COM histórico de vendas
  const restockItems = useMemo(() => {
    return products
      .map((p) => ({ product: p, velocity: velocities[p.id] as SalesVelocity | undefined }))
      .filter(({ product, velocity }) => {
        if (!velocity) return false; // só lista produtos com histórico
        return velocity.status === 'critical' || velocity.status === 'out_of_stock';
      })
      .sort((a, b) => {
        // ordena: esgotados primeiro, depois por menor dias restantes
        const ad = a.velocity!.daysRemaining ?? -1;
        const bd = b.velocity!.daysRemaining ?? -1;
        return ad - bd;
      });
  }, [products, velocities]);

  const filtered = restockItems.filter(({ product }) =>
    product.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const outOfStockCount = restockItems.filter((i) => i.velocity!.status === 'out_of_stock').length;
  const criticalCount = restockItems.filter((i) => i.velocity!.status === 'critical').length;

  const formatDays = (d: number | null) => {
    if (d === null) return '—';
    if (d < 1) return 'Menos de 1 dia';
    if (d < 2) return '1 dia';
    return `${Math.round(d)} dias`;
  };

  const handleQuickRestock = async (productId: string, currentStock: number, suggestion: number) => {
    const { error } = await supabase
      .from('products')
      .update({ stock: currentStock + suggestion })
      .eq('id', productId);
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Estoque atualizado', description: `+${suggestion} unidades adicionadas` });
      load();
      reload();
      onChange?.();
    }
  };

  return (
    <Card className="overflow-hidden border-0 shadow-sm">
      <PanelHeader
        icon={PackageX}
        title="Reestoque Inteligente"
        description={`Análise de velocidade de vendas (últimos ${windowDays} dias). Produtos com menos de 1 semana de estoque aparecem aqui.`}
        kpis={[
          { label: 'A reestocar', value: restockItems.length },
          { label: 'Esgotados', value: outOfStockCount, tone: 'destructive' as any },
          { label: 'Críticos (<7d)', value: criticalCount, tone: 'warning' },
        ]}
      />
      <CardContent className="p-4 md:p-6 space-y-4">
        <div className="flex flex-col md:flex-row gap-3 md:items-center justify-between">
          <div className="relative max-w-md flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Procurar produto..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex gap-2 items-center text-sm">
            <span className="text-muted-foreground">Janela:</span>
            {[30, 60, 90].map((d) => (
              <Button
                key={d}
                size="sm"
                variant={windowDays === d ? 'default' : 'outline'}
                onClick={() => setWindowDays(d)}
              >
                {d}d
              </Button>
            ))}
          </div>
        </div>

        {loadingVel ? (
          <div className="text-center py-12 text-muted-foreground">Analisando histórico de vendas...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <PackageX className="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p className="font-medium">Tudo sob controle!</p>
            <p className="text-sm">Nenhum produto precisa de reestoque urgente.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Imagem</TableHead>
                  <TableHead>Produto</TableHead>
                  <TableHead className="text-center">Estoque</TableHead>
                  <TableHead className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <TrendingDown className="w-3.5 h-3.5" /> Velocidade
                    </div>
                  </TableHead>
                  <TableHead className="text-center">
                    <div className="flex items-center justify-center gap-1">
                      <Clock className="w-3.5 h-3.5" /> Dura até
                    </div>
                  </TableHead>
                  <TableHead className="text-center">Status</TableHead>
                  <TableHead className="text-right">Ação rápida</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(({ product, velocity }) => {
                  const v = velocity!;
                  // Sugestão = consumo de 30 dias (arredondado)
                  const suggestion = Math.max(1, Math.ceil(v.unitsPerDay * 30));
                  return (
                    <TableRow key={product.id}>
                      <TableCell>
                        {product.image_url ? (
                          <img src={product.image_url} alt={product.name} className="w-12 h-12 object-cover rounded" />
                        ) : (
                          <div className="w-12 h-12 bg-muted rounded" />
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{product.name}</div>
                        <div className="text-xs text-muted-foreground">{product.category}</div>
                      </TableCell>
                      <TableCell className="text-center font-mono">
                        <span className={product.stock === 0 ? 'text-destructive font-bold' : ''}>
                          {product.stock}
                        </span>
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        <div className="font-semibold">{v.unitsPerDay.toFixed(2)} un/dia</div>
                        <div className="text-xs text-muted-foreground">
                          {v.totalSold} em {v.daysAnalyzed}d
                        </div>
                      </TableCell>
                      <TableCell className="text-center text-sm">
                        {v.estimatedEndDate ? (
                          <>
                            <div className="font-semibold">{formatDays(v.daysRemaining)}</div>
                            <div className="text-xs text-muted-foreground">
                              {v.estimatedEndDate.toLocaleDateString('pt-BR')}
                            </div>
                          </>
                        ) : (
                          '—'
                        )}
                      </TableCell>
                      <TableCell className="text-center">
                        {v.status === 'out_of_stock' ? (
                          <Badge variant="destructive" className="gap-1">
                            <AlertTriangle className="w-3 h-3" /> Esgotado
                          </Badge>
                        ) : (
                          <Badge className="bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30 gap-1" variant="outline">
                            <Clock className="w-3 h-3" /> Crítico
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          onClick={() => handleQuickRestock(product.id, product.stock, suggestion)}
                        >
                          +{suggestion} un
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
