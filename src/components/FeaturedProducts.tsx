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
      .select(`*, variations:product_variations(*)`)
      .gt('stock', 0)
      .eq('featured', true)
      .order('created_at', { ascending: false })
      .limit(4);

    if (error) {
      toast({ title: 'Erro ao carregar produtos', description: error.message, variant: 'destructive' });
    } else {
      setProducts(data || []);
    }
    setLoading(false);
  };

  return (
    <section className="py-24 sm:py-32 bg-background">
      <div className="container mx-auto">
        {/* Section header */}
        <div className="flex items-end justify-between mb-12 sm:mb-16">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold text-primary uppercase tracking-[0.2em] mb-4">
              Em destaque
            </p>
            <h2 className="text-4xl sm:text-5xl md:text-6xl font-display font-bold text-foreground text-balance leading-[1.05]">
              Selecionados para<br />
              <span className="text-muted-foreground">você.</span>
            </h2>
          </div>
          <button
            onClick={() => navigate('/produtos')}
            className="hidden sm:inline-flex items-center gap-2 text-sm font-medium text-foreground hover:text-primary transition-colors group"
          >
            Ver catálogo completo
            <ArrowUpRight className="w-4 h-4 transition-transform group-hover:rotate-45" />
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 sm:gap-6">
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
