import { Minus, Plus } from 'lucide-react';

interface ProductQuantitySelectorProps {
  quantity: number;
  maxQuantity: number;
  onIncrement: () => void;
  onDecrement: () => void;
  onChange: (quantity: number) => void;
  size?: 'default' | 'sm' | 'lg';
  showMaxHint?: boolean;
}

/**
 * Seletor de quantidade — visual segmentado e compacto, padrão do sistema.
 * Tudo agrupado em uma "pílula" com borda única, alinhado verticalmente.
 */
export function ProductQuantitySelector({
  quantity,
  maxQuantity,
  onIncrement,
  onDecrement,
  onChange,
  size = 'default',
  showMaxHint = false,
}: ProductQuantitySelectorProps) {
  const sizes = {
    sm: { h: 'h-9', btn: 'w-8', input: 'w-10', icon: 'h-3.5 w-3.5', text: 'text-sm' },
    default: { h: 'h-10', btn: 'w-9', input: 'w-12', icon: 'h-4 w-4', text: 'text-sm' },
    lg: { h: 'h-12', btn: 'w-11', input: 'w-14', icon: 'h-4 w-4', text: 'text-base' },
  }[size];

  return (
    <div className="flex items-center gap-2">
      <div
        className={`flex items-center ${sizes.h} rounded-lg border border-border bg-background overflow-hidden`}
      >
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDecrement();
          }}
          disabled={quantity <= 1}
          className={`h-full ${sizes.btn} flex items-center justify-center text-foreground hover:bg-muted disabled:opacity-40 transition-colors`}
          aria-label="Diminuir quantidade"
        >
          <Minus className={sizes.icon} />
        </button>
        <input
          type="number"
          min={1}
          max={maxQuantity}
          value={quantity}
          onChange={(e) => {
            const v = parseInt(e.target.value);
            if (isNaN(v) || v < 1) return onChange(1);
            if (v > maxQuantity) return onChange(maxQuantity);
            onChange(v);
          }}
          onBlur={(e) => {
            const v = parseInt(e.target.value);
            if (isNaN(v) || v < 1) onChange(1);
            else if (v > maxQuantity) onChange(maxQuantity);
          }}
          className={`h-full ${sizes.input} text-center font-semibold ${sizes.text} bg-transparent border-0 border-x border-border outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
        />
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onIncrement();
          }}
          disabled={quantity >= maxQuantity}
          className={`h-full ${sizes.btn} flex items-center justify-center text-foreground hover:bg-muted disabled:opacity-40 transition-colors`}
          aria-label="Aumentar quantidade"
        >
          <Plus className={sizes.icon} />
        </button>
      </div>
      {showMaxHint && size !== 'sm' && (
        <span className="text-xs text-muted-foreground">máx: {maxQuantity}</span>
      )}
    </div>
  );
}
