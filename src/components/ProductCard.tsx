import { useNavigate } from 'react-router-dom';
import { ShoppingCart } from 'lucide-react';
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
 * Card de produto minimalista premium estilo Apple.
 * Foco na imagem, tipografia limpa, hierarquia clara.
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

  const formatPrice = (v: number) => `R$ ${v.toFixed(2).replace('.', ',')}`;

  const renderPrice = () => {
    if (hasVariations) {
      return (
        <span className="text-sm font-medium text-muted-foreground">
          A partir de variações
        </span>
      );
    }

    if (isOnSale) {
      return (
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-xl sm:text-2xl font-display font-bold text-foreground tracking-tight">
            {formatPrice(finalPrice)}
          </span>
          <span className="text-sm line-through text-muted-foreground">
            {formatPrice(product.price)}
          </span>
        </div>
      );
    }

    return (
      <span className="text-xl sm:text-2xl font-display font-bold text-foreground tracking-tight">
        {formatPrice(finalPrice)}
      </span>
    );
  };

  return (
    <article
      className="group relative flex flex-col bg-card rounded-3xl border border-border/60 overflow-hidden hover-lift cursor-pointer"
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
          className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.06]"
        />

        {/* Badges */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5">
          {isOnSale && discount > 0 && (
            <span className="px-2.5 py-1 rounded-full bg-foreground text-background text-[11px] font-semibold tracking-wide">
              −{discount}%
            </span>
          )}
          {product.stock > 0 && product.stock <= 5 && (
            <span className="px-2.5 py-1 rounded-full bg-background/95 backdrop-blur-sm text-foreground text-[11px] font-medium border border-border">
              Últimas {product.stock}
            </span>
          )}
        </div>

        {product.stock === 0 && (
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm flex items-center justify-center">
            <span className="px-4 py-1.5 rounded-full bg-foreground text-background text-xs font-semibold uppercase tracking-wider">
              Esgotado
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col p-5 sm:p-6">
        <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider mb-2">
          {product.category}
        </p>

        <h3 className="font-display font-semibold text-base sm:text-lg text-foreground leading-snug mb-2 line-clamp-2">
          {product.name}
        </h3>

        {showDescription && (product.short_description || product.description) && (
          <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
            {product.short_description || product.description}
          </p>
        )}

        <div className="mt-auto pt-4 space-y-3">
          {renderPrice()}

          {product.stock === 0 ? (
            <Button className="w-full rounded-full" disabled>
              Indisponível
            </Button>
          ) : hasVariations ? (
            <Button
              className="w-full rounded-full btn-press"
              onClick={(e) => {
                e.stopPropagation();
                handleCardClick();
              }}
            >
              Ver opções
            </Button>
          ) : (
            <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <ProductQuantitySelector
                quantity={quantity}
                maxQuantity={product.stock}
                onIncrement={onIncrement}
                onDecrement={onDecrement}
                onChange={onQuantityChange}
                size="sm"
              />
              <Button
                className="flex-1 rounded-full btn-press"
                onClick={(e) => {
                  e.stopPropagation();
                  onAddToCart();
                }}
                disabled={product.stock === 0}
              >
                <ShoppingCart className="w-4 h-4 sm:mr-2" />
                <span className="hidden sm:inline">Comprar</span>
              </Button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
