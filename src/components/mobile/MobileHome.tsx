import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Zap, ChevronRight, Truck, CreditCard, ShieldCheck, RotateCcw, Flame } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCategories } from "@/hooks/useCategories";
import { Product } from "@/types/product";
import { PUBLIC_PRODUCT_COLUMNS_WITH_VARIATIONS } from "@/utils/productColumns";
import varasImg from "@/assets/category-varas.jpg";
import molinetesImg from "@/assets/category-molinetes.jpg";
import carretilhasImg from "@/assets/category-carretilhas.jpg";
import iscasImg from "@/assets/category-iscas.jpg";
import anzoisImg from "@/assets/category-anzois.jpg";
import linhasImg from "@/assets/category-linhas.jpg";
import acessoriosImg from "@/assets/category-acessorios.jpg";

const CATEGORY_IMAGES: Record<string, string> = {
  varas: varasImg,
  molinetes: molinetesImg,
  carretilhas: carretilhasImg,
  iscas: iscasImg,
  anzois: anzoisImg,
  "anzóis": anzoisImg,
  linhas: linhasImg,
  acessorios: acessoriosImg,
  "acessórios": acessoriosImg,
};

const getCategoryImage = (c: { slug?: string; name?: string }) => {
  const slug = (c.slug || "").toLowerCase();
  const name = (c.name || "").toLowerCase();
  return CATEGORY_IMAGES[slug] || CATEGORY_IMAGES[name] || acessoriosImg;
};

const formatPrice = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const pad = (n: number) => String(n).padStart(2, "0");

const useCountdown = (targetMs: number) => {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const diff = Math.max(0, targetMs - now);
  return {
    h: Math.floor(diff / 3_600_000),
    m: Math.floor((diff % 3_600_000) / 60_000),
    s: Math.floor((diff % 60_000) / 1000),
  };
};

const ProductMiniCard = ({
  product,
  highlight,
}: {
  product: Product;
  highlight?: boolean;
}) => {
  const navigate = useNavigate();
  const onSale = product.on_sale && product.sale_price && product.sale_price < product.price;
  const finalPrice = onSale ? product.sale_price! : product.price;
  const discount = onSale
    ? Math.round(((product.price - product.sale_price!) / product.price) * 100)
    : 0;
  const installment = finalPrice >= 50 ? Math.min(10, Math.floor(finalPrice / 30)) : 0;

  return (
    <button
      onClick={() => navigate(`/produto/${product.id}`)}
      className="flex-shrink-0 w-36 bg-card rounded-xl border border-border overflow-hidden text-left shadow-sm active:scale-[0.98] transition-transform"
    >
      <div className="relative aspect-square bg-muted overflow-hidden">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            loading="lazy"
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-muted" />
        )}
        {onSale && (
          <span className="absolute top-0 right-0 bg-destructive text-destructive-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-bl-lg">
            -{discount}%
          </span>
        )}
        {highlight && (
          <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-0.5 bg-primary text-primary-foreground text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded">
            <Flame className="w-2.5 h-2.5" />
            Top
          </span>
        )}
      </div>
      <div className="p-2 flex flex-col">
        <p className="text-[11px] text-foreground font-medium leading-tight line-clamp-2 h-8 mb-1">
          {product.name}
        </p>
        {/* Slot fixo p/ preço riscado — mantém altura uniforme entre cards */}
        <p className="text-[10px] text-muted-foreground line-through leading-none h-3">
          {onSale ? formatPrice(product.price) : "\u00A0"}
        </p>
        <p className="text-sm font-bold text-primary leading-tight">
          {formatPrice(finalPrice)}
        </p>
        {/* Slot fixo p/ parcelamento — mantém altura uniforme entre cards */}
        <p className="text-[9px] text-muted-foreground mt-0.5 h-3">
          {installment > 0
            ? `${installment}x de ${formatPrice(finalPrice / installment)}`
            : "\u00A0"}
        </p>
      </div>
    </button>
  );
};

const HorizontalScroller = ({ children }: { children: React.ReactNode }) => (
  <div className="flex gap-3 px-4 overflow-x-auto pb-2 scrollbar-hide snap-x snap-mandatory">
    {children}
  </div>
);

export default function MobileHome() {
  const navigate = useNavigate();
  const { primaries, loading: catsLoading } = useCategories();
  const [searchQuery, setSearchQuery] = useState("");
  const [flashDeals, setFlashDeals] = useState<Product[]>([]);
  const [featured, setFeatured] = useState<Product[]>([]);
  const [bestSellers, setBestSellers] = useState<Product[]>([]);

  // Master countdown: end of day
  const endOfDay = useMemo(() => {
    const d = new Date();
    d.setHours(23, 59, 59, 999);
    return d.getTime();
  }, []);
  const t = useCountdown(endOfDay);

  useEffect(() => {
    const load = async () => {
      const [deals, feat, top] = await Promise.all([
        supabase
          .from("products")
          .select(PUBLIC_PRODUCT_COLUMNS_WITH_VARIATIONS)
          .eq("pdv_only", false)
          .eq("on_sale", true)
          .gt("stock", 0)
          .not("sale_price", "is", null)
          .order("sale_ends_at", { ascending: true, nullsFirst: false })
          .limit(8),
        supabase
          .from("products")
          .select(PUBLIC_PRODUCT_COLUMNS_WITH_VARIATIONS)
          .eq("pdv_only", false)
          .eq("featured", true)
          .gt("stock", 0)
          .order("created_at", { ascending: false })
          .limit(8),
        supabase
          .from("products")
          .select(PUBLIC_PRODUCT_COLUMNS_WITH_VARIATIONS)
          .eq("pdv_only", false)
          .gt("stock", 0)
          .order("rating", { ascending: false, nullsFirst: false })
          .limit(8),
      ]);
      setFlashDeals(((deals.data as unknown) as Product[]) || []);
      setFeatured(((feat.data as unknown) as Product[]) || []);
      setBestSellers(((top.data as unknown) as Product[]) || []);
    };
    load();
  }, []);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const q = searchQuery.trim();
    if (!q) return;
    navigate(`/produtos?search=${encodeURIComponent(q)}`);
  };

  const visibleCategories = primaries.slice(0, 7);

  return (
    <div className="bg-surface-subtle min-h-screen pb-24">
      {/* Sticky search header */}
      <div className="sticky top-16 z-30 bg-foreground px-3 py-3 shadow-md">
        <form onSubmit={handleSearch} className="relative">
          <Search className="w-5 h-5 text-muted-foreground absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar varas, iscas, molinetes…"
            className="w-full bg-background rounded-xl py-2.5 pl-10 pr-4 text-sm border-0 focus:outline-none focus:ring-2 focus:ring-primary"
            enterKeyHint="search"
          />
        </form>
      </div>

      {/* Trust bar */}
      <div className="bg-primary px-4 py-2 flex items-center gap-4 overflow-x-auto whitespace-nowrap text-[11px] font-bold text-primary-foreground uppercase tracking-wider scrollbar-hide">
        <span className="inline-flex items-center gap-1.5">
          <Truck className="w-3.5 h-3.5" /> Envio rápido
        </span>
        <span className="inline-flex items-center gap-1.5">
          <CreditCard className="w-3.5 h-3.5" /> 10x sem juros
        </span>
        <span className="inline-flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" /> Compra segura
        </span>
        <span className="inline-flex items-center gap-1.5">
          <RotateCcw className="w-3.5 h-3.5" /> Troca em 7 dias
        </span>
      </div>

      {/* Hero banner */}
      <div className="px-3 pt-3">
        <button
          onClick={() => navigate("/produtos?on_sale=true")}
          className="block w-full text-left rounded-2xl overflow-hidden relative h-40 bg-gradient-to-br from-primary via-primary to-[hsl(16_100%_48%)] active:scale-[0.99] transition-transform"
        >
          <div className="absolute inset-0 flex flex-col justify-center px-5">
            <span className="bg-foreground text-background text-[10px] font-bold w-fit px-2 py-0.5 rounded uppercase tracking-wider mb-2">
              Mega Liquidação
            </span>
            <h2 className="text-primary-foreground text-2xl font-display font-black leading-tight">
              Até <span className="text-foreground">60% OFF</span>
            </h2>
            <p className="text-primary-foreground/90 text-xs mt-1">
              Confira ofertas selecionadas
            </p>
            <span className="mt-3 inline-flex items-center gap-1 bg-background text-foreground text-xs font-bold px-3 py-1.5 rounded-full w-fit">
              Ver agora <ChevronRight className="w-3 h-3" />
            </span>
          </div>
        </button>
      </div>

      {/* Categories grid */}
      {!catsLoading && visibleCategories.length > 0 && (
        <div className="px-3 pt-5">
          <div className="grid grid-cols-4 gap-y-4">
            {visibleCategories.map((c) => (
              <button
                key={c.id}
                onClick={() => navigate(`/produtos?category=${encodeURIComponent(c.name)}`)}
                className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
              >
                <div className="w-14 h-14 rounded-2xl overflow-hidden border border-border shadow-sm">
                  <img
                    src={getCategoryImage(c)}
                    alt={c.name}
                    loading="lazy"
                    className="w-full h-full object-cover"
                  />
                </div>
                <span className="text-[10px] font-semibold text-foreground text-center leading-tight line-clamp-2 w-14">
                  {c.name}
                </span>
              </button>
            ))}
            <button
              onClick={() => navigate("/produtos")}
              className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
            >
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center border-2 border-dashed border-border">
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </div>
              <span className="text-[10px] font-semibold text-foreground">Ver tudo</span>
            </button>
          </div>
        </div>
      )}

      {/* Flash deals */}
      {flashDeals.length > 0 && (
        <section className="mt-6 bg-gradient-to-b from-primary/10 to-transparent py-4 border-y border-primary/20">
          <div className="flex items-center justify-between px-4 mb-3">
            <div className="flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary fill-primary" />
              <h3 className="font-display font-black text-foreground text-sm uppercase italic tracking-tight">
                Ofertas Relâmpago
              </h3>
              <div className="flex items-center gap-0.5 ml-1">
                <span className="bg-foreground text-background text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded">
                  {pad(t.h)}
                </span>
                <span className="text-foreground font-bold text-xs">:</span>
                <span className="bg-foreground text-background text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded">
                  {pad(t.m)}
                </span>
                <span className="text-foreground font-bold text-xs">:</span>
                <span className="bg-foreground text-background text-[10px] font-bold tabular-nums px-1.5 py-0.5 rounded">
                  {pad(t.s)}
                </span>
              </div>
            </div>
            <button
              onClick={() => navigate("/produtos?on_sale=true")}
              className="text-[11px] font-semibold text-primary inline-flex items-center"
            >
              Ver tudo <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <HorizontalScroller>
            {flashDeals.map((p) => (
              <div key={p.id} className="snap-start">
                <ProductMiniCard product={p} />
              </div>
            ))}
          </HorizontalScroller>
        </section>
      )}

      {/* Mid promo banner */}
      <div className="px-3 pt-6">
        <button
          onClick={() => navigate("/produtos?category=Molinetes+e+Carretilhas")}
          className="w-full text-left rounded-xl bg-foreground text-background p-4 flex items-center justify-between active:scale-[0.99] transition-transform"
        >
          <div>
            <p className="text-[10px] font-bold text-primary uppercase tracking-wider">
              Novidades
            </p>
            <h3 className="font-display font-bold text-base mt-0.5">
              Carretilhas 2026
            </h3>
            <span className="mt-2 inline-flex items-center gap-1 bg-primary text-primary-foreground text-[10px] font-bold px-2.5 py-1 rounded-full">
              Confira <ChevronRight className="w-3 h-3" />
            </span>
          </div>
          <img
            src={carretilhasImg}
            alt=""
            loading="lazy"
            className="w-20 h-20 object-cover rounded-lg opacity-90"
          />
        </button>
      </div>

      {/* Featured */}
      {featured.length > 0 && (
        <section className="mt-6">
          <div className="flex items-center justify-between px-4 mb-3">
            <h3 className="font-display font-bold text-foreground text-sm uppercase tracking-tight border-l-4 border-primary pl-2">
              Em destaque
            </h3>
            <button
              onClick={() => navigate("/produtos")}
              className="text-[11px] font-semibold text-primary inline-flex items-center"
            >
              Ver tudo <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <HorizontalScroller>
            {featured.map((p) => (
              <div key={p.id} className="snap-start">
                <ProductMiniCard product={p} highlight />
              </div>
            ))}
          </HorizontalScroller>
        </section>
      )}

      {/* Best sellers */}
      {bestSellers.length > 0 && (
        <section className="mt-6">
          <div className="flex items-center justify-between px-4 mb-3">
            <h3 className="font-display font-bold text-foreground text-sm uppercase tracking-tight border-l-4 border-primary pl-2">
              Mais vendidos em Sinop
            </h3>
            <button
              onClick={() => navigate("/produtos")}
              className="text-[11px] font-semibold text-primary inline-flex items-center"
            >
              Ver tudo <ChevronRight className="w-3 h-3" />
            </button>
          </div>
          <HorizontalScroller>
            {bestSellers.map((p) => (
              <div key={p.id} className="snap-start">
                <ProductMiniCard product={p} />
              </div>
            ))}
          </HorizontalScroller>
        </section>
      )}

      {/* Bottom CTA */}
      <div className="px-4 pt-8">
        <button
          onClick={() => navigate("/produtos")}
          className="w-full bg-primary text-primary-foreground font-bold py-3.5 rounded-xl shadow-lg active:scale-[0.99] transition-transform"
        >
          Ver catálogo completo
        </button>
      </div>
    </div>
  );
}
