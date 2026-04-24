import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, Scissors, X } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
// NÃO importar @/utils/removeBackground estaticamente: ele puxa @huggingface/transformers (~40MB)
// e quebra o code-split de páginas que usam este componente. Carregamos sob demanda.

interface Props {
  /** Pode ser um File (novo upload) ou uma URL (imagem já salva). */
  source: File | string;
  alt: string;
  onRemove: () => void;
  /**
   * Callback quando o fundo é removido com sucesso.
   * - Para Files: recebe o novo File PNG transparente.
   * - Para URLs: recebe um data URL (base64) que pode ser exibido/enviado.
   */
  onBackgroundRemoved: (result: File | string) => void;
  className?: string;
}

/**
 * Thumbnail de imagem com botões de remover fundo (IA local) e remover.
 * O processamento acontece no navegador via @huggingface/transformers (WebGPU/CPU).
 */
export function ImageThumbWithBgRemoval({
  source,
  alt,
  onRemove,
  onBackgroundRemoved,
  className,
}: Props) {
  const { toast } = useToast();
  const [processing, setProcessing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const src =
    previewUrl ||
    (typeof source === 'string' ? source : URL.createObjectURL(source));

  const handleRemoveBg = async () => {
    setProcessing(true);
    try {
      toast({
        title: 'Processando imagem...',
        description: 'Removendo fundo com IA. Isso pode levar alguns segundos.',
      });

      // Carrega o utilitário (e o modelo de IA) sob demanda
      const { removeBackground, loadImage, loadImageFromUrl } = await import(
        '@/utils/removeBackground'
      );

      const img =
        typeof source === 'string'
          ? await loadImageFromUrl(source)
          : await loadImage(source);

      const blob = await removeBackground(img);
      const dataUrl = await blobToDataUrl(blob);
      setPreviewUrl(dataUrl);

      if (typeof source === 'string') {
        // Imagens já salvas: devolvemos o data URL — o salvamento substitui a URL.
        onBackgroundRemoved(dataUrl);
      } else {
        // Novo upload: criamos um novo File PNG.
        const newName = source.name.replace(/\.[^.]+$/, '') + '-sem-fundo.png';
        const file = new File([blob], newName, { type: 'image/png' });
        onBackgroundRemoved(file);
      }

      toast({ title: 'Fundo removido com sucesso!' });
    } catch (err) {
      console.error(err);
      toast({
        title: 'Erro ao remover fundo',
        description:
          err instanceof Error ? err.message : 'Tente novamente com outra imagem.',
        variant: 'destructive',
      });
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className={`relative group rounded overflow-hidden bg-muted ${className ?? ''}`}>
      <img src={src} alt={alt} className="w-full h-20 object-contain bg-checker" />

      {/* Overlay de loading */}
      {processing && (
        <div className="absolute inset-0 bg-background/80 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-primary" />
        </div>
      )}

      {/* Botões */}
      <div className="absolute top-1 left-1 right-1 flex justify-between gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="h-6 px-1.5 text-[10px] gap-1"
          onClick={handleRemoveBg}
          disabled={processing}
          title="Remover fundo da imagem"
        >
          <Scissors className="w-3 h-3" />
          Sem fundo
        </Button>
        <Button
          type="button"
          variant="destructive"
          size="icon"
          className="h-6 w-6 p-0"
          onClick={onRemove}
          disabled={processing}
          title="Remover imagem"
        >
          <X className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
