import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Header } from '@/components/Header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Home } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useCart } from '@/hooks/useCart';
import { useProductQuantity } from '@/hooks/useProductQuantity';
import { Product } from '@/types/product';
import { ProductCard } from '@/components/ProductCard';

const categories = [
  { name: 'Todas', value: '' },
  { name: 'Varas', value: 'Varas' },
  { name: 'Molinetes e Carretilhas', value: 'Molinetes e Carretilhas' },
  { name: 'Iscas', value: 'Iscas' },
  { name: 'Anzóis', value: 'Anzóis' },
  { name: 'Linhas', value: 'Linhas' },
  { name: 'Acessórios', value: 'Acessórios' },
  { name: 'Roupas', value: 'Roupas' },
];

export default function Products() {
  const [searchParams, setSearchParams] = useSearchParams();
  const categoryParam = searchParams.get('category') || '';
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const { toast } = useToast();
  const { addItem } = useCart();
  const { getQuantity, setQuantity, incrementQuantity, decrementQuantity } = useProductQuantity();

  useEffect(() => {
    loadProducts();
  }, [categoryParam]);

  const loadProducts = async () => {
    setLoading(true);
    let query = supabase
      .from('products')
      .select(`
        *,
        variations:product_variations(*)
      `)
      .gt('stock', 0)
      .order('name', { ascending: true });

    if (categoryParam) {
      query = query.eq('category', categoryParam);
    }

    const { data, error } = await query;

    if (error) {
      toast({
        title: 'Erro ao carregar produtos',
        description: error.message,
        variant: 'destructive'
      });
    } else {
      setProducts(data || []);
    }
    setLoading(false);
  };

  const handleCategoryChange = (category: string) => {
    if (category) {
      setSearchParams({ category });
    } else {
      setSearchParams({});
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <div className="container mx-auto px-4 pt-24 pb-20">
        <Button
          variant="ghost"
          className="mb-6"
          onClick={() => window.location.href = '/'}
        >
          <Home className="w-4 h-4 mr-2" />
          Voltar à Home
        </Button>

        <div className="text-center mb-8">
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            {categoryParam || 'Todos os Produtos'}
          </h1>
          <p className="text-xl text-muted-foreground mb-6">
            Encontre os melhores equipamentos de pesca
          </p>
          <div className="max-w-md mx-auto">
            <Input
              placeholder="Procurar produto por nome..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-lg"
            />
          </div>
        </div>

        {/* Filtros de Categoria */}
        <div className="flex flex-wrap gap-3 justify-center mb-12">
          {categories.map((cat) => (
            <Badge
              key={cat.value}
              variant={categoryParam === cat.value ? 'default' : 'outline'}
              className="cursor-pointer px-6 py-2 text-base hover:bg-primary hover:text-primary-foreground transition-colors"
              onClick={() => handleCategoryChange(cat.value)}
            >
              {cat.name}
            </Badge>
          ))}
        </div>

        {/* Lista de Produtos */}
        {loading ? (
          <div className="text-center py-20">
            <p className="text-xl text-muted-foreground">Carregando produtos...</p>
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-20">
            <p className="text-xl text-muted-foreground">
              Nenhum produto encontrado nesta categoria.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {products
              .filter(product => 
                product.name.toLowerCase().includes(searchQuery.toLowerCase())
              )
              .map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  quantity={getQuantity(product.id)}
                  onQuantityChange={(qty) => setQuantity(product.id, qty)}
                  onIncrement={() => incrementQuantity(product.id, product.stock)}
                  onDecrement={() => decrementQuantity(product.id)}
                  onAddToCart={() => {
                    const qty = getQuantity(product.id);
                    addItem({
                      id: product.id,
                      name: product.name,
                      price: product.on_sale && product.sale_price ? product.sale_price : product.price,
                      image_url: product.image_url
                    }, qty);
                    toast({
                      title: 'Produto adicionado!',
                      description: `${qty} unidade(s) adicionada(s) ao carrinho.`
                    });
                  }}
                />
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
