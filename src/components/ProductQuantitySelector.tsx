import { Button } from '@/components/ui/button';
import { Plus, Minus } from 'lucide-react';

interface ProductQuantitySelectorProps {
  quantity: number;
  maxQuantity: number;
  onIncrement: () => void;
  onDecrement: () => void;
  onChange: (quantity: number) => void;
  size?: 'default' | 'sm' | 'lg';
}

/**
 * Componente reutilizável para seleção de quantidade de produtos
 */
export function ProductQuantitySelector({
  quantity,
  maxQuantity,
  onIncrement,
  onDecrement,
  onChange,
  size = 'default'
}: ProductQuantitySelectorProps) {
  const buttonSize = size === 'sm' ? 'icon' : 'icon';
  const buttonClass = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10';
  const inputClass = size === 'sm' ? 'w-14' : 'w-20';

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="outline"
        size={buttonSize}
        className={buttonClass}
        onClick={onDecrement}
        disabled={quantity <= 1}
      >
        <Minus className={size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'} />
      </Button>
      <input
        type="number"
        min="1"
        max={maxQuantity}
        value={quantity}
        onChange={(e) => {
          const value = parseInt(e.target.value) || 1;
          onChange(Math.max(1, Math.min(maxQuantity, value)));
        }}
        className={`${inputClass} text-center border rounded px-2 py-1 ${size === 'sm' ? 'text-sm' : 'text-base'}`}
      />
      <Button
        variant="outline"
        size={buttonSize}
        className={buttonClass}
        onClick={onIncrement}
        disabled={quantity >= maxQuantity}
      >
        <Plus className={size === 'sm' ? 'h-3 w-3' : 'h-4 w-4'} />
      </Button>
      {size !== 'sm' && (
        <span className="text-sm text-muted-foreground">
          (máx: {maxQuantity})
        </span>
      )}
    </div>
  );
}
