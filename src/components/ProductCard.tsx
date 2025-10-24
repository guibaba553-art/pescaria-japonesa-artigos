import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Star, ShoppingCart } from 'lucide-react';
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
 * Componente reutilizável de card de produto
 * Exibe informações do produto e controles de quantidade/compra
 */
export function ProductCard({
  product,
  quantity,
  onQuantityChange,
  onIncrement,
  onDecrement,
  onAddToCart,
  showDescription = true,
  variant = 'default'
}: ProductCardProps) {
  const navigate = useNavigate();

  const handleImageClick = () => {
    navigate(`/produto/${product.id}`);
  };

  const renderPrice = () => {
    // Se produto em promoção, mostrar preço promocional
    if (product.on_sale && product.sale_price) {
      return (
        <div className="flex flex-col">
          <span className="text-sm line-through text-muted-foreground">
            R$ {product.price.toFixed(2)}
          </span>
          <span className="text-2xl font-bold text-red-600">
            R$ {product.sale_price.toFixed(2)}
          </span>
          {product.sale_ends_at && new Date(product.sale_ends_at) > new Date() && (
            <span className="text-xs text-muted-foreground">
              Até {new Date(product.sale_ends_at).toLocaleDateString('pt-BR')}
            </span>
          )}
        </div>
      );
    }

    // Preço normal do produto
    return (
      <span className="text-2xl font-bold text-primary">
        R$ {product.price?.toFixed(2) || '0.00'}
      </span>
    );
  };

  const renderRating = () => (
    <div className="flex items-center gap-1">
      {[...Array(5)].map((_, i) => (
        <Star
          key={i}
          className={`w-4 h-4 ${
            i < Math.floor(product.rating)
              ? "fill-primary text-primary"
              : "text-muted"
          }`}
        />
      ))}
      <span className="text-sm text-muted-foreground ml-2">
        ({product.rating.toFixed(1)})
      </span>
    </div>
  );

  return (
    <Card className="group overflow-hidden border-2 border-border hover:border-primary/70 transition-all duration-500 hover:shadow-[0_8px_40px_rgba(14,165,233,0.25)] hover:-translate-y-2 bg-card">
      <CardContent className="p-0">
        {/* Imagem do Produto */}
        <div 
          className="relative overflow-hidden aspect-square cursor-pointer bg-gradient-to-br from-muted/30 to-muted/10"
          onClick={handleImageClick}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500 z-10" />
          <img
            src={product.image_url || 'https://placehold.co/600x600?text=Sem+Imagem'}
            alt={product.name}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-125"
          />
          <div className="absolute top-4 left-4 bg-gradient-to-r from-primary to-primary-glow text-primary-foreground px-4 py-2 rounded-full text-xs font-bold shadow-lg backdrop-blur-sm border border-white/20">
            {product.category}
          </div>
          {product.on_sale && (
            <div className="absolute top-4 right-4 bg-gradient-to-r from-red-600 to-red-500 text-white px-4 py-2 rounded-full text-xs font-bold animate-pulse shadow-xl border border-white/30">
              🏷️ PROMOÇÃO
            </div>
          )}
        </div>
        
        {/* Informações do Produto */}
        <div className="p-6 space-y-4 bg-gradient-to-br from-card to-muted/10">
          {renderRating()}
          
          <h3 className="font-bold text-xl group-hover:text-primary transition-colors duration-300">{product.name}</h3>
          
          {showDescription && (
            <p className="text-sm text-muted-foreground line-clamp-2">
              {product.short_description || product.description}
            </p>
          )}
          
          {/* Preço e Controles */}
          <div className="space-y-3">
            {renderPrice()}
            
            {product.stock === 0 ? (
              <div className="space-y-2">
                <Button className="w-full" disabled>
                  Produto Esgotado
                </Button>
                <p className="text-sm text-center text-muted-foreground">
                  Este produto está temporariamente indisponível
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <ProductQuantitySelector
                  quantity={quantity}
                  maxQuantity={product.stock}
                  onIncrement={onIncrement}
                  onDecrement={onDecrement}
                  onChange={onQuantityChange}
                  size="sm"
                />
                <Button 
                  className="flex-1"
                  onClick={onAddToCart}
                  disabled={product.stock === 0}
                >
                  <ShoppingCart className="w-4 h-4 mr-2" />
                  Comprar
                </Button>
              </div>
            )}
            {product.stock > 0 && product.stock <= 5 && (
              <p className="text-sm text-orange-600 dark:text-orange-400 font-medium">
                ⚠️ Apenas {product.stock} {product.stock === 1 ? 'unidade disponível' : 'unidades disponíveis'}
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
