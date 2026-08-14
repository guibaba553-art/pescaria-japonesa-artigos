import { useEffect, useState } from "react";
import { ProductVariation } from "@/types/product";
import { Label } from "./ui/label";
import { RadioGroup, RadioGroupItem } from "./ui/radio-group";
import { Badge } from "./ui/badge";
import { isPromoActive } from "@/utils/promoPrice";

interface ProductVariationSelectorProps {
  variations: ProductVariation[];
  onVariationSelect: (variation: ProductVariation | null) => void;
  productMinSalePrice?: number | null;
  /** Pré-seleciona uma variação (ex.: vindo da busca com ?variacao=) */
  initialVariationId?: string | null;
}


// Preço exibido no site: prioriza promoção ativa da variação, depois min_sale_price
// da variação, depois min_sale_price do produto pai, e por fim cai no price (PDV).
export const sitePriceForVariation = (
  variation: ProductVariation,
  productMinSalePrice?: number | null
) => {
  if (isPromoActive(variation as any)) {
    return Number((variation as any).sale_price);
  }
  const vMin = Number((variation as any).min_sale_price) || 0;
  if (vMin > 0) return vMin;
  const pMin = Number(productMinSalePrice) || 0;
  if (pMin > 0) return pMin;
  return variation.price;
};

export function ProductVariationSelector({ 
  variations, 
  onVariationSelect,
  productMinSalePrice,
  initialVariationId,
}: ProductVariationSelectorProps) {
  const [selectedVariation, setSelectedVariation] = useState<ProductVariation | null>(null);

  // Pré-seleção via prop (ex.: link da busca apontando para uma variação)
  useEffect(() => {
    if (!initialVariationId) return;
    if (selectedVariation?.id === initialVariationId) return;
    const found = variations.find((v) => v.id === initialVariationId);
    if (found && found.stock > 0) {
      setSelectedVariation(found);
      onVariationSelect(found);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialVariationId, variations]);


  // Ordenar variações: primeiro as em estoque (alfabético), depois as esgotadas (alfabético)
  const sortedVariations = [...variations].sort((a, b) => {
    const aOutOfStock = a.stock === 0;
    const bOutOfStock = b.stock === 0;
    
    if (aOutOfStock && !bOutOfStock) return 1;
    if (!aOutOfStock && bOutOfStock) return -1;
    
    return a.name.localeCompare(b.name, 'pt-BR');
  });

  const handleVariationChange = (variationId: string) => {
    const variation = variations.find(v => v.id === variationId);
    
    // Não permitir selecionar variações esgotadas
    if (variation && variation.stock === 0) {
      return;
    }
    
    setSelectedVariation(variation || null);
    
    // Chamar callback imediatamente
    onVariationSelect(variation || null);
    
    console.log('🔄 Variação selecionada:', variation?.name);
    console.log('📸 Imagem da variação:', variation?.image_url || 'sem imagem');
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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 w-full">
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
                    {(() => {
                      const promo = isPromoActive(variation as any);
                      const sitePrice = sitePriceForVariation(variation, productMinSalePrice);
                      const basePrice = Number((variation as any).min_sale_price) || Number(productMinSalePrice) || variation.price;
                      const showStrike = promo && basePrice > sitePrice;
                      const off = showStrike ? Math.round(((basePrice - sitePrice) / basePrice) * 100) : 0;
                      return (
                        <>
                          {showStrike && (
                            <div className="text-xs line-through text-muted-foreground leading-none">
                              R$ {basePrice.toFixed(2).replace('.', ',')}
                            </div>
                          )}
                          <div className="flex items-baseline gap-2">
                            <div className="text-lg font-semibold text-primary">
                              R$ {sitePrice.toFixed(2).replace('.', ',')}
                            </div>
                            {showStrike && (
                              <span className="text-[10px] font-bold text-primary uppercase">
                                {off}% OFF
                              </span>
                            )}
                          </div>
                          {promo && (
                            <Badge className="text-[10px] bg-primary text-primary-foreground hover:bg-primary">
                              Em promoção
                            </Badge>
                          )}
                        </>
                      );
                    })()}
                    {isOutOfStock && (
                      <div className="text-xs text-muted-foreground">
                        <Badge variant="destructive" className="text-xs">
                          Esgotado
                        </Badge>
                      </div>
                    )}
                  </div>
                </label>
              </div>
            );
          })}
        </div>
      </RadioGroup>

      {!selectedVariation && variations.some(v => v.stock > 0) && (
        <div className="p-4 bg-yellow-100 dark:bg-yellow-900/20 rounded-md border border-yellow-300 dark:border-yellow-700">
          <p className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
            ⚠️ Por favor, selecione uma variação para continuar
          </p>
        </div>
      )}

    </div>
  );
}
