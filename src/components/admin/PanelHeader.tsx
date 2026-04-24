import { LucideIcon } from 'lucide-react';

interface KpiItem {
  label: string;
  value: string | number;
  tone?: 'default' | 'primary' | 'warning' | 'success' | 'danger';
}

interface PanelHeaderProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  kpis?: KpiItem[];
}

const toneClass = {
  default: 'text-foreground',
  primary: 'text-primary',
  warning: 'text-orange-500',
  success: 'text-emerald-500',
  danger: 'text-destructive',
} as const;

export function PanelHeader({ icon: Icon, title, description, kpis }: PanelHeaderProps) {
  return (
    <div className="relative bg-gradient-to-br from-primary/10 via-primary/5 to-transparent border-b">
      <div className="p-3 md:p-6 flex flex-col md:flex-row md:items-end md:justify-between gap-3 md:gap-4">
        <div className="flex items-center gap-2.5 md:gap-3">
          <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
            <Icon className="w-4.5 h-4.5 md:w-5 md:h-5 text-primary" />
          </div>
          <div className="min-w-0">
            <h2 className="text-lg md:text-2xl font-bold tracking-tight leading-tight truncate">{title}</h2>
            {description && (
              <p className="text-xs md:text-sm text-muted-foreground line-clamp-2 md:line-clamp-none">
                {description}
              </p>
            )}
          </div>
        </div>
        {kpis && kpis.length > 0 && (
          <div className="-mx-3 md:mx-0 px-3 md:px-0 overflow-x-auto md:overflow-visible scrollbar-hide">
            <div className="flex md:flex-wrap gap-2 md:gap-3 min-w-min">
              {kpis.map((kpi, i) => (
                <div
                  key={i}
                  className="shrink-0 px-3 py-1.5 md:px-4 md:py-2 rounded-lg bg-background/80 backdrop-blur border min-w-[88px] md:min-w-[110px]"
                >
                  <p className="text-[9px] md:text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">
                    {kpi.label}
                  </p>
                  <p className={`text-base md:text-xl font-bold ${toneClass[kpi.tone ?? 'default']}`}>
                    {kpi.value}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
