import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCategories, type Category } from '@/hooks/useCategories';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Pencil, Trash2, Plus, Lock, ChevronRight } from 'lucide-react';

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

export function CategoriesManagement() {
  const { categories, primaries, getSubcategoriesOf, reload } = useCategories();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('');
  const [displayOrder, setDisplayOrder] = useState('0');
  const [parentId, setParentId] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const openNew = (presetParentId?: string) => {
    setEditing(null);
    setName('');
    setDescription('');
    setIcon('');
    setDisplayOrder('0');
    setParentId(presetParentId || '');
    setOpen(true);
  };

  const openEdit = (cat: Category) => {
    setEditing(cat);
    setName(cat.name);
    setDescription(cat.description || '');
    setIcon(cat.icon || '');
    setDisplayOrder(String(cat.display_order));
    setParentId(cat.parent_id || '');
    setOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: 'Nome obrigatório', variant: 'destructive' });
      return;
    }
    if (!parentId && !editing?.is_primary) {
      toast({
        title: 'Categoria pai obrigatória',
        description: 'Subcategorias precisam de uma categoria primária pai.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const payload: any = {
        slug: slugify(name),
        description: description.trim() || null,
        icon: icon.trim() || null,
        display_order: parseInt(displayOrder) || 0,
        parent_id: parentId || null,
      };

      // Don't send name on primary edit (DB blocks it anyway)
      if (!editing?.is_primary) {
        payload.name = name.trim();
      }

      if (editing) {
        const { error } = await supabase
          .from('categories')
          .update(payload)
          .eq('id', editing.id);
        if (error) throw error;
        toast({ title: 'Categoria atualizada!' });
      } else {
        const { error } = await supabase
          .from('categories')
          .insert([{ ...payload, name: name.trim() }]);
        if (error) throw error;
        toast({ title: 'Subcategoria criada!' });
      }

      setOpen(false);
      reload();
    } catch (error: any) {
      toast({
        title: 'Erro ao salvar',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (cat: Category) => {
    if (cat.is_primary) {
      toast({
        title: 'Categoria primária protegida',
        description: 'Categorias primárias não podem ser excluídas.',
        variant: 'destructive',
      });
      return;
    }

    const { count } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('subcategory', cat.name);

    if (count && count > 0) {
      toast({
        title: 'Não é possível excluir',
        description: `Existem ${count} produto(s) usando esta subcategoria. Reclassifique-os antes.`,
        variant: 'destructive',
      });
      return;
    }

    if (!confirm(`Excluir a subcategoria "${cat.name}"?`)) return;

    const { error } = await supabase.from('categories').delete().eq('id', cat.id);
    if (error) {
      toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Subcategoria excluída!' });
      reload();
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Gerenciar Categorias</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            Categorias primárias são fixas. Você pode criar subcategorias dentro de cada uma.
          </p>
        </div>
        <Button onClick={() => openNew()}>
          <Plus className="w-4 h-4 mr-2" />
          Nova Subcategoria
        </Button>
      </CardHeader>
      <CardContent className="space-y-6">
        {primaries.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">
            Nenhuma categoria primária encontrada.
          </p>
        ) : (
          primaries.map((primary) => {
            const subs = getSubcategoriesOf(primary.id);
            return (
              <div key={primary.id} className="border rounded-lg p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Lock className="w-4 h-4 text-muted-foreground" />
                    <h3 className="font-semibold text-lg">{primary.name}</h3>
                    <Badge variant="secondary" className="text-xs">
                      Primária
                    </Badge>
                    <Badge variant="outline" className="text-xs">
                      {subs.length} subcategoria{subs.length !== 1 ? 's' : ''}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => openEdit(primary)}
                      title="Editar ícone, descrição ou ordem"
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openNew(primary.id)}
                    >
                      <Plus className="w-3.5 h-3.5 mr-1" />
                      Adicionar sub
                    </Button>
                  </div>
                </div>

                {subs.length > 0 && (
                  <div className="pl-6 space-y-2">
                    {subs.map((sub) => (
                      <div
                        key={sub.id}
                        className="flex items-center justify-between py-2 px-3 rounded-md bg-muted/40"
                      >
                        <div className="flex items-center gap-2">
                          <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                          <span className="font-medium">{sub.name}</span>
                          {sub.description && (
                            <span className="text-xs text-muted-foreground">
                              — {sub.description}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => openEdit(sub)}>
                            <Pencil className="w-3.5 h-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(sub)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editing
                ? editing.is_primary
                  ? `Editar Primária: ${editing.name}`
                  : 'Editar Subcategoria'
                : 'Nova Subcategoria'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {!editing?.is_primary && (
              <div>
                <Label>Categoria primária (pai) *</Label>
                <Select value={parentId} onValueChange={setParentId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Escolha a primária" />
                  </SelectTrigger>
                  <SelectContent>
                    {primaries.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div>
              <Label>Nome *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Iscas artificiais, Varas de carbono"
                maxLength={50}
                disabled={editing?.is_primary}
              />
              {editing?.is_primary && (
                <p className="text-xs text-muted-foreground mt-1">
                  O nome de categorias primárias não pode ser alterado.
                </p>
              )}
            </div>

            <div>
              <Label>Descrição</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Breve descrição"
                maxLength={200}
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Ícone (Lucide)</Label>
                <Input
                  value={icon}
                  onChange={(e) => setIcon(e.target.value)}
                  placeholder="Ex: Fish, Anchor"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  lucide.dev/icons
                </p>
              </div>
              <div>
                <Label>Ordem de exibição</Label>
                <Input
                  type="number"
                  value={displayOrder}
                  onChange={(e) => setDisplayOrder(e.target.value)}
                  min="0"
                />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
