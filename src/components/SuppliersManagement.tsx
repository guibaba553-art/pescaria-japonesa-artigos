import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { Plus, Pencil, Trash2, Building2, Phone, Mail, MapPin, Loader2, Search } from 'lucide-react';

interface Supplier {
  id: string;
  razao_social: string;
  nome_fantasia: string | null;
  cnpj: string | null;
  contato_nome: string | null;
  contato_telefone: string | null;
  contato_email: string | null;
  cidade: string | null;
  uf: string | null;
  prazo_pagamento_dias: number | null;
  observacoes: string | null;
  is_active: boolean;
}

const empty: Partial<Supplier> = {
  razao_social: '',
  nome_fantasia: '',
  cnpj: '',
  contato_nome: '',
  contato_telefone: '',
  contato_email: '',
  cidade: '',
  uf: '',
  prazo_pagamento_dias: 0,
  observacoes: '',
  is_active: true,
};

export function SuppliersManagement() {
  const { toast } = useToast();
  const { isAdmin } = useAuth();
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Supplier> | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('suppliers')
      .select('*')
      .order('razao_social');
    if (error) {
      toast({ title: 'Erro ao carregar fornecedores', description: error.message, variant: 'destructive' });
    } else {
      setSuppliers(data as Supplier[]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    if (!editing?.razao_social?.trim()) {
      toast({ title: 'Razão social é obrigatória', variant: 'destructive' });
      return;
    }
    setSaving(true);
    const payload = {
      razao_social: editing.razao_social.trim(),
      nome_fantasia: editing.nome_fantasia || null,
      cnpj: editing.cnpj || null,
      contato_nome: editing.contato_nome || null,
      contato_telefone: editing.contato_telefone || null,
      contato_email: editing.contato_email || null,
      cidade: editing.cidade || null,
      uf: editing.uf || null,
      prazo_pagamento_dias: editing.prazo_pagamento_dias || 0,
      observacoes: editing.observacoes || null,
      is_active: editing.is_active ?? true,
    };

    const { error } = editing.id
      ? await supabase.from('suppliers').update(payload).eq('id', editing.id)
      : await supabase.from('suppliers').insert(payload);

    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: editing.id ? 'Fornecedor atualizado' : 'Fornecedor cadastrado' });
      setOpen(false);
      setEditing(null);
      load();
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Excluir este fornecedor? Produtos vinculados serão desvinculados.')) return;
    const { error } = await supabase.from('suppliers').delete().eq('id', id);
    if (error) {
      toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Fornecedor excluído' });
      load();
    }
  };

  const filtered = suppliers.filter((s) => {
    const t = search.toLowerCase();
    return (
      !t ||
      s.razao_social.toLowerCase().includes(t) ||
      s.nome_fantasia?.toLowerCase().includes(t) ||
      s.cnpj?.includes(t)
    );
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-2 sm:items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome, fantasia ou CNPJ..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button onClick={() => { setEditing({ ...empty }); setOpen(true); }} className="rounded-full">
          <Plus className="w-4 h-4 mr-2" /> Novo Fornecedor
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Building2 className="w-10 h-10 mx-auto mb-3 opacity-40" />
            <p className="text-sm">{search ? 'Nenhum fornecedor encontrado' : 'Nenhum fornecedor cadastrado ainda'}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((s) => (
            <Card key={s.id} className={!s.is_active ? 'opacity-60' : ''}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-display font-bold leading-tight truncate">{s.razao_social}</div>
                    {s.nome_fantasia && (
                      <div className="text-xs text-muted-foreground truncate">{s.nome_fantasia}</div>
                    )}
                  </div>
                  {!s.is_active && <Badge variant="secondary" className="text-[10px]">Inativo</Badge>}
                </div>
                {s.cnpj && (
                  <div className="text-xs font-mono text-muted-foreground">CNPJ: {s.cnpj}</div>
                )}
                {s.contato_telefone && (
                  <div className="text-xs flex items-center gap-1.5 text-muted-foreground">
                    <Phone className="w-3 h-3" /> {s.contato_telefone}
                  </div>
                )}
                {s.contato_email && (
                  <div className="text-xs flex items-center gap-1.5 text-muted-foreground truncate">
                    <Mail className="w-3 h-3 shrink-0" /> {s.contato_email}
                  </div>
                )}
                {(s.cidade || s.uf) && (
                  <div className="text-xs flex items-center gap-1.5 text-muted-foreground">
                    <MapPin className="w-3 h-3" /> {[s.cidade, s.uf].filter(Boolean).join(' / ')}
                  </div>
                )}
                {!!s.prazo_pagamento_dias && (
                  <Badge variant="outline" className="text-[10px]">Prazo: {s.prazo_pagamento_dias} dias</Badge>
                )}
                <div className="flex gap-2 pt-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => { setEditing(s); setOpen(true); }}>
                    <Pencil className="w-3.5 h-3.5 mr-1" /> Editar
                  </Button>
                  {isAdmin && (
                    <Button size="sm" variant="outline" onClick={() => handleDelete(s.id)} className="text-destructive">
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={(v) => { if (!v) { setOpen(false); setEditing(null); } }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing?.id ? 'Editar Fornecedor' : 'Novo Fornecedor'}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label>Razão Social *</Label>
                <Input value={editing.razao_social || ''} onChange={(e) => setEditing({ ...editing, razao_social: e.target.value })} />
              </div>
              <div>
                <Label>Nome Fantasia</Label>
                <Input value={editing.nome_fantasia || ''} onChange={(e) => setEditing({ ...editing, nome_fantasia: e.target.value })} />
              </div>
              <div>
                <Label>CNPJ</Label>
                <Input value={editing.cnpj || ''} onChange={(e) => setEditing({ ...editing, cnpj: e.target.value })} placeholder="00.000.000/0000-00" />
              </div>
              <div>
                <Label>Nome do contato</Label>
                <Input value={editing.contato_nome || ''} onChange={(e) => setEditing({ ...editing, contato_nome: e.target.value })} />
              </div>
              <div>
                <Label>Telefone</Label>
                <Input value={editing.contato_telefone || ''} onChange={(e) => setEditing({ ...editing, contato_telefone: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Label>Email</Label>
                <Input type="email" value={editing.contato_email || ''} onChange={(e) => setEditing({ ...editing, contato_email: e.target.value })} />
              </div>
              <div>
                <Label>Cidade</Label>
                <Input value={editing.cidade || ''} onChange={(e) => setEditing({ ...editing, cidade: e.target.value })} />
              </div>
              <div>
                <Label>UF</Label>
                <Input maxLength={2} value={editing.uf || ''} onChange={(e) => setEditing({ ...editing, uf: e.target.value.toUpperCase() })} />
              </div>
              <div>
                <Label>Prazo de pagamento (dias)</Label>
                <Input type="number" min={0} value={editing.prazo_pagamento_dias ?? 0} onChange={(e) => setEditing({ ...editing, prazo_pagamento_dias: parseInt(e.target.value) || 0 })} />
              </div>
              <div className="flex items-center justify-between border rounded-md px-3">
                <Label>Ativo</Label>
                <Switch checked={editing.is_active ?? true} onCheckedChange={(v) => setEditing({ ...editing, is_active: v })} />
              </div>
              <div className="sm:col-span-2">
                <Label>Observações</Label>
                <Textarea rows={3} value={editing.observacoes || ''} onChange={(e) => setEditing({ ...editing, observacoes: e.target.value })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); setEditing(null); }}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
