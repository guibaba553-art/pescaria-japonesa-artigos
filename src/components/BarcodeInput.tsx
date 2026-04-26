import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Wand2, Loader2 } from 'lucide-react';
import { generateUniqueBarcode } from '@/utils/barcodeGenerator';
import { useToast } from '@/hooks/use-toast';

interface BarcodeInputProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  size?: 'default' | 'sm';
}

/**
 * Input de código de barras com botão para gerar automaticamente
 * um EAN-13 interno único quando o produto não tem código.
 */
export function BarcodeInput({
  id,
  value,
  onChange,
  placeholder = 'Ex: 7891234567890',
  disabled,
  size = 'default',
}: BarcodeInputProps) {
  const [generating, setGenerating] = useState(false);
  const { toast } = useToast();

  const handleGenerate = async () => {
    try {
      setGenerating(true);
      const code = await generateUniqueBarcode();
      onChange(code);
      toast({
        title: 'Código gerado',
        description: `Código de barras interno: ${code}`,
      });
    } catch (err: any) {
      toast({
        title: 'Erro ao gerar código',
        description: err.message || 'Tente novamente',
        variant: 'destructive',
      });
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="flex gap-2">
      <Input
        id={id}
        type="text"
        autoComplete="off"
        maxLength={50}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className="flex-1"
      />
      <Button
        type="button"
        variant="outline"
        size={size === 'sm' ? 'sm' : 'default'}
        onClick={handleGenerate}
        disabled={disabled || generating || !!value.trim()}
        title={value.trim() ? 'Já possui código' : 'Gerar código de barras interno'}
        className="shrink-0"
      >
        {generating ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Wand2 className="w-4 h-4" />
        )}
        <span className="ml-1.5 hidden sm:inline">Gerar</span>
      </Button>
    </div>
  );
}
