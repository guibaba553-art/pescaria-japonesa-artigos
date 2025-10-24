import { useState } from "react";
import { ProductVariation } from "@/types/product";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Trash2, Plus } from "lucide-react";
import { Card } from "./ui/card";
import { Badge } from "./ui/badge";
import { isValidImageUrl } from "@/utils/validation";
import { useToast } from "@/hooks/use-toast";

interface ProductVariationsProps {
  variations: ProductVariation[];
  onVariationsChange: (variations: ProductVariation[]) => void;
}

/**
 * Componente para gerenciar variações de produto
 * Interface intuitiva para adicionar, editar e remover variações
 */
export function ProductVariations({ variations, onVariationsChange }: ProductVariationsProps) {
  const { toast } = useToast();
  const [newVariation, setNewVariation] = useState({
    name: "",
    price: "",
    stock: "",
    description: "",
    image_url: ""
  });

  /**
   * Adiciona nova variação à lista
   */
  const addVariation = () => {
    const name = newVariation.name.trim();
    const price = parseFloat(newVariation.price);
    const stock = parseInt(newVariation.stock);

    // Validações
    if (!name) {
      return;
    }
    if (isNaN(price) || price <= 0) {
      return;
    }
    if (isNaN(stock) || stock < 0) {
      return;
    }
    
    // Validate image URL
    const imageUrl = newVariation.image_url.trim();
    if (imageUrl && !isValidImageUrl(imageUrl)) {
      toast({
        title: 'URL inválida',
        description: 'A URL da imagem deve começar com http:// ou https://',
        variant: 'destructive',
      });
      return;
    }

    const variation: ProductVariation = {
      id: `temp-${Date.now()}-${Math.random()}`, // ID temporário único
      product_id: "",
      name,
      price,
      stock,
      description: newVariation.description.trim() || null,
      image_url: imageUrl || null,
      sku: null
    };

    onVariationsChange([...variations, variation]);
    
    // Limpar formulário
    setNewVariation({ name: "", price: "", stock: "", description: "", image_url: "" });
  };

  /**
   * Atualiza uma variação existente
   */
  const updateVariation = (variationId: string, field: keyof ProductVariation, value: any) => {
    // Validate image URL when updating
    if (field === 'image_url' && value && !isValidImageUrl(value)) {
      toast({
        title: 'URL inválida',
        description: 'A URL da imagem deve começar com http:// ou https://',
        variant: 'destructive',
      });
      return;
    }
    
    const updated = variations.map((v) => {
      if (v.id !== variationId) return v;
      
      // Validações básicas
      if (field === 'price') {
        const numValue = parseFloat(value);
        if (isNaN(numValue) || numValue < 0) return v;
        return { ...v, [field]: numValue };
      }
      
      if (field === 'stock') {
        const numValue = parseInt(value);
        if (isNaN(numValue) || numValue < 0) return v;
        return { ...v, [field]: numValue };
      }
      
      if (field === 'name' && typeof value === 'string') {
        if (!value.trim()) return v;
        return { ...v, [field]: value };
      }
      
      return { ...v, [field]: value };
    });
    
    onVariationsChange(updated);
  };

  /**
   * Remove uma variação da lista
   */
  const removeVariation = (variationId: string) => {
    onVariationsChange(variations.filter((v) => v.id !== variationId));
  };

  const isFormValid = () => {
    const name = newVariation.name.trim();
    const price = parseFloat(newVariation.price);
    const stock = parseInt(newVariation.stock);
    
    return name && !isNaN(price) && price > 0 && !isNaN(stock) && stock >= 0;
  };

  return (
    <div className="space-y-4 border-t pt-4">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-lg font-semibold">Variações do Produto</Label>
          <p className="text-sm text-muted-foreground mt-1">
            Opcional: Crie variações com preços e estoques diferentes
          </p>
        </div>
        {variations.length > 0 && (
          <Badge variant="secondary">
            {variations.length} {variations.length === 1 ? 'variação' : 'variações'}
          </Badge>
        )}
      </div>
      
      {/* Lista de variações existentes */}
      {variations.length > 0 && (
        <div className="space-y-2">
          {variations
            .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
            .map((variation) => (
              <Card key={variation.id} className="p-4 bg-accent/20">
                <div className="flex items-start gap-3">
                  <div className="flex-1 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <Label htmlFor={`name-${variation.id}`} className="text-xs">
                          Nome *
                        </Label>
                        <Input
                          id={`name-${variation.id}`}
                          value={variation.name}
                          onChange={(e) => updateVariation(variation.id, 'name', e.target.value)}
                          placeholder="Ex: Tamanho M"
                        />
                      </div>
                      <div>
                        <Label htmlFor={`price-${variation.id}`} className="text-xs">
                          Preço (R$) *
                        </Label>
                        <Input
                          id={`price-${variation.id}`}
                          type="number"
                          step="0.01"
                          min="0.01"
                          value={variation.price}
                          onChange={(e) => updateVariation(variation.id, 'price', e.target.value)}
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <Label htmlFor={`stock-${variation.id}`} className="text-xs">
                          Estoque *
                        </Label>
                        <Input
                          id={`stock-${variation.id}`}
                          type="number"
                          min="0"
                          value={variation.stock}
                          onChange={(e) => updateVariation(variation.id, 'stock', e.target.value)}
                          placeholder="0"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <Label htmlFor={`desc-${variation.id}`} className="text-xs">
                          Descrição (opcional)
                        </Label>
                        <Input
                          id={`desc-${variation.id}`}
                          value={variation.description || ''}
                          onChange={(e) => updateVariation(variation.id, 'description', e.target.value)}
                          placeholder="Ex: Ideal para uso diário"
                        />
                      </div>
                      <div>
                        <Label htmlFor={`img-${variation.id}`} className="text-xs">
                          URL da Imagem (opcional)
                        </Label>
                        <Input
                          id={`img-${variation.id}`}
                          value={variation.image_url || ''}
                          onChange={(e) => updateVariation(variation.id, 'image_url', e.target.value)}
                          placeholder="https://..."
                        />
                      </div>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeVariation(variation.id)}
                    className="mt-5 text-destructive hover:text-destructive hover:bg-destructive/10"
                    title="Remover variação"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </Card>
            ))}
        </div>
      )}

      {/* Formulário para adicionar nova variação */}
      <Card className="p-4 bg-primary/5 border-primary/20">
        <div className="space-y-4">
          <Label className="font-medium">Adicionar Nova Variação</Label>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label htmlFor="new-var-name" className="text-xs">
                Nome *
              </Label>
              <Input
                id="new-var-name"
                placeholder="Ex: Tamanho M"
                value={newVariation.name}
                onChange={(e) => setNewVariation({ ...newVariation, name: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="new-var-price" className="text-xs">
                Preço (R$) *
              </Label>
              <Input
                id="new-var-price"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={newVariation.price}
                onChange={(e) => setNewVariation({ ...newVariation, price: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="new-var-stock" className="text-xs">
                Estoque *
              </Label>
              <Input
                id="new-var-stock"
                type="number"
                min="0"
                placeholder="0"
                value={newVariation.stock}
                onChange={(e) => setNewVariation({ ...newVariation, stock: e.target.value })}
              />
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label htmlFor="new-var-description" className="text-xs">
                Descrição (opcional)
              </Label>
              <Input
                id="new-var-description"
                placeholder="Ex: Ideal para uso diário"
                value={newVariation.description}
                onChange={(e) => setNewVariation({ ...newVariation, description: e.target.value })}
              />
            </div>
            <div>
              <Label htmlFor="new-var-image" className="text-xs">
                URL da Imagem (opcional)
              </Label>
              <Input
                id="new-var-image"
                placeholder="https://..."
                value={newVariation.image_url}
                onChange={(e) => setNewVariation({ ...newVariation, image_url: e.target.value })}
              />
            </div>
          </div>
          
          <Button
            type="button"
            onClick={addVariation}
            disabled={!isFormValid()}
            className="w-full"
            variant={isFormValid() ? "default" : "secondary"}
          >
            <Plus className="h-4 w-4 mr-2" />
            Adicionar Variação
          </Button>
        </div>
      </Card>

      <p className="text-xs text-muted-foreground">
        💡 Dica: Se o produto não tiver variações, use os campos de preço e estoque principais.
      </p>
    </div>
  );
}
