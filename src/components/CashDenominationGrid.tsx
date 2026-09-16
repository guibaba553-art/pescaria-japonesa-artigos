import { Input } from '@/components/ui/input';
import { CASH_DENOMINATIONS, type DenominationCounts } from '@/utils/cashDenominations';

interface CashDenominationGridProps {
  counts: Record<string, string>;
  onChange: (counts: Record<string, string>) => void;
  disabled?: boolean;
  maxCounts?: DenominationCounts;
}

export function CashDenominationGrid({
  counts,
  onChange,
  disabled = false,
  maxCounts,
}: CashDenominationGridProps) {
  return (
    <div className="grid grid-cols-2 gap-2 max-h-[240px] overflow-y-auto pr-1">
      {CASH_DENOMINATIONS.map((denomination) => {
        const key = String(denomination.value);
        const available = maxCounts?.[key];
        return (
          <div key={denomination.value} className="flex items-center gap-2 border rounded px-2 py-1.5">
            <div className="w-16 shrink-0">
              <span className="block text-xs font-medium">{denomination.label}</span>
              {available !== undefined && (
                <span className="block text-[10px] text-muted-foreground">{available || 0} disp.</span>
              )}
            </div>
            <Input
              type="number"
              min={0}
              max={available === undefined ? undefined : Number(available)}
              step={1}
              inputMode="numeric"
              placeholder="0"
              className="h-8 text-sm"
              disabled={disabled}
              value={counts[key] ?? ''}
              onChange={(event) => onChange({ ...counts, [key]: event.target.value })}
            />
          </div>
        );
      })}
    </div>
  );
}