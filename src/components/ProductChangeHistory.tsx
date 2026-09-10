import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { History, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import {
  fieldLabel,
  formatChangeValue,
  type ProductChangeRow,
} from '@/utils/productChangeLog';

interface Props {
  productId?: string;
}

export function ProductChangeHistory({ productId }: Props) {
  const [rows, setRows] = useState<ProductChangeRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!productId) return;
    let active = true;
    setLoading(true);
    supabase
      .from('product_change_log')
      .select('*')
      .eq('product_id', productId)
      .order('created_at', { ascending: false })
      .limit(200)
      .then(({ data }) => {
        if (!active) return;
        setRows((data as ProductChangeRow[]) ?? []);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [productId]);

  if (!productId) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        O histórico aparece depois que o produto for salvo.
      </p>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        Nenhuma alteração registrada ainda. A partir de agora, toda mudança de
        código de barras, estoque e preço ficará gravada aqui.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div
          key={r.id}
          className="flex flex-wrap items-center gap-2 rounded-md border p-3 text-sm"
        >
          <History className="w-4 h-4 text-muted-foreground shrink-0" />
          <Badge variant="outline">{fieldLabel(r.field_name)}</Badge>
          {r.variation_id && <Badge variant="secondary">variação</Badge>}
          <span className="text-muted-foreground line-through">
            {formatChangeValue(r.field_name, r.old_value)}
          </span>
          <span className="text-muted-foreground">→</span>
          <span className="font-medium">
            {formatChangeValue(r.field_name, r.new_value)}
          </span>
          <span className="ml-auto text-xs text-muted-foreground">
            {new Date(r.created_at).toLocaleString('pt-BR')}
          </span>
        </div>
      ))}
    </div>
  );
}
