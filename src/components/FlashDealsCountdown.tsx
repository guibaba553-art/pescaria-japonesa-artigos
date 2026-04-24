import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/hooks/useCart";
import { useProductQuantity } from "@/hooks/useProductQuantity";
import { useToast } from "@/hooks/use-toast";
import { Product } from "@/types/product";
import { ProductCard } from "./ProductCard";
import { Button } from "@/components/ui/button";
import { Zap, ArrowRight } from "lucide-react";

// End time: today 23:59:59
const getEndOfDay = () => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
};

const FlashDealsCountdown = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState({ h: 0, m: 0, s: 0 });
  const { toast } = useToast();
  const { addItem } = useCart();
  const { getQuantity, setQuantity, incrementQuantity, decrementQuantity } = useProductQuantity();

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase
        .from("products")
        .select(`*, variations:product_variations(*)`)
        .eq("on_sale", true)
        .gt("stock", 0)
        .not("sale_price", "is", null)
        .order("created_at", { ascending: false })
        .limit(4);
      setProducts((data as Product[]) || []);
      setLoading(false);
    };
    load();
  }, []);

  useEffect(() => {
    const tick = () => {
      const diff = Math.max(0, getEndOfDay() - Date.now());
      const h = Math.floor(diff / 3_600_000);
      const m = Math.floor((diff % 3_600_000) / 60_000);
      const s = Math.floor((diff % 60_000) / 1000);
      setTimeLeft({ h, m, s });
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  if (loading || products.length === 0) return null;

  const pad = (n: number) => String(n).padStart(2, "0");

  return (
    <section className="py-12 sm:py-16 bg-gradient-to-br from-primary via-primary to-[hsl(16_100%_48%)] text-primary-foreground relative overflow-hidden">
      {/* Decorative blobs */}
      <div className="absolute -top-20 -right-20 w-96 h-96 bg-white/10 rounded-full blur-3xl" />
      <div className="absolute -bottom-20 -left-20 w-96 h-96 bg-black/10 rounded-full blur-3xl" />

      <div className="container mx-auto relative">
        {/* Header with timer */}
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-8">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/20 backdrop-blur-sm mb-3">
              <Zap className="w-3.5 h-3.5 fill-current" />
              <span className="text-xs font-bold uppercase tracking-wider">Oferta relâmpago</span>
            </div>
            <h2 className="text-3xl sm:text-4xl md:text-5xl font-display font-black leading-tight">
              Só hoje. Até zerar o estoque.
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs sm:text-sm font-semibold uppercase tracking-wider hidden sm:inline">
              Termina em
            </span>
            <div className="flex items-center gap-1.5">
              {[
                { v: timeLeft.h, l: "h" },
                { v: timeLeft.m, l: "min" },
                { v: timeLeft.s, l: "s" },
              ].map((t, i) => (
                <div
                  key={i}
                  className="bg-foreground text-background rounded-lg px-3 py-2 min-w-[58px] text-center shadow-lg"
                >
                  <div className="text-xl sm:text-2xl font-display font-black tabular-nums leading-none">
                    {pad(t.v)}
                  </div>
                  <div className="text-[9px] uppercase tracking-wider opacity-70 mt-0.5">
                    {t.l}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Products */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              quantity={getQuantity(product.id)}
              onQuantityChange={(qty) => setQuantity(product.id, qty)}
              onIncrement={() => incrementQuantity(product.id, product.stock)}
              onDecrement={() => decrementQuantity(product.id)}
              onAddToCart={() => {
                const qty = getQuantity(product.id);
                addItem(
                  {
                    id: product.id,
                    name: product.name,
                    price: product.on_sale && product.sale_price ? product.sale_price : product.price,
                    image_url: product.image_url,
                  },
                  qty,
                );
                toast({ title: "Adicionado ao carrinho", description: `${qty} × ${product.name}` });
              }}
              showDescription={false}
            />
          ))}
        </div>

        {/* CTA */}
        <div className="text-center mt-8">
          <Button
            size="lg"
            variant="secondary"
            onClick={() => navigate("/produtos?on_sale=true")}
            className="rounded-full bg-foreground text-background hover:bg-foreground/90 h-12 px-8 font-bold"
          >
            Ver todas as ofertas
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </section>
  );
};

export default FlashDealsCountdown;
