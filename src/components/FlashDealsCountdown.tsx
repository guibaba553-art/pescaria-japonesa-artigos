import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/hooks/useCart";
import { useProductQuantity } from "@/hooks/useProductQuantity";
import { useToast } from "@/hooks/use-toast";
import { Product } from "@/types/product";
import { ProductCard } from "./ProductCard";
import { Button } from "@/components/ui/button";
import { Zap, ArrowRight, Clock } from "lucide-react";

const pad = (n: number) => String(n).padStart(2, "0");

const computeTimeLeft = (target: number) => {
  const diff = Math.max(0, target - Date.now());
  return {
    diff,
    d: Math.floor(diff / 86_400_000),
    h: Math.floor((diff % 86_400_000) / 3_600_000),
    m: Math.floor((diff % 3_600_000) / 60_000),
    s: Math.floor((diff % 60_000) / 1000),
  };
};

const getEndOfDay = () => {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
};

// Mini badge per-card timer (overlays each product if it has its own sale_ends_at)
const MiniTimer = ({ endsAt }: { endsAt: string }) => {
  const target = new Date(endsAt).getTime();
  const [t, setT] = useState(() => computeTimeLeft(target));
  useEffect(() => {
    const id = setInterval(() => setT(computeTimeLeft(target)), 1000);
    return () => clearInterval(id);
  }, [target]);
  if (t.diff <= 0) return null;
  return (
    <div className="absolute bottom-2 left-2 right-2 z-10 flex items-center justify-center gap-1 rounded-md bg-foreground/90 backdrop-blur-sm text-background text-[10px] font-bold uppercase tracking-wider px-2 py-1 shadow-lg">
      <Clock className="w-3 h-3" />
      <span className="tabular-nums">
        {t.d > 0 ? `${t.d}d ` : ""}
        {pad(t.h)}:{pad(t.m)}:{pad(t.s)}
      </span>
    </div>
  );
};

const FlashDealsCountdown = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
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
        .order("sale_ends_at", { ascending: true, nullsFirst: false })
        .limit(8);

      // Filter out expired sale_ends_at
      const now = Date.now();
      const valid = ((data as Product[]) || []).filter(
        (p) => !p.sale_ends_at || new Date(p.sale_ends_at).getTime() > now,
      );
      setProducts(valid.slice(0, 4));
      setLoading(false);
    };
    load();
  }, []);

  // Master target: nearest sale_ends_at among shown products, else end of day
  const masterTarget = useMemo(() => {
    const ends = products
      .map((p) => (p.sale_ends_at ? new Date(p.sale_ends_at).getTime() : null))
      .filter((v): v is number => v !== null && v > Date.now());
    if (ends.length > 0) return Math.min(...ends);
    return getEndOfDay();
  }, [products]);

  const [timeLeft, setTimeLeft] = useState(() => computeTimeLeft(masterTarget));

  useEffect(() => {
    setTimeLeft(computeTimeLeft(masterTarget));
    const id = setInterval(() => setTimeLeft(computeTimeLeft(masterTarget)), 1000);
    return () => clearInterval(id);
  }, [masterTarget]);

  if (loading || products.length === 0) return null;

  const hasSpecificEnd = products.some(
    (p) => p.sale_ends_at && new Date(p.sale_ends_at).getTime() > Date.now(),
  );

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
              {hasSpecificEnd ? "Ofertas por tempo limitado" : "Só hoje. Até zerar o estoque."}
            </h2>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs sm:text-sm font-semibold uppercase tracking-wider hidden sm:inline">
              Termina em
            </span>
            <div className="flex items-center gap-1.5">
              {[
                ...(timeLeft.d > 0 ? [{ v: timeLeft.d, l: "dias" }] : []),
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
            <div key={product.id} className="relative">
              <ProductCard
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
              {/* Per-product countdown overlay (only if product has specific sale_ends_at) */}
              {product.sale_ends_at && (
                <div className="pointer-events-none absolute inset-x-0 top-0 aspect-square">
                  <MiniTimer endsAt={product.sale_ends_at} />
                </div>
              )}
            </div>
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
