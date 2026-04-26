import { useEffect, useRef, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Loader2, ScanLine } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  productId: string;
  variationId: string | null;
  productName: string;
  /** Chamado após salvar com sucesso */
  onSaved: () => void;
}

/**
 * Popup para o admin/funcionário ler (ou digitar) o código de barras
 * de fábrica de um produto que está pendente de etiqueta.
 *
 * Ao salvar:
 *  - Atualiza o `sku` do produto/variação;
 *  - O trigger `handle_sku_change_clear_label` zera automaticamente a
 *    pendência se o código for externo (não começa com "200").
 */
export function LabelAssignBarcodeDialog({
  open,
  onOpenChange,
  productId,
  variationId,
  productName,
  onSaved,
}: Props) {
  const { toast } = useToast();
  const [code, setCode] = useState('');
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setCode('');
      // Foca o input para o leitor físico atuar imediatamente
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const handleSave = async () => {
    const trimmed = code.trim();
    if (!trimmed) {
      toast({
        title: 'Código vazio',
        description: 'Leia ou digite o código de barras.',
        variant: 'destructive',
      });
      return;
    }

    if (trimmed.startsWith('200')) {
      toast({
        title: 'Código inválido',
        description:
          'Códigos iniciados com 200 são reservados para uso interno. Use a opção "Gerar código" para isso.',
        variant: 'destructive',
      });
      return;
    }

    try {
      setSaving(true);

      // Verifica se já existe outro item com esse código
      const [{ data: existingProd }, { data: existingVar }] = await Promise.all([
        supabase.from('products').select('id').eq('sku', trimmed).maybeSingle(),
        supabase.from('product_variations').select('id').eq('sku', trimmed).maybeSingle(),
      ]);

      if (existingProd && existingProd.id !== productId) {
        throw new Error('Este código já está cadastrado em outro produto.');
      }
      if (existingVar && existingVar.id !== variationId) {
        throw new Error('Este código já está cadastrado em outra variação.');
      }

      if (variationId) {
        const { error } = await supabase
          .from('product_variations')
          .update({ sku: trimmed })
          .eq('id', variationId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('products')
          .update({ sku: trimmed })
          .eq('id', productId);
        if (error) throw error;
      }

      toast({
        title: 'Código cadastrado',
        description: 'Produto removido da fila de etiquetas pendentes.',
      });
      onSaved();
      onOpenChange(false);
    } catch (err: any) {
      toast({
        title: 'Erro ao salvar',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="w-5 h-5" />
            Ler código de barras
          </DialogTitle>
          <DialogDescription>
            Aponte o leitor para o código do produto <strong>{productName}</strong>.
            O campo abaixo recebe a leitura automaticamente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="barcode-input">Código</Label>
          <Input
            id="barcode-input"
            ref={inputRef}
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSave();
              }
            }}
            placeholder="Aguardando leitura..."
            autoComplete="off"
            className="font-mono text-lg tracking-wider"
          />
          <p className="text-xs text-muted-foreground">
            Você também pode digitar manualmente.
          </p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || !code.trim()}>
            {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
            Salvar código
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
