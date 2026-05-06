import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Loader2, Search, TrendingUp, DollarSign, Tag } from "lucide-react";

interface Product {
  id: string;
  name: string;
  price: number;
  cost: number | null;
  sale_price: number | null;
  on_sale: boolean;
  category: string;
  image_url: string | null;
  sku: string | null;
}

const fmt = (v: number | null | undefined) =>
  (v ?? 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function PriceFormation() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("products")
        .select("id,name,price,cost,sale_price,on_sale,category,image_url,sku")
        .order("name")
        .limit(2000);
      if (error) console.error("PriceFormation load error:", error);
      console.log("PriceFormation loaded:", data?.length);
      setProducts((data as Product[]) || []);
      setLoading(false);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.sku || "").toLowerCase().includes(q) ||
        (p.category || "").toLowerCase().includes(q)
    );
  }, [products, search]);

  const calc = (p: Product) => {
    const cost = Number(p.cost || 0);
    const price = Number(p.on_sale && p.sale_price ? p.sale_price : p.price || 0);
    const profit = price - cost;
    const marginPct = price > 0 ? (profit / price) * 100 : 0;
    const markupPct = cost > 0 ? (profit / cost) * 100 : 0;
    return { cost, price, profit, marginPct, markupPct };
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TrendingUp className="w-5 h-5" /> Formação de Preço de Venda
        </CardTitle>
        <CardDescription>
          Clique em um produto para visualizar custo, valor original e margem de lucro.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, SKU ou categoria..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>

        <div className="text-xs text-muted-foreground">
          {filtered.length} de {products.length} produtos
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 max-h-[65vh] overflow-y-auto pr-1">
          {filtered.map((p) => {
            const { cost, price, marginPct } = calc(p);
            return (
              <button
                key={p.id}
                onClick={() => setSelected(p)}
                className="text-left border rounded-lg p-3 hover:border-primary hover:shadow-md transition bg-card"
              >
                <div className="flex gap-3">
                  {p.image_url ? (
                    <img
                      src={p.image_url}
                      alt={p.name}
                      className="w-14 h-14 object-cover rounded-md flex-shrink-0"
                      loading="lazy"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                      <Tag className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{p.category}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-sm font-bold">{fmt(price)}</span>
                      {cost > 0 && (
                        <Badge
                          variant="secondary"
                          className={
                            marginPct >= 30
                              ? "bg-green-100 text-green-800"
                              : marginPct >= 15
                              ? "bg-yellow-100 text-yellow-800"
                              : "bg-red-100 text-red-800"
                          }
                        >
                          {marginPct.toFixed(1)}%
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-full text-center text-muted-foreground py-8">
              Nenhum produto encontrado.
            </div>
          )}
        </div>
      </CardContent>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent className="max-w-md">
          {selected && (() => {
            const { cost, price, profit, marginPct, markupPct } = calc(selected);
            const original = Number(selected.price || 0);
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <DollarSign className="w-5 h-5" /> {selected.name}
                  </DialogTitle>
                  <DialogDescription>{selected.category}{selected.sku ? ` • SKU: ${selected.sku}` : ""}</DialogDescription>
                </DialogHeader>

                <div className="space-y-3 mt-2">
                  {selected.image_url && (
                    <img
                      src={selected.image_url}
                      alt={selected.name}
                      className="w-full h-40 object-contain rounded-md bg-muted"
                    />
                  )}

                  <Row label="Custo" value={fmt(cost)} />
                  <Row label="Valor original do produto" value={fmt(original)} />
                  {selected.on_sale && selected.sale_price && (
                    <Row label="Preço promocional" value={fmt(selected.sale_price)} accent="text-orange-600" />
                  )}
                  <Row label="Preço de venda atual" value={fmt(price)} bold />

                  <div className="border-t pt-3 space-y-3">
                    <Row label="Lucro por unidade" value={fmt(profit)} accent={profit >= 0 ? "text-green-600" : "text-red-600"} bold />
                    <Row
                      label="Margem de lucro"
                      value={`${marginPct.toFixed(2)}%`}
                      accent={marginPct >= 30 ? "text-green-600" : marginPct >= 15 ? "text-yellow-600" : "text-red-600"}
                      bold
                    />
                    <Row
                      label="Markup sobre custo"
                      value={`${markupPct.toFixed(2)}%`}
                      accent="text-muted-foreground"
                    />
                  </div>

                  {cost === 0 && (
                    <div className="text-xs bg-yellow-50 text-yellow-800 rounded-md p-2">
                      ⚠️ Custo não cadastrado. Edite o produto no catálogo para calcular margem real.
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </Card>
  );
}

function Row({ label, value, bold, accent }: { label: string; value: string; bold?: boolean; accent?: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={`${bold ? "font-bold" : ""} ${accent || ""}`}>{value}</span>
    </div>
  );
}
