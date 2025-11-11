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
    image_url: "",
    sku: ""
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

    const variation: ProductVariation = {
      id: `temp-${Date.now()}-${Math.random()}`, // ID temporário único
      product_id: "",
      name,
      price,
      stock,
      description: newVariation.description.trim() || null,
      image_url: newVariation.image_url.trim() || null,
      sku: newVariation.sku.trim() || null
    };

    onVariationsChange([...variations, variation]);
    
    // Limpar formulário
    setNewVariation({ name: "", price: "", stock: "", description: "", image_url: "", sku: "" });
  };

  /**
   * Atualiza uma variação existente
   */
  const updateVariation = (variationId: string, field: keyof ProductVariation, value: any) => {
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
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <Label htmlFor={`sku-${variation.id}`} className="text-xs">
                          Código de Barra / SKU
                        </Label>
                        <Input
                          id={`sku-${variation.id}`}
                          type="text"
                          value={variation.sku || ''}
                          onChange={(e) => updateVariation(variation.id, 'sku', e.target.value)}
                          placeholder="Ex: 7891234567890"
                          autoComplete="off"
                          maxLength={50}
                        />
                      </div>
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
                          Imagem da Variação {!variation.image_url && <Badge variant="outline" className="ml-2 text-xs">Sem imagem</Badge>}
                        </Label>
                        <Input
                          id={`img-${variation.id}`}
                          type="file"
                          accept=".jpg,.jpeg,.png"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              if (!file.type.match(/^image\/(jpeg|jpg|png)$/)) {
                                toast({
                                  title: 'Formato inválido',
                                  description: 'Apenas arquivos JPG e PNG são aceitos',
                                  variant: 'destructive',
                                });
                                return;
                              }
                              const reader = new FileReader();
                              reader.onloadend = () => {
                                updateVariation(variation.id, 'image_url', reader.result as string);
                                toast({
                                  title: 'Imagem carregada!',
                                  description: 'Lembre-se de clicar em "Salvar" para aplicar as mudanças.',
                                });
                              };
                              reader.readAsDataURL(file);
                            }
                          }}
                        />
                        {variation.image_url && (
                          <div className="mt-2 relative">
                            <img 
                              src={variation.image_url} 
                              alt="Preview" 
                              className="max-h-32 w-auto object-contain rounded border-2 border-primary"
                            />
                            <Button
                              type="button"
                              variant="destructive"
                              size="icon"
                              className="absolute -top-2 -right-2 h-6 w-6"
                              onClick={() => updateVariation(variation.id, 'image_url', null)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
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
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <Label htmlFor="new-var-sku" className="text-xs">
                Código de Barra / SKU
              </Label>
              <Input
                id="new-var-sku"
                type="text"
                placeholder="Ex: 7891234567890"
                value={newVariation.sku}
                onChange={(e) => setNewVariation({ ...newVariation, sku: e.target.value })}
                autoComplete="off"
                maxLength={50}
              />
            </div>
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
                Imagem (opcional - JPG/PNG)
              </Label>
              <Input
                id="new-var-image"
                type="file"
                accept=".jpg,.jpeg,.png"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    if (!file.type.match(/^image\/(jpeg|jpg|png)$/)) {
                      toast({
                        title: 'Formato inválido',
                        description: 'Apenas arquivos JPG e PNG são aceitos',
                        variant: 'destructive',
                      });
                      return;
                    }
                    const reader = new FileReader();
                    reader.onloadend = () => {
                      setNewVariation({ ...newVariation, image_url: reader.result as string });
                      toast({
                        title: 'Imagem carregada!',
                        description: 'Pronto para adicionar a variação.',
                      });
                    };
                    reader.readAsDataURL(file);
                  }
                }}
              />
              {newVariation.image_url && (
                <div className="mt-2 relative">
                  <img 
                    src={newVariation.image_url} 
                    alt="Preview" 
                    className="max-h-32 w-auto object-contain rounded border-2 border-primary"
                  />
                  <Button
                    type="button"
                    variant="destructive"
                    size="icon"
                    className="absolute -top-2 -right-2 h-6 w-6"
                    onClick={() => setNewVariation({ ...newVariation, image_url: '' })}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              )}
            </div>
          </div>
          
          <p className="text-xs text-muted-foreground">
            💡 O código de barra pode ser usado para leitura no PDV e pesquisa rápida
          </p>
          
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
