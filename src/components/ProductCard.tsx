import { useNavigate } from 'react-router-dom';
import { ShoppingCart, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Product } from '@/types/product';
import { ProductQuantitySelector } from './ProductQuantitySelector';

interface ProductCardProps {
  product: Product;
  quantity: number;
  onQuantityChange: (quantity: number) => void;
  onIncrement: () => void;
  onDecrement: () => void;
  onAddToCart: () => void;
  showDescription?: boolean;
  variant?: 'default' | 'compact';
}

/**
 * Card de produto comercial — preço grande, parcelamento, frete grátis.
 * Mantém identidade JAPAS (laranja) com gatilhos de conversão.
 */
export function ProductCard({
  product,
  quantity,
  onQuantityChange,
  onIncrement,
  onDecrement,
  onAddToCart,
  showDescription = true,
}: ProductCardProps) {
  const navigate = useNavigate();

  const handleCardClick = () => {
    navigate(`/produto/${product.id}`);
  };

  const hasVariations = product.variations && product.variations.length > 0;
  const isOnSale = product.on_sale && product.sale_price;
  const finalPrice = isOnSale ? product.sale_price! : product.price;
  const discount = isOnSale
    ? Math.round(((product.price - product.sale_price!) / product.price) * 100)
    : 0;

  // 10x sem juros (para conversão)
  const installment = finalPrice / 10;
  const showInstallment = finalPrice >= 50; // só mostra parcelamento acima de R$50
  // Frete grátis acima de R$199
  const freeShipping = finalPrice >= 199;
  // PIX 5% off
  const pixPrice = finalPrice * 0.95;

  const formatPrice = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;

  return (
    <article
      className="group relative flex flex-col bg-card rounded-2xl border border-border overflow-hidden hover:border-primary/40 hover:shadow-md transition-all duration-300 cursor-pointer"
      onClick={handleCardClick}
      role="link"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          handleCardClick();
        }
      }}
    >
      {/* Image */}
      <div className="relative overflow-hidden aspect-square bg-muted/40">
        <img
          src={product.image_url || 'https://placehold.co/600x600/f5f5f5/cccccc?text=Sem+imagem'}
          alt={product.name}
          loading="lazy"
          className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
        />

        {/* Discount badge */}
        {isOnSale && discount > 0 && (
          <div className="absolute top-2 left-2">
            <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-primary text-primary-foreground text-xs font-black tracking-tight shadow-md">
              −{discount}%
            </span>
          </div>
        )}

        {/* Stock warning */}
        {product.stock > 0 && product.stock <= 5 && (
          <div className="absolute top-2 right-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-foreground/90 backdrop-blur-sm text-background text-[10px] font-semibold uppercase tracking-wider">
              Últimas {product.stock}
            </span>
          </div>
        )}

        {product.stock === 0 && (
          <div className="absolute inset-0 bg-background/85 backdrop-blur-sm flex items-center justify-center">
            <span className="px-4 py-1.5 rounded-md bg-foreground text-background text-xs font-bold uppercase tracking-wider">
              Esgotado
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col p-3 sm:p-4">
        {/* Title */}
        <h3 className="text-sm sm:text-[15px] font-medium text-foreground leading-snug mb-2 line-clamp-2 min-h-[2.6em]">
          {product.name}
        </h3>

        {/* Price block */}
        <div className="space-y-0.5 mb-3">
          {hasVariations ? (
            <div className="text-base sm:text-lg font-display font-bold text-foreground">
              A partir de {formatPrice(finalPrice)}
            </div>
          ) : (
            <>
              {isOnSale && (
                <div className="text-xs text-muted-foreground line-through leading-none">
                  {formatPrice(product.price)}
                </div>
              )}
              <div className="flex items-baseline gap-1.5 flex-wrap">
                <span className="text-xl sm:text-2xl font-display font-black text-primary leading-none tracking-tight">
                  {formatPrice(finalPrice)}
                </span>
                {isOnSale && discount > 0 && (
                  <span className="text-[11px] font-bold text-primary">
                    {discount}% OFF
                  </span>
                )}
              </div>

              {showInstallment && (
                <div className="text-xs text-muted-foreground">
                  ou <span className="font-semibold text-foreground">10x de {formatPrice(installment)}</span> sem juros
                </div>
              )}

              <div className="text-xs text-success font-semibold">
                {formatPrice(pixPrice)} no PIX
              </div>
            </>
          )}
        </div>

        {/* Free shipping */}
        {freeShipping && !hasVariations && (
          <div className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-success-soft text-success text-[10px] font-bold uppercase tracking-wide mb-3 self-start">
            <Truck className="w-3 h-3" />
            Frete grátis
          </div>
        )}

        {/* CTA */}
        <div className="mt-auto pt-1">
          {product.stock === 0 ? (
            <Button className="w-full rounded-lg" disabled size="sm">
              Indisponível
            </Button>
          ) : hasVariations ? (
            <Button
              className="w-full rounded-lg btn-press font-bold"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleCardClick();
              }}
            >
              Ver opções
            </Button>
          ) : (
            <div className="flex items-center gap-1.5 w-full min-w-0" onClick={(e) => e.stopPropagation()}>
              {/* Compact quantity selector — same height as Buy button (h-9) */}
              <div className="flex items-center h-9 rounded-lg border border-border bg-background overflow-hidden flex-shrink-0">
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDecrement(); }}
                  disabled={quantity <= 1}
                  className="h-full w-7 flex items-center justify-center text-foreground hover:bg-muted disabled:opacity-40 transition-colors"
                  aria-label="Diminuir"
                >
                  <span className="text-base font-bold leading-none">−</span>
                </button>
                <input
                  type="number"
                  min={1}
                  max={product.stock}
                  value={quantity}
                  onChange={(e) => {
                    const v = parseInt(e.target.value);
                    if (isNaN(v) || v < 1) return onQuantityChange(1);
                    if (v > product.stock) return onQuantityChange(product.stock);
                    onQuantityChange(v);
                  }}
                  className="h-full w-8 text-center text-sm font-semibold bg-transparent border-0 outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                />
                <button
                  type="button"
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onIncrement(); }}
                  disabled={quantity >= product.stock}
                  className="h-full w-7 flex items-center justify-center text-foreground hover:bg-muted disabled:opacity-40 transition-colors"
                  aria-label="Aumentar"
                >
                  <span className="text-base font-bold leading-none">+</span>
                </button>
              </div>
              <Button
                className="flex-1 min-w-0 h-9 rounded-lg btn-press font-bold px-2"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddToCart();
                }}
                disabled={product.stock === 0}
              >
                <ShoppingCart className="w-3.5 h-3.5 shrink-0 sm:mr-1.5" />
                <span className="hidden sm:inline truncate">Comprar</span>
              </Button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
