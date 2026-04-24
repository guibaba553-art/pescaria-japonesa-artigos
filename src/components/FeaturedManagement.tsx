import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Star, Search } from 'lucide-react';
import { PanelHeader } from '@/components/admin/PanelHeader';
import { Table, TableBody, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { FeaturedProductRow } from '@/components/FeaturedProductRow';

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  image_url: string | null;
  images: string[];
  stock: number;
  rating: number;
  featured: boolean;
  on_sale: boolean;
  sale_price?: number;
  sale_ends_at?: string;
  minimum_quantity?: number;
  sku?: string | null;
}

export function FeaturedManagement() {
  const { toast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  const load = async () => {
    const { data, error } = await supabase.from('products').select('*').order('name', { ascending: true });
    if (error) toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    else setProducts(data || []);
  };

  useEffect(() => { load(); }, []);

  const visible = products.filter((p) => p.category !== 'Pendente Revisão');
  const featuredCount = visible.filter((p) => p.featured).length;
  const onSaleCount = visible.filter((p) => p.on_sale).length;
  const filtered = visible.filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase()));

  return (
    <Card className="overflow-hidden border-0 shadow-sm">
      <PanelHeader
        icon={Star}
        title="Destaques e Promoções"
        description="Selecione produtos para a página inicial e configure promoções"
        kpis={[
          { label: 'Total', value: visible.length },
          { label: 'Em destaque', value: featuredCount, tone: 'warning' },
          { label: 'Em promoção', value: onSaleCount, tone: 'success' },
        ]}
      />
      <CardContent className="p-4 md:p-6 space-y-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input placeholder="Procurar produto..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Imagem</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead>Preço</TableHead>
                <TableHead className="text-center">Promoção</TableHead>
                <TableHead className="text-center">Em Destaque</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((product) => (
                <FeaturedProductRow key={product.id} product={product} onUpdate={load} />
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
