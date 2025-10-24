import { useState, useEffect } from "react";
import { ProductVariation } from "@/types/product";
import { Label } from "./ui/label";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Badge } from "./ui/badge";

interface ProductVariationSelectorProps {
  variations: ProductVariation[];
  onVariationSelect: (variation: ProductVariation | null) => void;
}

export function ProductVariationSelector({ 
  variations, 
  onVariationSelect 
}: ProductVariationSelectorProps) {
  const [selectedVariation, setSelectedVariation] = useState<ProductVariation | null>(null);

  // Ordenar variações alfabeticamente pelo nome
  const sortedVariations = [...variations].sort((a, b) => 
    a.name.localeCompare(b.name, 'pt-BR')
  );

  useEffect(() => {
    onVariationSelect(selectedVariation);
  }, [selectedVariation, onVariationSelect]);

  const handleVariationChange = (variationId: string) => {
    const variation = variations.find(v => v.id === variationId);
    setSelectedVariation(variation || null);
  };

  if (variations.length === 0) {
    return null;
  }

  return (
    <div className="space-y-4">
      <Label className="text-sm font-semibold">Selecione uma variação</Label>
      <RadioGroup
        value={selectedVariation?.id || ""}
        onValueChange={handleVariationChange}
      >
        <div className="grid grid-cols-2 gap-2 w-full">
          {sortedVariations.map((variation) => {
            const isOutOfStock = variation.stock === 0;
            const isSelected = selectedVariation?.id === variation.id;

            return (
              <div key={variation.id} className="relative">
                <label
                  htmlFor={variation.id}
                  className={`
                    flex flex-col p-3 border rounded-md cursor-pointer
                    transition-all hover:border-primary w-full
                    ${isSelected ? 'border-primary bg-primary/5' : 'border-border'}
                    ${isOutOfStock ? 'opacity-50 cursor-not-allowed' : ''}
                  `}
                >
                  <div className="flex items-start gap-2 mb-2">
                    <RadioGroupItem
                      value={variation.id}
                      id={variation.id}
                      disabled={isOutOfStock}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{variation.name}</div>
                      {variation.description && (
                        <div className="text-xs text-muted-foreground mt-1">
                          {variation.description}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="pl-6 space-y-1">
                    <div className="text-lg font-semibold text-primary">
                      R$ {variation.price.toFixed(2)}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {isOutOfStock ? (
                        <Badge variant="destructive" className="text-xs">
                          Esgotado
                        </Badge>
                      ) : (
                        `Estoque: ${variation.stock}`
                      )}
                    </div>
                  </div>
                </label>
              </div>
            );
          })}
        </div>
      </RadioGroup>

      {selectedVariation && (
        <div className="p-4 bg-accent/50 rounded-md">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="font-medium">Selecionado:</span>
              <div className="text-right">
                <div className="font-semibold">
                  {selectedVariation.name}
                </div>
                <div className="text-lg font-bold text-primary">
                  R$ {selectedVariation.price.toFixed(2)}
                </div>
              </div>
            </div>
            {selectedVariation.description && (
              <p className="text-sm text-muted-foreground mt-2">
                {selectedVariation.description}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
