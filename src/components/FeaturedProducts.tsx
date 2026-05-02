import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useCart } from "@/hooks/useCart";
import { useProductQuantity } from "@/hooks/useProductQuantity";
import { Product } from "@/types/product";
import { ProductCard } from "./ProductCard";
import { ArrowUpRight, Loader2 } from "lucide-react";
import { PUBLIC_PRODUCT_COLUMNS_WITH_VARIATIONS } from "@/utils/productColumns";

const FeaturedProducts = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { addItem } = useCart();
  const { getQuantity, setQuantity, incrementQuantity, decrementQuantity } = useProductQuantity();

  useEffect(() => {
    loadProducts();
  }, []);

  const loadProducts = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('products')
      .select(PUBLIC_PRODUCT_COLUMNS_WITH_VARIATIONS)
      .eq('pdv_only', false)
      .gt('stock', 0)
      .eq('featured', true)
      .order('created_at', { ascending: false })
      .limit(4);

    if (error) {
      toast({ title: 'Erro ao carregar produtos', description: error.message, variant: 'destructive' });
    } else {
      setProducts(((data as any) || []) as Product[]);
    }
    setLoading(false);
  };

  return (
    <section className="py-12 sm:py-16 bg-background">
      <div className="container mx-auto">
        {/* Section header */}
        <div className="flex items-end justify-between mb-6 sm:mb-8">
          <div>
            <p className="text-xs font-bold text-primary uppercase tracking-wider mb-1.5">
              ⭐ Mais vendidos
            </p>
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-display font-black text-foreground leading-tight">
              Produtos em destaque
            </h2>
          </div>
          <button
            onClick={() => navigate('/produtos')}
            className="hidden sm:inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline group"
          >
            Ver tudo
            <ArrowUpRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24 text-muted-foreground">
            <Loader2 className="w-6 h-6 animate-spin mr-3" />
            Carregando produtos...
          </div>
        ) : products.length === 0 ? (
          <div className="text-center py-24 rounded-3xl bg-muted/40 border border-dashed border-border">
            <p className="text-muted-foreground">Nenhum produto em destaque no momento.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
            {products.map((product, idx) => (
              <div
                key={product.id}
                className="animate-fade-in-up"
                style={{ animationDelay: `${idx * 80}ms`, animationFillMode: 'backwards' }}
              >
                <ProductCard
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
                      title: 'Adicionado ao carrinho',
                      description: `${qty} × ${product.name}`,
                    });
                  }}
                  showDescription={false}
                  variant="compact"
                />
              </div>
            ))}
          </div>
        )}

        <div className="text-center mt-12 sm:hidden">
          <Button
            size="lg"
            variant="outline"
            onClick={() => navigate('/produtos')}
            className="rounded-full"
          >
            Ver catálogo completo
            <ArrowUpRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </section>
  );
};

export default FeaturedProducts;
