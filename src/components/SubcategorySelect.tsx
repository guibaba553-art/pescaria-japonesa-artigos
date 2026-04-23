import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCategories } from '@/hooks/useCategories';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Plus, Loader2 } from 'lucide-react';

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

interface SubcategorySelectProps {
  /** Nome da categoria primária pai (ex: "Iscas") */
  parentCategoryName: string;
  /** Valor atual da subcategoria selecionada (nome) */
  value: string;
  /** Callback ao mudar a seleção */
  onChange: (value: string) => void;
  /** ID do <SelectTrigger> (acessibilidade) */
  triggerId?: string;
}

/**
 * Select de subcategoria com botão "+" para criar uma nova rapidamente.
 * Usa a categoria primária pai (pelo nome) para listar e criar subcategorias.
 */
export function SubcategorySelect({
  parentCategoryName,
  value,
  onChange,
  triggerId,
}: SubcategorySelectProps) {
  const { primaries, getSubcategoriesOf, reload } = useCategories();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  const parent = primaries.find((p) => p.name === parentCategoryName);
  const subs = parent ? getSubcategoriesOf(parent.id) : [];

  const handleCreate = async () => {
    if (!parent) {
      toast({
        title: 'Selecione a categoria primeiro',
        variant: 'destructive',
      });
      return;
    }
    const trimmed = newName.trim();
    if (!trimmed) {
      toast({ title: 'Nome obrigatório', variant: 'destructive' });
      return;
    }

    // Evita duplicata por nome dentro da mesma categoria pai
    if (subs.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())) {
      toast({
        title: 'Subcategoria já existe',
        description: `"${trimmed}" já está cadastrada em ${parent.name}.`,
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.from('categories').insert([
        {
          name: trimmed,
          slug: slugify(`${parent.name}-${trimmed}`),
          parent_id: parent.id,
          is_primary: false,
          display_order: subs.length,
        },
      ]);
      if (error) throw error;

      toast({ title: 'Subcategoria criada!', description: trimmed });
      await reload();
      onChange(trimmed);
      setNewName('');
      setDialogOpen(false);
    } catch (err: any) {
      toast({
        title: 'Erro ao criar',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="flex gap-2">
        <Select
          value={value || 'none'}
          onValueChange={(v) => onChange(v === 'none' ? '' : v)}
          disabled={!parent}
        >
          <SelectTrigger id={triggerId} className="flex-1">
            <SelectValue
              placeholder={
                !parent
                  ? 'Escolha a categoria primeiro'
                  : subs.length === 0
                  ? 'Nenhuma subcategoria — clique em + para criar'
                  : 'Selecione (opcional)'
              }
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">Nenhuma</SelectItem>
            {subs.map((s) => (
              <SelectItem key={s.id} value={s.name}>
                {s.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          size="icon"
          disabled={!parent}
          onClick={() => setDialogOpen(true)}
          title={parent ? `Nova subcategoria em ${parent.name}` : 'Escolha a categoria primeiro'}
        >
          <Plus className="w-4 h-4" />
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Nova subcategoria{parent ? ` em ${parent.name}` : ''}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="new-subcategory-name">Nome</Label>
            <Input
              id="new-subcategory-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ex: Iscas Artificiais"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCreate();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={handleCreate} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Criando...
                </>
              ) : (
                'Criar e selecionar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
