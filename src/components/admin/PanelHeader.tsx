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
      <div className="p-6 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/15 flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </div>
        </div>
        {kpis && kpis.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {kpis.map((kpi, i) => (
              <div key={i} className="px-4 py-2 rounded-lg bg-background/80 backdrop-blur border min-w-[110px]">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground font-semibold">{kpi.label}</p>
                <p className={`text-xl font-bold ${toneClass[kpi.tone ?? 'default']}`}>{kpi.value}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
