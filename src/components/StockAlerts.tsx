import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { AlertTriangle, PackageX, Package2, Loader2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface AlertProduct {
  id: string;
  name: string;
  stock: number;
  min_stock: number;
  category: string;
  image_url: string | null;
}

export function StockAlerts() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [products, setProducts] = useState<AlertProduct[]>([]);

  useEffect(() => {
    (async () => {
      // min_stock é campo sensível: usa RPC para admin/funcionário
      const { data } = await supabase.rpc('get_products_admin');
      if (data) {
        const filtered = (data as any[])
          .filter((p) => p.category !== 'Pendente Revisão')
          .filter((p) => p.stock === 0 || (p.min_stock > 0 && p.stock <= p.min_stock))
          .sort((a, b) => a.stock - b.stock)
          .map((p) => ({
            id: p.id,
            name: p.name,
            stock: p.stock,
            min_stock: p.min_stock,
            category: p.category,
            image_url: p.image_url,
          })) as AlertProduct[];
        setProducts(filtered);
      }
      setLoading(false);
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const outOfStock = products.filter((p) => p.stock === 0);
  const lowStock = products.filter((p) => p.stock > 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-destructive font-bold">Esgotados</span>
              <PackageX className="w-4 h-4 text-destructive" />
            </div>
            <div className="text-2xl font-display font-black text-destructive mt-1">{outOfStock.length}</div>
          </CardContent>
        </Card>
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-wider text-amber-600 dark:text-amber-400 font-bold">Estoque baixo</span>
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            </div>
            <div className="text-2xl font-display font-black text-amber-600 dark:text-amber-400 mt-1">{lowStock.length}</div>
          </CardContent>
        </Card>
      </div>

      {products.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Package2 className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">Nenhum produto com alerta de estoque 🎉</p>
            <p className="text-xs mt-1">Configure o estoque mínimo nos produtos para receber alertas.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {products.map((p) => {
            const isOut = p.stock === 0;
            return (
              <Card
                key={p.id}
                className={`cursor-pointer hover:border-primary/40 transition-colors ${isOut ? 'border-destructive/40' : 'border-amber-500/40'}`}
                onClick={() => navigate(`/admin/catalogo`)}
              >
                <CardContent className="p-3 flex items-center gap-3">
                  {p.image_url ? (
                    <img src={p.image_url} alt={p.name} className="w-12 h-12 rounded object-cover bg-muted" />
                  ) : (
                    <div className="w-12 h-12 rounded bg-muted flex items-center justify-center">
                      <Package2 className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.category}</div>
                  </div>
                  <div className="text-right">
                    {isOut ? (
                      <Badge variant="destructive" className="text-[10px]">ESGOTADO</Badge>
                    ) : (
                      <Badge className="text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 hover:bg-amber-500/20">
                        {p.stock} / mín {p.min_stock}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
