import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useCategories, type Category } from '@/hooks/useCategories';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useToast } from '@/hooks/use-toast';
import { Pencil, Trash2, Plus, GripVertical } from 'lucide-react';

const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

export function CategoriesManagement() {
  const { categories, reload } = useCategories();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Category | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('');
  const [displayOrder, setDisplayOrder] = useState('0');
  const [saving, setSaving] = useState(false);

  const openNew = () => {
    setEditing(null);
    setName('');
    setDescription('');
    setIcon('');
    setDisplayOrder(String(categories.length + 1));
    setOpen(true);
  };

  const openEdit = (cat: Category) => {
    setEditing(cat);
    setName(cat.name);
    setDescription(cat.description || '');
    setIcon(cat.icon || '');
    setDisplayOrder(String(cat.display_order));
    setOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) {
      toast({ title: 'Nome obrigatório', variant: 'destructive' });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        slug: slugify(name),
        description: description.trim() || null,
        icon: icon.trim() || null,
        display_order: parseInt(displayOrder) || 0,
      };

      if (editing) {
        const { error } = await supabase
          .from('categories')
          .update(payload)
          .eq('id', editing.id);
        if (error) throw error;
        toast({ title: 'Categoria atualizada!' });
      } else {
        const { error } = await supabase.from('categories').insert([payload]);
        if (error) throw error;
        toast({ title: 'Categoria criada!' });
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
    // Check if any product uses this category
    const { count } = await supabase
      .from('products')
      .select('id', { count: 'exact', head: true })
      .eq('category', cat.name);

    if (count && count > 0) {
      toast({
        title: 'Não é possível excluir',
        description: `Existem ${count} produto(s) usando esta categoria. Reclassifique-os antes.`,
        variant: 'destructive',
      });
      return;
    }

    if (!confirm(`Excluir a categoria "${cat.name}"?`)) return;

    const { error } = await supabase.from('categories').delete().eq('id', cat.id);
    if (error) {
      toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Categoria excluída!' });
      reload();
    }
  };

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Gerenciar Categorias</CardTitle>
        <Button onClick={openNew}>
          <Plus className="w-4 h-4 mr-2" />
          Nova Categoria
        </Button>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16">Ordem</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Ícone</TableHead>
              <TableHead className="text-right">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categories.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground">
                  Nenhuma categoria cadastrada
                </TableCell>
              </TableRow>
            ) : (
              categories.map((cat) => (
                <TableRow key={cat.id}>
                  <TableCell>
                    <div className="flex items-center gap-1 text-muted-foreground">
                      <GripVertical className="w-4 h-4" />
                      {cat.display_order}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{cat.name}</TableCell>
                  <TableCell className="text-muted-foreground text-sm">
                    {cat.description || '—'}
                  </TableCell>
                  <TableCell className="text-sm font-mono">{cat.icon || '—'}</TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(cat)}>
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(cat)}
                      className="text-destructive hover:text-destructive"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar Categoria' : 'Nova Categoria'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <Label>Nome *</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Ex: Varas, Iscas, Molinetes"
                maxLength={50}
              />
            </div>
            <div>
              <Label>Descrição</Label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Breve descrição exibida na home"
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
                  placeholder="Ex: Fish, Anchor, Package"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Veja em lucide.dev/icons
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
