import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, Search, Link2, X } from 'lucide-react';

export interface ExistingProductMatch {
  id: string;
  name: string;
  sku: string | null;
  stock: number;
  price: number;
  category: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Nome do produto na NF-e — usado como busca inicial */
  nfeProductName: string;
  /** EAN/SKU vindo da NF-e (se houver) — usado como busca inicial */
  nfeProductCode?: string;
  /** Atual produto vinculado (para mostrar e permitir desvincular) */
  currentLinkedId?: string | null;
  onSelect: (product: ExistingProductMatch | null) => void;
}

/**
 * Diálogo para vincular um item de NF-e a um produto já cadastrado,
 * quando o nome/EAN não bate exatamente. Permite buscar por nome ou SKU
 * e selecionar o produto-destino — o estoque será somado ao escolhido.
 */
export function LinkExistingProductDialog({
  open,
  onOpenChange,
  nfeProductName,
  nfeProductCode,
  currentLinkedId,
  onSelect,
}: Props) {
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<ExistingProductMatch[]>([]);

  // Quando abre, pré-preenche a busca com as primeiras palavras do nome da NF
  useEffect(() => {
    if (!open) return;
    const initial = (nfeProductCode && nfeProductCode !== 'SEM GTIN')
      ? nfeProductCode
      : nfeProductName.split(/\s+/).slice(0, 3).join(' ');
    setQuery(initial);
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [open, nfeProductName, nfeProductCode]);

  // Busca com debounce
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const handle = setTimeout(async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('products')
          .select('id, name, sku, stock, price, category')
          .or(`name.ilike.%${q}%,sku.ilike.%${q}%`)
          .order('name')
          .limit(20);
        if (error) throw error;
        setResults((data || []) as ExistingProductMatch[]);
      } catch (err: any) {
        toast({
          title: 'Erro na busca',
          description: err.message,
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(handle);
  }, [query, open, toast]);

  const handleChoose = (p: ExistingProductMatch) => {
    onSelect(p);
    onOpenChange(false);
  };

  const handleUnlink = () => {
    onSelect(null);
    onOpenChange(false);
  };

  const headerHint = useMemo(() => {
    return `Da nota: "${nfeProductName}"${nfeProductCode ? ` • EAN: ${nfeProductCode}` : ''}`;
  }, [nfeProductName, nfeProductCode]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="w-5 h-5" />
            Vincular a produto existente
          </DialogTitle>
          <DialogDescription className="text-xs">
            {headerHint}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              ref={inputRef}
              placeholder="Buscar por nome ou SKU..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="pl-9"
            />
          </div>

          <ScrollArea className="h-[360px] border rounded-md">
            {loading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin mr-2" /> Buscando...
              </div>
            ) : results.length === 0 ? (
              <div className="text-center py-12 text-sm text-muted-foreground">
                {query.trim().length < 2
                  ? 'Digite ao menos 2 caracteres'
                  : 'Nenhum produto encontrado'}
              </div>
            ) : (
              <div className="divide-y">
                {results.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleChoose(p)}
                    className={`w-full text-left p-3 hover:bg-muted/50 transition-colors ${
                      currentLinkedId === p.id ? 'bg-primary/10' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="font-medium truncate">{p.name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5 flex flex-wrap gap-x-3">
                          <span>SKU: <code>{p.sku || '—'}</code></span>
                          <span>Estoque: <strong>{p.stock}</strong></span>
                          <span>R$ {Number(p.price).toFixed(2)}</span>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {p.category}
                      </Badge>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          {currentLinkedId ? (
            <Button variant="outline" onClick={handleUnlink}>
              <X className="w-4 h-4 mr-1" />
              Desvincular
            </Button>
          ) : (
            <span />
          )}
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
