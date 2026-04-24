import { ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Header } from '@/components/Header';

interface AdminPageLayoutProps {
  icon: LucideIcon;
  eyebrow: string;
  title: string;
  description: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function AdminPageLayout({
  icon: Icon,
  eyebrow,
  title,
  description,
  actions,
  children,
}: AdminPageLayoutProps) {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-muted/30 pb-20 md:pb-0">
      <Header />

      {/* Compact mobile back bar (sticky) */}
      <div className="md:hidden sticky top-14 z-30 bg-background/95 backdrop-blur border-b border-border">
        <div className="px-4 h-12 flex items-center justify-between gap-2">
          <button
            onClick={() => navigate('/admin')}
            className="flex items-center gap-1.5 text-sm font-medium text-foreground active:opacity-60"
          >
            <ArrowLeft className="w-4 h-4" /> Admin
          </button>
          <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            <Icon className="w-3.5 h-3.5 text-primary" />
            <span>{eyebrow}</span>
          </div>
        </div>
      </div>

      {/* Hero (desktop only) */}
      <div className="hidden md:block bg-foreground text-background pt-20 lg:pt-32 pb-10">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-2xl bg-primary/20 text-primary flex items-center justify-center shrink-0">
                <Icon className="w-6 h-6" />
              </div>
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 text-primary mb-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider">{eyebrow}</span>
                </div>
                <h1 className="text-3xl md:text-4xl font-display font-black tracking-tight">{title}</h1>
                <p className="text-sm text-background/60 mt-1 max-w-2xl">{description}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2 self-start md:self-end">
              {actions}
              <Button
                variant="outline"
                onClick={() => navigate('/admin')}
                className="rounded-full bg-transparent border-background/20 text-background hover:bg-background hover:text-foreground"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Voltar ao Admin
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Compact mobile title (no dark hero, saves space) */}
      <div className="md:hidden px-4 pt-4 pb-2">
        <h1 className="text-2xl font-display font-black tracking-tight leading-tight">{title}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        {actions && <div className="flex flex-wrap gap-2 mt-3">{actions}</div>}
      </div>

      <div className="max-w-7xl mx-auto px-3 md:px-6 pt-3 md:-mt-4 md:pt-0 space-y-4 md:space-y-6">
        {children}
      </div>
    </div>
  );
}
