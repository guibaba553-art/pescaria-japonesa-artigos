import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { History, Trash2, RotateCcw } from 'lucide-react';

interface DraftRestoreBannerProps {
  savedAt: number | null;
  onRestore: () => void;
  onDiscard: () => void;
}

function formatRelative(ts: number) {
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'agora mesmo';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} dia${d > 1 ? 's' : ''}`;
}

export function DraftRestoreBanner({ savedAt, onRestore, onDiscard }: DraftRestoreBannerProps) {
  return (
    <Alert className="border-amber-500/40 bg-amber-500/5">
      <History className="h-4 w-4 text-amber-600 dark:text-amber-400" />
      <AlertDescription className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 w-full">
        <span className="text-sm">
          <span className="font-semibold">Rascunho não salvo encontrado</span>
          {savedAt && <span className="text-muted-foreground"> — salvo {formatRelative(savedAt)}</span>}
        </span>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={onDiscard} className="gap-1.5">
            <Trash2 className="h-3.5 w-3.5" /> Descartar
          </Button>
          <Button size="sm" onClick={onRestore} className="gap-1.5">
            <RotateCcw className="h-3.5 w-3.5" /> Restaurar
          </Button>
        </div>
      </AlertDescription>
    </Alert>
  );
}
