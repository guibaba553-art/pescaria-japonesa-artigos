import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { TableCell, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  category: string;
  image_url: string | null;
  images: string[];
  stock: number;
  rating: number;
  featured: boolean;
  on_sale: boolean;
  sale_price?: number;
  sale_ends_at?: string;
}

interface FeaturedProductRowProps {
  product: Product;
  onUpdate: () => void;
}

export function FeaturedProductRow({ product, onUpdate }: FeaturedProductRowProps) {
  const { toast } = useToast();
  const [showPromotion, setShowPromotion] = useState(product.on_sale);
  const [discountType, setDiscountType] = useState<'percent' | 'value'>('percent');
  const [discountPercent, setDiscountPercent] = useState(
    product.on_sale && product.sale_price 
      ? Math.round(((product.price - product.sale_price) / product.price) * 100)
      : 0
  );
  const [discountValue, setDiscountValue] = useState(
    product.on_sale && product.sale_price 
      ? product.price - product.sale_price
      : 0
  );
  const [saleEndDate, setSaleEndDate] = useState(
    product.sale_ends_at ? new Date(product.sale_ends_at).toISOString().split('T')[0] : ''
  );

  const calculateFinalPrice = () => {
    if (discountType === 'percent') {
      return product.price * (1 - discountPercent / 100);
    } else {
      return Math.max(0, product.price - discountValue);
    }
  };

  return (
    <TableRow>
      <TableCell>
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="w-16 h-16 object-cover rounded"
          />
        ) : (
          <div className="w-16 h-16 bg-muted rounded flex items-center justify-center text-xs">
            Sem imagem
          </div>
        )}
      </TableCell>
      <TableCell className="font-medium">{product.name}</TableCell>
      <TableCell>{product.category}</TableCell>
      <TableCell>
        {product.on_sale && product.sale_price ? (
          <div className="flex flex-col">
            <span className="line-through text-muted-foreground text-xs">
              R$ {product.price.toFixed(2)}
            </span>
            <span className="text-green-600 font-semibold">
              R$ {product.sale_price.toFixed(2)}
            </span>
          </div>
        ) : (
          <span>R$ {product.price.toFixed(2)}</span>
        )}
      </TableCell>
      <TableCell>
        <div className="space-y-2">
          <Button
            variant={showPromotion ? "default" : "outline"}
            size="sm"
            onClick={() => setShowPromotion(!showPromotion)}
          >
            {showPromotion ? '🏷️ Em Promoção' : 'Adicionar Promoção'}
          </Button>
          {showPromotion && (
            <div className="space-y-2 mt-2">
              <div className="flex gap-2 mb-2">
                <Button
                  variant={discountType === 'percent' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setDiscountType('percent')}
                  className="flex-1"
                >
                  Porcentagem %
                </Button>
                <Button
                  variant={discountType === 'value' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setDiscountType('value')}
                  className="flex-1"
                >
                  Valor R$
                </Button>
              </div>

              {discountType === 'percent' ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min="1"
                    max="99"
                    value={discountPercent}
                    onChange={(e) => setDiscountPercent(parseInt(e.target.value) || 0)}
                    className="w-20"
                  />
                  <span className="text-sm">% desconto</span>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm">R$</span>
                  <Input
                    type="number"
                    min="0"
                    max={product.price}
                    step="0.01"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(parseFloat(e.target.value) || 0)}
                    className="w-24"
                  />
                  <span className="text-sm">de desconto</span>
                </div>
              )}

              <Input
                type="date"
                value={saleEndDate}
                onChange={(e) => setSaleEndDate(e.target.value)}
                className="w-full"
              />
              <div className="text-sm text-muted-foreground">
                <div>Preço original: R$ {product.price.toFixed(2)}</div>
                <div className="font-semibold text-green-600">
                  Preço final: R$ {calculateFinalPrice().toFixed(2)}
                </div>
              </div>
              <Button
                size="sm"
                onClick={async () => {
                  const salePrice = calculateFinalPrice();
                  const { error } = await supabase
                    .from('products')
                    .update({ 
                      on_sale: true,
                      sale_price: salePrice,
                      sale_ends_at: saleEndDate ? new Date(saleEndDate).toISOString() : null
                    })
                    .eq('id', product.id);
                  
                  if (error) {
                    toast({
                      title: 'Erro ao aplicar promoção',
                      description: error.message,
                      variant: 'destructive'
                    });
                  } else {
                    toast({
                      title: 'Promoção aplicada com sucesso!',
                    });
                    onUpdate();
                  }
                }}
              >
                Aplicar Promoção
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const { error } = await supabase
                    .from('products')
                    .update({ 
                      on_sale: false,
                      sale_price: null,
                      sale_ends_at: null
                    })
                    .eq('id', product.id);
                  
                  if (error) {
                    toast({
                      title: 'Erro ao remover promoção',
                      description: error.message,
                      variant: 'destructive'
                    });
                  } else {
                    toast({
                      title: 'Promoção removida',
                    });
                    setShowPromotion(false);
                    onUpdate();
                  }
                }}
              >
                Remover Promoção
              </Button>
            </div>
          )}
        </div>
      </TableCell>
      <TableCell className="text-center">
        <Button
          variant={product.featured ? "default" : "outline"}
          size="sm"
          onClick={async () => {
            const { error } = await supabase
              .from('products')
              .update({ featured: !product.featured })
              .eq('id', product.id);
            
            if (error) {
              toast({
                title: 'Erro ao atualizar',
                description: error.message,
                variant: 'destructive'
              });
            } else {
              toast({
                title: product.featured ? 'Removido dos destaques' : 'Adicionado aos destaques',
              });
              onUpdate();
            }
          }}
        >
          {product.featured ? '⭐ Destacado' : 'Destacar'}
        </Button>
      </TableCell>
    </TableRow>
  );
}
