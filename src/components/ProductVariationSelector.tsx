import { useState, useEffect } from "react";
import { ProductVariation } from "@/types/product";
import { Label } from "./ui/label";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Badge } from "./ui/badge";

interface ProductVariationSelectorProps {
  variations: ProductVariation[];
  basePrice: number;
  onVariationSelect: (variation: ProductVariation | null) => void;
}

export function ProductVariationSelector({ 
  variations, 
  basePrice, 
  onVariationSelect 
}: ProductVariationSelectorProps) {
  const [selectedVariation, setSelectedVariation] = useState<ProductVariation | null>(null);

  // Agrupar variações por tipo (name)
  const groupedVariations = variations.reduce((acc, variation) => {
    if (!acc[variation.name]) {
      acc[variation.name] = [];
    }
    acc[variation.name].push(variation);
    return acc;
  }, {} as Record<string, ProductVariation[]>);

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
    <div className="space-y-6">
      {Object.entries(groupedVariations).map(([variationType, varList]) => (
        <div key={variationType} className="space-y-3">
          <Label className="text-base font-semibold">{variationType}</Label>
          <RadioGroup
            value={selectedVariation?.id || ""}
            onValueChange={handleVariationChange}
          >
            <div className="grid grid-cols-3 gap-3 w-full">
              {varList.map((variation) => {
                const finalPrice = basePrice + variation.price_adjustment;
                const isOutOfStock = variation.stock === 0;
                const isSelected = selectedVariation?.id === variation.id;

                return (
                  <div key={variation.id} className="relative">
                    <label
                      htmlFor={variation.id}
                      className={`
                        flex flex-col p-3 border rounded-lg cursor-pointer
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
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{variation.value}</div>
                          {isOutOfStock && (
                            <Badge variant="destructive" className="text-xs mt-1">
                              Esgotado
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="text-sm text-muted-foreground">
                        R$ {finalPrice.toFixed(2)}
                        {variation.price_adjustment !== 0 && (
                          <span className="text-xs ml-1">
                            ({variation.price_adjustment > 0 ? '+' : ''}
                            {variation.price_adjustment.toFixed(2)})
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        Estoque: {variation.stock}
                      </div>
                    </label>
                  </div>
                );
              })}
            </div>
          </RadioGroup>
        </div>
      ))}

      {selectedVariation && (
        <div className="p-4 bg-accent/50 rounded-lg">
          <div className="flex justify-between items-center">
            <span className="font-medium">Variação selecionada:</span>
            <div className="text-right">
              <div className="font-semibold text-lg">
                {selectedVariation.name}: {selectedVariation.value}
              </div>
              <div className="text-sm text-muted-foreground">
                Preço: R$ {(basePrice + selectedVariation.price_adjustment).toFixed(2)}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
