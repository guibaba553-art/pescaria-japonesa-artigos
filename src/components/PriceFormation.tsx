import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Search, TrendingUp, DollarSign, Tag, Save } from "lucide-react";
import { toast } from "sonner";

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

const parseNum = (s: string): number => {
  if (!s) return 0;
  const n = Number(s.replace(",", "."));
  return isNaN(n) ? 0 : n;
};

export function PriceFormation() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);

  // Editable form state
  const [editCost, setEditCost] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editSalePrice, setEditSalePrice] = useState("");
  const [editOnSale, setEditOnSale] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const { data, error } = await supabase.rpc("get_products_admin");
      if (error) throw error;
      const normalized = ((data as Product[] | null) || []).map((product) => ({
        id: product.id,
        name: product.name,
        price: Number(product.price || 0),
        cost: product.cost !== null ? Number(product.cost) : null,
        sale_price: product.sale_price !== null ? Number(product.sale_price) : null,
        on_sale: !!product.on_sale,
        category: product.category || "Sem categoria",
        image_url: product.image_url || null,
        sku: product.sku || null,
      }));
      setProducts(normalized);
      setLoadError(null);
    } catch (error) {
      console.error("PriceFormation load error:", error);
      setProducts([]);
      setLoadError("Não foi possível carregar os produtos desta tela.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  // Sync form when selected changes
  useEffect(() => {
    if (selected) {
      setEditCost(String(selected.cost ?? 0));
      setEditPrice(String(selected.price ?? 0));
      setEditSalePrice(String(selected.sale_price ?? 0));
      setEditOnSale(selected.on_sale);
    }
  }, [selected]);

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

  // Live preview values from form
  const liveCost = parseNum(editCost);
  const livePrice = parseNum(editPrice);
  const liveSale = parseNum(editSalePrice);
  const liveCurrent = editOnSale && liveSale > 0 ? liveSale : livePrice;
  const liveProfit = liveCurrent - liveCost;
  const liveMargin = liveCurrent > 0 ? (liveProfit / liveCurrent) * 100 : 0;
  const liveMarkup = liveCost > 0 ? (liveProfit / liveCost) * 100 : 0;

  const handleSave = async () => {
    if (!selected) return;
    if (livePrice <= 0) {
      toast.error("Preço de venda deve ser maior que zero");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase
        .from("products")
        .update({
          cost: liveCost,
          price: livePrice,
          sale_price: liveSale > 0 ? liveSale : null,
          on_sale: editOnSale && liveSale > 0,
        })
        .eq("id", selected.id);
      if (error) throw error;

      const updated: Product = {
        ...selected,
        cost: liveCost,
        price: livePrice,
        sale_price: liveSale > 0 ? liveSale : null,
        on_sale: editOnSale && liveSale > 0,
      };
      setProducts((prev) => prev.map((p) => (p.id === selected.id ? updated : p)));
      setSelected(updated);
      toast.success("Produto atualizado");
    } catch (e: any) {
      console.error("save error:", e);
      toast.error(e?.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
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
          Clique em um produto para visualizar e editar custo, preço e promoção.
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

        {loadError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {loadError}
          </div>
        )}

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
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <DollarSign className="w-5 h-5" /> {selected.name}
                </DialogTitle>
                <DialogDescription>
                  {selected.category}
                  {selected.sku ? ` • SKU: ${selected.sku}` : ""}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-3 mt-2">
                {selected.image_url && (
                  <img
                    src={selected.image_url}
                    alt={selected.name}
                    className="w-full h-40 object-contain rounded-md bg-muted"
                  />
                )}

                <div className="space-y-3">
                  <div>
                    <Label htmlFor="pf-cost">Custo (R$)</Label>
                    <Input
                      id="pf-cost"
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      value={editCost}
                      onChange={(e) => setEditCost(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="pf-price">Valor original do produto (R$)</Label>
                    <Input
                      id="pf-price"
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      value={editPrice}
                      onChange={(e) => setEditPrice(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label htmlFor="pf-sale">Preço promocional (R$)</Label>
                    <Input
                      id="pf-sale"
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      value={editSalePrice}
                      onChange={(e) => setEditSalePrice(e.target.value)}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="pf-onsale" className="cursor-pointer">
                      Em promoção
                    </Label>
                    <Switch
                      id="pf-onsale"
                      checked={editOnSale}
                      onCheckedChange={setEditOnSale}
                    />
                  </div>
                </div>

                <div className="border-t pt-3 space-y-3">
                  <Row label="Preço de venda atual" value={fmt(liveCurrent)} bold />
                  <Row
                    label="Lucro por unidade"
                    value={fmt(liveProfit)}
                    accent={liveProfit >= 0 ? "text-green-600" : "text-red-600"}
                    bold
                  />
                  <Row
                    label="Margem de lucro"
                    value={`${liveMargin.toFixed(2)}%`}
                    accent={
                      liveMargin >= 30
                        ? "text-green-600"
                        : liveMargin >= 15
                        ? "text-yellow-600"
                        : "text-red-600"
                    }
                    bold
                  />
                  <Row
                    label="Markup sobre custo"
                    value={`${liveMarkup.toFixed(2)}%`}
                    accent="text-muted-foreground"
                  />
                </div>

                {liveCost === 0 && (
                  <div className="text-xs bg-yellow-50 text-yellow-800 rounded-md p-2">
                    ⚠️ Custo não cadastrado. Informe o custo para calcular margem real.
                  </div>
                )}
              </div>

              <DialogFooter className="mt-4">
                <Button variant="outline" onClick={() => setSelected(null)} disabled={saving}>
                  Cancelar
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="w-4 h-4 mr-2" />
                  )}
                  Salvar
                </Button>
              </DialogFooter>
            </>
          )}
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
