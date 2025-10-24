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
    stock: 0
  });
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const addVariation = () => {
    if (!newVariation.name || !newVariation.value) return;

    const variation: ProductVariation = {
      id: `temp-${Date.now()}`,
      product_id: "",
      name: newVariation.name,
      value: newVariation.value,
      price_adjustment: 0,
      stock: newVariation.stock
    };

    onVariationsChange([...variations, variation]);
    setNewVariation({ name: "", value: "", stock: 0 });
  };

  const updateVariation = (index: number, field: keyof ProductVariation, value: any) => {
    const updated = variations.map((v, i) => 
      i === index ? { ...v, [field]: value } : v
    );
    onVariationsChange(updated);
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
                <Card key={variation.id} className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="flex-1 grid grid-cols-3 gap-4">
                      <div>
                        <Label htmlFor={`edit-name-${index}`} className="text-xs text-muted-foreground">Tipo</Label>
                        <Input
                          id={`edit-name-${index}`}
                          value={variation.name}
                          onChange={(e) => updateVariation(index, 'name', e.target.value)}
                          placeholder="Ex: Tamanho"
                        />
                      </div>
                      <div>
                        <Label htmlFor={`edit-value-${index}`} className="text-xs text-muted-foreground">Valor</Label>
                        <Input
                          id={`edit-value-${index}`}
                          value={variation.value}
                          onChange={(e) => updateVariation(index, 'value', e.target.value)}
                          placeholder="Ex: 1, 2, 3"
                        />
                      </div>
                      <div>
                        <Label htmlFor={`edit-stock-${index}`} className="text-xs text-muted-foreground">Estoque</Label>
                        <Input
                          id={`edit-stock-${index}`}
                          type="number"
                          value={variation.stock}
                          onChange={(e) => updateVariation(index, 'stock', parseInt(e.target.value) || 0)}
                          placeholder="0"
                        />
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeVariation(index)}
                      className="mt-6"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
      )}

      {/* Formulário para adicionar nova variação */}
      <Card className="p-4 space-y-4">
        <Label className="font-medium">Adicionar Nova Variação</Label>
        <div className="grid grid-cols-3 gap-4">
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
            <Label htmlFor="var-stock">Estoque *</Label>
            <Input
              id="var-stock"
              type="number"
              placeholder="0"
              value={newVariation.stock}
              onChange={(e) => setNewVariation({ ...newVariation, stock: parseInt(e.target.value) || 0 })}
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
        * Adicione variações como tamanho, cor, modelo, etc. Cada variação possui seu próprio controle de estoque.
      </p>
    </div>
  );
}
