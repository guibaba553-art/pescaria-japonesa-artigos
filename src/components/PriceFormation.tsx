import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Loader2,
  Search,
  TrendingUp,
  DollarSign,
  Tag,
  Save,
  Plus,
  Trash2,
  Layers,
} from "lucide-react";
import { toast } from "sonner";

interface Product {
  id: string; // row id (product id or variation id)
  product_id: string; // always the parent product id (used to update products.* fields)
  variation_id: string | null;
  name: string;
  price: number;
  cost: number | null;
  sale_price: number | null;
  on_sale: boolean;
  category: string;
  image_url: string | null;
  sku: string | null;
  cost_group_id: string | null;
  freight_pct: number;
  op_cost_pct: number;
  min_sale_price: number | null;
}

interface CostGroup {
  id: string;
  name: string;
  cost: number;
  description: string | null;
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
  const [groups, setGroups] = useState<CostGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Product | null>(null);

  // Edit form
  const [editCost, setEditCost] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [editMargin, setEditMargin] = useState("");
  const [editGroupId, setEditGroupId] = useState<string>("none");
  const [editFreightPct, setEditFreightPct] = useState("");
  const [editOpCostPct, setEditOpCostPct] = useState("");
  const [editMinSale, setEditMinSale] = useState("");
  const [saving, setSaving] = useState(false);

  // Group manager
  const [groupsOpen, setGroupsOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupCost, setNewGroupCost] = useState("");
  const [newGroupDesc, setNewGroupDesc] = useState("");
  const [creatingGroup, setCreatingGroup] = useState(false);

  const loadAll = async (opts: { silent?: boolean } = {}) => {
    if (opts.silent) setRefreshing(true);
    else setLoading(true);
    try {
      const [pRes, gRes, vRes] = await Promise.all([
        supabase.rpc("get_products_admin"),
        supabase.from("cost_groups").select("id, name, cost, description").order("name"),
        supabase
          .from("product_variations")
          .select("id, product_id, name, sku, price, image_url, cost, cost_group_id, freight_pct, op_cost_pct, min_sale_price")
          .order("name"),
      ]);

      if (pRes.error) throw pRes.error;
      if (gRes.error) throw gRes.error;
      if (vRes.error) throw vRes.error;

      const rawProducts = (pRes.data as any[] | null) || [];
      const variations = (vRes.data as any[] | null) || [];
      const productsWithVariationIds = new Set(variations.map((v) => v.product_id));

      const productRows: Product[] = rawProducts
        .filter((p) => !productsWithVariationIds.has(p.id))
        .map((p) => ({
          id: p.id,
          product_id: p.id,
          variation_id: null,
          name: p.name,
          price: Number(p.price || 0),
          cost: p.cost !== null ? Number(p.cost) : null,
          sale_price: p.sale_price !== null ? Number(p.sale_price) : null,
          on_sale: !!p.on_sale,
          category: p.category || "Sem categoria",
          image_url: p.image_url || null,
          sku: p.sku || null,
          cost_group_id: p.cost_group_id || null,
          freight_pct: Number(p.freight_pct ?? 0),
          op_cost_pct: Number(p.op_cost_pct ?? 0),
          min_sale_price: p.min_sale_price !== null && p.min_sale_price !== undefined ? Number(p.min_sale_price) : null,
        }));

      const productById = new Map(rawProducts.map((p) => [p.id, p]));
      const variationRows: Product[] = variations.map((v) => {
        const parent = productById.get(v.product_id) || ({} as any);
        return {
          id: `v:${v.id}`,
          product_id: v.product_id,
          variation_id: v.id,
          name: `${parent.name || ""} - ${v.name}`,
          price: Number(v.price || 0),
          cost: v.cost !== null && v.cost !== undefined ? Number(v.cost) : null,
          sale_price: null,
          on_sale: false,
          category: parent.category || "Sem categoria",
          image_url: v.image_url || parent.image_url || null,
          sku: v.sku || null,
          cost_group_id: v.cost_group_id || null,
          freight_pct: Number(v.freight_pct ?? 0),
          op_cost_pct: Number(v.op_cost_pct ?? 0),
          min_sale_price: v.min_sale_price !== null && v.min_sale_price !== undefined ? Number(v.min_sale_price) : null,
        };
      });

      const normalized = [...productRows, ...variationRows].sort((a, b) =>
        a.name.localeCompare(b.name, "pt-BR")
      );

      setProducts(normalized);
      setGroups(
        ((gRes.data as any[] | null) || []).map((g) => ({
          id: g.id,
          name: g.name,
          cost: Number(g.cost || 0),
          description: g.description,
        }))
      );
      setLoadError(null);
    } catch (error: any) {
      console.error("PriceFormation load error:", error);
      if (!opts.silent) setProducts([]);
      setLoadError("Não foi possível carregar os dados.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  // Sync form when product selected
  useEffect(() => {
    if (selected) {
      const cost = Number(selected.cost ?? 0);
      const price = Number(selected.price ?? 0);
      const margin = price > 0 ? ((price - cost) / price) * 100 : 0;
      setEditCost(String(cost));
      setEditPrice(String(price));
      setEditMargin(margin.toFixed(2));
      setEditGroupId(selected.cost_group_id || "none");
      setEditFreightPct("");
      setEditOpCostPct("");
      setEditMinSale("");
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

  const VISIBLE_LIMIT = 80;
  const visible = useMemo(() => filtered.slice(0, VISIBLE_LIMIT), [filtered]);
  const groupsById = useMemo(() => {
    const m = new Map<string, CostGroup>();
    groups.forEach((g) => m.set(g.id, g));
    return m;
  }, [groups]);

  const calc = (p: Product) => {
    const cost = Number(p.cost || 0);
    const price = Number(p.on_sale && p.sale_price ? p.sale_price : p.price || 0);
    const profit = price - cost;
    const marginPct = price > 0 ? (profit / price) * 100 : 0;
    const markupPct = cost > 0 ? (profit / cost) * 100 : 0;
    return { cost, price, profit, marginPct, markupPct };
  };

  // Live values
  const liveCost = parseNum(editCost);
  const livePrice = parseNum(editPrice);
  const liveMargin = parseNum(editMargin);
  const liveFreightPct = parseNum(editFreightPct);
  const liveOpCostPct = parseNum(editOpCostPct);
  const liveMinSale = parseNum(editMinSale);
  const liveFreight = liveCost * (liveFreightPct / 100);
  const liveOpCost = liveCost * (liveOpCostPct / 100);
  const liveTotalCost = liveCost + liveFreight + liveOpCost;
  const liveProfit = livePrice - liveTotalCost;
  const liveMarkup = liveTotalCost > 0 ? (liveProfit / liveTotalCost) * 100 : 0;
  const belowMin = liveMinSale > 0 && livePrice > 0 && livePrice < liveMinSale;

  // Margin → recompute price
  const handleMarginChange = (v: string) => {
    setEditMargin(v);
    const m = parseNum(v);
    if (m >= 100 || m < 0) return;
    const newPrice = liveCost / (1 - m / 100);
    if (isFinite(newPrice) && newPrice > 0) {
      setEditPrice(newPrice.toFixed(2));
    }
  };

  // Price → recompute margin
  const handlePriceChange = (v: string) => {
    setEditPrice(v);
    const p = parseNum(v);
    if (p > 0) {
      const m = ((p - liveCost) / p) * 100;
      setEditMargin(m.toFixed(2));
    }
  };

  // Cost → recompute margin (price fixed)
  const handleCostChange = (v: string) => {
    setEditCost(v);
    const c = parseNum(v);
    if (livePrice > 0) {
      const m = ((livePrice - c) / livePrice) * 100;
      setEditMargin(m.toFixed(2));
    }
  };

  const handleSave = async () => {
    if (!selected) return;
    if (livePrice <= 0) {
      toast.error("Preço de venda deve ser maior que zero");
      return;
    }
    setSaving(true);
    try {
      const newGroupId = editGroupId === "none" ? null : editGroupId;
      if (selected.variation_id) {
        const { error } = await supabase
          .from("product_variations")
          .update({
            cost: liveCost,
            price: livePrice,
            cost_group_id: newGroupId,
          })
          .eq("id", selected.variation_id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("products")
          .update({
            cost: liveCost,
            price: livePrice,
            cost_group_id: newGroupId,
          })
          .eq("id", selected.product_id);
        if (error) throw error;
      }

      toast.success(selected.variation_id ? "Variação atualizada" : "Produto atualizado");

      const newCost = newGroupId
        ? groups.find((g) => g.id === newGroupId)?.cost ?? liveCost
        : liveCost;
      setProducts((prev) =>
        prev.map((p) =>
          p.id === selected.id
            ? { ...p, cost: newCost, price: livePrice, cost_group_id: newGroupId }
            : p
        )
      );
      setSelected({
        ...selected,
        cost: newCost,
        price: livePrice,
        cost_group_id: newGroupId,
      });

      loadAll({ silent: true });
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateGroup = async () => {
    if (!newGroupName.trim()) {
      toast.error("Informe o nome do grupo");
      return;
    }
    setCreatingGroup(true);
    try {
      const { error } = await supabase.from("cost_groups").insert({
        name: newGroupName.trim(),
        cost: parseNum(newGroupCost),
        description: newGroupDesc.trim() || null,
      });
      if (error) throw error;
      toast.success("Grupo criado");
      setNewGroupName("");
      setNewGroupCost("");
      setNewGroupDesc("");
      await loadAll({ silent: true });
    } catch (e: any) {
      toast.error(e?.message || "Erro ao criar grupo");
    } finally {
      setCreatingGroup(false);
    }
  };

  const handleUpdateGroupCost = async (groupId: string, cost: number) => {
    try {
      const { error } = await supabase
        .from("cost_groups")
        .update({ cost })
        .eq("id", groupId);
      if (error) throw error;
      toast.success("Custo do grupo atualizado — propagado aos produtos");
      await loadAll({ silent: true });
    } catch (e: any) {
      toast.error(e?.message || "Erro ao atualizar grupo");
    }
  };

  const handleDeleteGroup = async (groupId: string) => {
    if (!confirm("Excluir este grupo? Os produtos vinculados ficarão sem grupo (mantêm o custo atual).")) return;
    try {
      const { error } = await supabase.from("cost_groups").delete().eq("id", groupId);
      if (error) throw error;
      toast.success("Grupo excluído");
      await loadAll({ silent: true });
    } catch (e: any) {
      toast.error(e?.message || "Erro ao excluir grupo");
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
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="w-5 h-5" /> Formação de Preço de Venda
            </CardTitle>
            <CardDescription>
              Edite custo, preço e margem. Use grupos para compartilhar o mesmo custo entre vários produtos.
            </CardDescription>
          </div>
          <Dialog open={groupsOpen} onOpenChange={setGroupsOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm">
                <Layers className="w-4 h-4 mr-2" />
                Grupos de custo ({groups.length})
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Grupos de custo</DialogTitle>
                <DialogDescription>
                  Crie grupos com um custo compartilhado. Ao alterar o custo do grupo, todos os produtos vinculados são atualizados.
                </DialogDescription>
              </DialogHeader>

              <div className="border rounded-md p-3 space-y-3 bg-muted/30">
                <div className="font-medium text-sm flex items-center gap-2">
                  <Plus className="w-4 h-4" /> Novo grupo
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <Label htmlFor="g-name">Nome</Label>
                    <Input
                      id="g-name"
                      value={newGroupName}
                      onChange={(e) => setNewGroupName(e.target.value)}
                      placeholder="Ex: Anzóis genéricos"
                    />
                  </div>
                  <div>
                    <Label htmlFor="g-cost">Custo (R$)</Label>
                    <Input
                      id="g-cost"
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      value={newGroupCost}
                      onChange={(e) => setNewGroupCost(e.target.value)}
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="g-desc">Descrição (opcional)</Label>
                  <Textarea
                    id="g-desc"
                    rows={2}
                    value={newGroupDesc}
                    onChange={(e) => setNewGroupDesc(e.target.value)}
                  />
                </div>
                <Button onClick={handleCreateGroup} disabled={creatingGroup} size="sm">
                  {creatingGroup ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                  Criar grupo
                </Button>
              </div>

              <div className="space-y-2 mt-2">
                <div className="text-sm font-medium">Grupos existentes</div>
                {groups.length === 0 && (
                  <div className="text-sm text-muted-foreground py-4 text-center">
                    Nenhum grupo criado ainda.
                  </div>
                )}
                {groups.map((g) => {
                  const count = products.filter((p) => p.cost_group_id === g.id).length;
                  return (
                    <GroupRow
                      key={g.id}
                      group={g}
                      productCount={count}
                      onUpdateCost={(c) => handleUpdateGroupCost(g.id, c)}
                      onDelete={() => handleDeleteGroup(g.id)}
                    />
                  );
                })}
              </div>
            </DialogContent>
          </Dialog>
        </div>
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
          Mostrando {visible.length} de {filtered.length}
          {filtered.length !== products.length ? ` (filtrado de ${products.length})` : ""}
          {filtered.length > VISIBLE_LIMIT && " — refine a busca para ver mais"}
        </div>

        {loadError && (
          <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {loadError}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 max-h-[65vh] overflow-y-auto pr-1">
          {visible.map((p) => {
            const { cost, price, marginPct } = calc(p);
            const groupName = p.cost_group_id
              ? groupsById.get(p.cost_group_id)?.name
              : null;
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
                      decoding="async"
                    />
                  ) : (
                    <div className="w-14 h-14 rounded-md bg-muted flex items-center justify-center flex-shrink-0">
                      <Tag className="w-5 h-5 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate">{p.name}</div>
                    <div className="text-xs text-muted-foreground truncate">{p.category}</div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
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
                      {groupName && (
                        <Badge variant="outline" className="text-[10px]">
                          <Layers className="w-3 h-3 mr-1" />
                          {groupName}
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
                    <Label htmlFor="pf-price">Valor de venda (R$)</Label>
                    <Input
                      id="pf-price"
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      value={editPrice}
                      onChange={(e) => handlePriceChange(e.target.value)}
                    />
                  </div>

                  <div>
                    <Label htmlFor="pf-cost">
                      Custo (R$){" "}
                      {editGroupId !== "none" && (
                        <span className="text-xs text-muted-foreground">
                          (vem do grupo)
                        </span>
                      )}
                    </Label>
                    <Input
                      id="pf-cost"
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      value={editCost}
                      onChange={(e) => handleCostChange(e.target.value)}
                      disabled={editGroupId !== "none"}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label htmlFor="pf-freight">Frete (%)</Label>
                      <Input
                        id="pf-freight"
                        type="number"
                        step="0.01"
                        min="0"
                        inputMode="decimal"
                        value={editFreightPct}
                        onChange={(e) => setEditFreightPct(e.target.value)}
                        placeholder="0,00"
                      />
                      <div className="text-[11px] text-muted-foreground mt-1">
                        % sobre o custo · {fmt(liveFreight)}
                      </div>
                    </div>
                    <div>
                      <Label htmlFor="pf-opcost">Custos operacionais (%)</Label>
                      <Input
                        id="pf-opcost"
                        type="number"
                        step="0.01"
                        min="0"
                        inputMode="decimal"
                        value={editOpCostPct}
                        onChange={(e) => setEditOpCostPct(e.target.value)}
                        placeholder="0,00"
                      />
                      <div className="text-[11px] text-muted-foreground mt-1">
                        % sobre o custo · {fmt(liveOpCost)}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-md border bg-muted/40 px-3 py-2 flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">
                      Custo total (custo + frete + operacionais)
                    </span>
                    <span className="font-bold">{fmt(liveTotalCost)}</span>
                  </div>

                  <div>
                    <Label htmlFor="pf-min-sale">Valor mínimo de venda (R$)</Label>
                    <Input
                      id="pf-min-sale"
                      type="number"
                      step="0.01"
                      min="0"
                      inputMode="decimal"
                      value={editMinSale}
                      onChange={(e) => setEditMinSale(e.target.value)}
                      placeholder="0,00"
                    />
                    <div className="text-[11px] text-muted-foreground mt-1">
                      Apenas nesta tela por enquanto. Será aplicado ao PDV e demais campos no futuro.
                    </div>
                    {belowMin && (
                      <div className="mt-2 text-xs rounded-md bg-red-50 text-red-700 px-2 py-1.5 border border-red-200">
                        ⚠️ Preço de venda ({fmt(livePrice)}) está abaixo do mínimo definido ({fmt(liveMinSale)}).
                      </div>
                    )}
                  </div>

                  <div>
                    <Label htmlFor="pf-margin">Margem de lucro (%)</Label>
                    <Input
                      id="pf-margin"
                      type="number"
                      step="0.01"
                      inputMode="decimal"
                      value={editMargin}
                      onChange={(e) => handleMarginChange(e.target.value)}
                    />
                    <div className="text-xs text-muted-foreground mt-1">
                      Editar a margem recalcula o preço de venda automaticamente.
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="pf-group">Grupo de custo</Label>
                    <Select value={editGroupId} onValueChange={setEditGroupId}>
                      <SelectTrigger id="pf-group">
                        <SelectValue placeholder="Sem grupo" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Sem grupo</SelectItem>
                        {groups.map((g) => (
                          <SelectItem key={g.id} value={g.id}>
                            {g.name} — {fmt(g.cost)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="border-t pt-3 space-y-3">
                  <Row label="Lucro por unidade" value={fmt(liveProfit)} accent={liveProfit >= 0 ? "text-green-600" : "text-red-600"} bold />
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

function GroupRow({
  group,
  productCount,
  onUpdateCost,
  onDelete,
}: {
  group: CostGroup;
  productCount: number;
  onUpdateCost: (cost: number) => void;
  onDelete: () => void;
}) {
  const [cost, setCost] = useState(String(group.cost));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCost(String(group.cost));
  }, [group.cost]);

  const dirty = parseNum(cost) !== group.cost;

  return (
    <div className="border rounded-md p-3 flex items-center gap-3 flex-wrap">
      <div className="flex-1 min-w-[150px]">
        <div className="font-medium text-sm">{group.name}</div>
        <div className="text-xs text-muted-foreground">
          {productCount} produto(s){group.description ? ` • ${group.description}` : ""}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Input
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          className="w-28"
        />
        <Button
          size="sm"
          disabled={!dirty || saving}
          onClick={async () => {
            setSaving(true);
            await onUpdateCost(parseNum(cost));
            setSaving(false);
          }}
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDelete}>
          <Trash2 className="w-4 h-4 text-destructive" />
        </Button>
      </div>
    </div>
  );
}
