import { useState } from "react";
import { ProductVariation } from "@/types/product";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Trash2, Plus } from "lucide-react";
import { Card } from "./ui/card";

interface ProductVariationsProps {
  variations: ProductVariation[];
  onVariationsChange: (variations: ProductVariation[]) => void;
}

export function ProductVariations({ variations, onVariationsChange }: ProductVariationsProps) {
  const [newVariation, setNewVariation] = useState({
    name: "",
    value: "",
    price_adjustment: 0,
    stock: 0,
    sku: ""
  });

  const addVariation = () => {
    if (!newVariation.name || !newVariation.value) return;

    const variation: ProductVariation = {
      id: `temp-${Date.now()}`,
      product_id: "",
      name: newVariation.name,
      value: newVariation.value,
      price_adjustment: newVariation.price_adjustment,
      stock: newVariation.stock,
      sku: newVariation.sku || null
    };

    onVariationsChange([...variations, variation]);
    setNewVariation({ name: "", value: "", price_adjustment: 0, stock: 0, sku: "" });
  };

  const removeVariation = (index: number) => {
    onVariationsChange(variations.filter((_, i) => i !== index));
  };

  return (
    <div className="space-y-4">
      <Label className="text-lg font-semibold">Variações do Produto</Label>
      
      {/* Lista de variações existentes */}
      {variations.length > 0 && (
        <div className="space-y-2">
          {variations.map((variation, index) => (
            <Card key={variation.id} className="p-4 flex items-center gap-4">
              <div className="flex-1 grid grid-cols-5 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Tipo</Label>
                  <p className="font-medium">{variation.name}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Valor</Label>
                  <p className="font-medium">{variation.value}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Ajuste Preço</Label>
                  <p className="font-medium">R$ {variation.price_adjustment.toFixed(2)}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Estoque</Label>
                  <p className="font-medium">{variation.stock}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">SKU</Label>
                  <p className="font-medium text-xs">{variation.sku || "-"}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeVariation(index)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </Card>
          ))}
        </div>
      )}

      {/* Formulário para adicionar nova variação */}
      <Card className="p-4 space-y-4">
        <Label className="font-medium">Adicionar Nova Variação</Label>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div>
            <Label htmlFor="var-name">Tipo *</Label>
            <Input
              id="var-name"
              placeholder="Ex: Tamanho"
              value={newVariation.name}
              onChange={(e) => setNewVariation({ ...newVariation, name: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="var-value">Valor *</Label>
            <Input
              id="var-value"
              placeholder="Ex: 1, 2, 3"
              value={newVariation.value}
              onChange={(e) => setNewVariation({ ...newVariation, value: e.target.value })}
            />
          </div>
          <div>
            <Label htmlFor="var-price">Ajuste Preço (R$)</Label>
            <Input
              id="var-price"
              type="number"
              step="0.01"
              placeholder="0.00"
              value={newVariation.price_adjustment}
              onChange={(e) => setNewVariation({ ...newVariation, price_adjustment: parseFloat(e.target.value) || 0 })}
            />
          </div>
          <div>
            <Label htmlFor="var-stock">Estoque *</Label>
            <Input
              id="var-stock"
              type="number"
              placeholder="0"
              value={newVariation.stock}
              onChange={(e) => setNewVariation({ ...newVariation, stock: parseInt(e.target.value) || 0 })}
            />
          </div>
          <div>
            <Label htmlFor="var-sku">SKU</Label>
            <Input
              id="var-sku"
              placeholder="Código"
              value={newVariation.sku}
              onChange={(e) => setNewVariation({ ...newVariation, sku: e.target.value })}
            />
          </div>
        </div>
        <Button
          type="button"
          onClick={addVariation}
          disabled={!newVariation.name || !newVariation.value}
          className="w-full"
        >
          <Plus className="h-4 w-4 mr-2" />
          Adicionar Variação
        </Button>
      </Card>

      <p className="text-sm text-muted-foreground">
        * Adicione variações como tamanho, cor, modelo, etc. O ajuste de preço será somado ao preço base do produto.
      </p>
    </div>
  );
}
