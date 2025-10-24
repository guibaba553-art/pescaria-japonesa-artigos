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

  // Agrupar variações por tipo (name) e ordenar alfabeticamente
  const groupedVariations = variations.reduce((acc, variation) => {
    if (!acc[variation.name]) {
      acc[variation.name] = [];
    }
    acc[variation.name].push(variation);
    return acc;
  }, {} as Record<string, ProductVariation[]>);

  // Ordenar cada grupo alfabeticamente pelo valor
  Object.keys(groupedVariations).forEach(key => {
    groupedVariations[key].sort((a, b) => a.value.localeCompare(b.value, 'pt-BR', { numeric: true }));
  });

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
        <div key={variationType} className="space-y-2">
          <Label className="text-sm font-semibold">{variationType}</Label>
          <RadioGroup
            value={selectedVariation?.id || ""}
            onValueChange={handleVariationChange}
          >
            <div className="grid grid-cols-3 gap-2 w-full">
              {varList.map((variation) => {
                const finalPrice = basePrice + variation.price_adjustment;
                const isOutOfStock = variation.stock === 0;
                const isSelected = selectedVariation?.id === variation.id;

                return (
                  <div key={variation.id} className="relative">
                    <label
                      htmlFor={variation.id}
                      className={`
                        flex flex-col p-2 border rounded-md cursor-pointer text-sm
                        transition-all hover:border-primary w-full
                        ${isSelected ? 'border-primary bg-primary/5' : 'border-border'}
                        ${isOutOfStock ? 'opacity-50 cursor-not-allowed' : ''}
                      `}
                    >
                      <div className="flex items-start gap-1.5 mb-1">
                        <RadioGroupItem
                          value={variation.id}
                          id={variation.id}
                          disabled={isOutOfStock}
                          className="mt-0.5 h-4 w-4"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{variation.value}</div>
                          {variation.description && (
                            <div className="text-[10px] text-muted-foreground mt-0.5">
                              {variation.description}
                            </div>
                          )}
                          {isOutOfStock && (
                            <Badge variant="destructive" className="text-[10px] h-4 px-1 mt-0.5">
                              Esgotado
                            </Badge>
                          )}
                        </div>
                      </div>
                      <div className="text-xs text-muted-foreground pl-5">
                        R$ {finalPrice.toFixed(2)}
                        {variation.price_adjustment !== 0 && (
                          <span className="text-[10px] ml-1">
                            ({variation.price_adjustment > 0 ? '+' : ''}
                            {variation.price_adjustment.toFixed(2)})
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-muted-foreground pl-5">
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
        <div className="p-3 bg-accent/50 rounded-md">
          <div className="space-y-1">
            <div className="flex justify-between items-center">
              <span className="font-medium text-sm">Selecionado:</span>
              <div className="text-right">
                <div className="font-semibold text-sm">
                  {selectedVariation.name}: {selectedVariation.value}
                </div>
                <div className="text-xs text-muted-foreground">
                  R$ {(basePrice + selectedVariation.price_adjustment).toFixed(2)}
                </div>
              </div>
            </div>
            {selectedVariation.description && (
              <p className="text-xs text-muted-foreground mt-2">
                {selectedVariation.description}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
