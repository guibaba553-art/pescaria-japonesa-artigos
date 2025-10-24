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
    <div className="space-y-4">
      {Object.entries(groupedVariations).map(([variationType, varList]) => (
        <div key={variationType} className="space-y-3">
          <Label className="text-base font-semibold">{variationType}</Label>
          <RadioGroup
            value={selectedVariation?.id || ""}
            onValueChange={handleVariationChange}
          >
            <div className="grid grid-cols-5 gap-2">
              {varList.map((variation) => {
                const isOutOfStock = variation.stock === 0;
                const isSelected = selectedVariation?.id === variation.id;

                return (
                  <label
                    key={variation.id}
                    htmlFor={variation.id}
                    className={`
                      relative flex items-center justify-center p-3 border rounded-lg cursor-pointer
                      transition-all hover:border-primary text-center min-h-[48px]
                      ${isSelected ? 'border-primary border-2 bg-primary/5' : 'border-border'}
                      ${isOutOfStock ? 'opacity-40 cursor-not-allowed' : ''}
                    `}
                  >
                    <RadioGroupItem
                      value={variation.id}
                      id={variation.id}
                      disabled={isOutOfStock}
                      className="sr-only"
                    />
                    <div className={`font-medium ${isOutOfStock ? 'line-through' : ''}`}>
                      {variation.value}
                    </div>
                    {isOutOfStock && (
                      <div className="absolute top-1 right-1">
                        <div className="w-4 h-4 rounded-full bg-muted flex items-center justify-center">
                          <span className="text-[8px]">✕</span>
                        </div>
                      </div>
                    )}
                  </label>
                );
              })}
            </div>
          </RadioGroup>
          {selectedVariation && (
            <div className="text-sm text-muted-foreground">
              Selecionado: <span className="font-medium text-foreground">{selectedVariation.value}</span>
              {selectedVariation.price_adjustment !== 0 && (
                <span className="ml-2">
                  ({selectedVariation.price_adjustment > 0 ? '+' : ''}
                  R$ {Math.abs(selectedVariation.price_adjustment).toFixed(2)})
                </span>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
