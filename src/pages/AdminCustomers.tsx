import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { AdminPageLayout } from '@/components/admin/AdminPageLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Users, Search, Plus, Pencil, Trash2, Loader2, Mail, MapPin, FileText, AlertTriangle, CheckCircle2, Wand2, Award } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { CustomerScoreDialog } from '@/components/CustomerScoreDialog';
import { loadTiers, getTierForScore, type CustomerTier } from '@/utils/customerTiers';

// Valida se o cadastro do cliente atende aos requisitos para emissão de NF-e
function validateNfe(c: Customer): { ok: boolean; missing: string[] } {
  const missing: string[] = [];
  const isCnpj = !!c.cnpj;
  const doc = (isCnpj ? c.cnpj : c.cpf) || '';
  const docDigits = doc.replace(/\D/g, '');

  if (!c.full_name?.trim()) missing.push('Nome');
  if (!docDigits) missing.push(isCnpj ? 'CNPJ' : 'CPF');
  else if (isCnpj && docDigits.length !== 14) missing.push('CNPJ inválido');
  else if (!isCnpj && docDigits.length !== 11) missing.push('CPF inválido');

  if (isCnpj && !c.company_name?.trim()) missing.push('Razão social');

  const cepDigits = (c.cep || '').replace(/\D/g, '');
  if (cepDigits.length !== 8) missing.push('CEP');
  if (!c.street?.trim()) missing.push('Rua');
  if (!c.number?.trim()) missing.push('Número');
  if (!c.neighborhood?.trim()) missing.push('Bairro');
  if (!c.municipio?.trim()) missing.push('Município');
  if (!c.uf?.trim() || c.uf.length !== 2) missing.push('UF');

  const ibge = (c.codigo_municipio_ibge || '').replace(/\D/g, '');
  if (ibge.length !== 7) missing.push('Código IBGE');

  if (isCnpj) {
    if (!c.ie_indicador) missing.push('Indicador de IE');
    else if ((c.ie_indicador === '1') && !c.inscricao_estadual?.trim()) missing.push('Inscrição Estadual');
  }

  return { ok: missing.length === 0, missing };
}

interface Customer {
  id: string;
  full_name: string;
  cpf: string | null;
  cnpj: string | null;
  company_name: string | null;
  email: string | null;
  cep: string;
  street: string;
  number: string;
  neighborhood: string;
  complemento: string | null;
  municipio: string | null;
  uf: string | null;
  codigo_municipio_ibge: string | null;
  inscricao_estadual: string | null;
  ie_indicador: string | null;
  created_at: string;
  score: number;
}

const emptyForm = {
  doc_type: 'cpf' as 'cpf' | 'cnpj',
  full_name: '',
  cpf: '',
  cnpj: '',
  company_name: '',
  email: '',
  cep: '',
  street: '',
  number: '',
  neighborhood: '',
  complemento: '',
  municipio: '',
  uf: '',
  codigo_municipio_ibge: '',
  inscricao_estadual: '',
  ie_indicador: '9' as '1' | '2' | '9',
};

export default function AdminCustomers() {
  const navigate = useNavigate();
  const { isAdmin, loading: authLoading } = useAuth();
  const [list, setList] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [onlyInvalid, setOnlyInvalid] = useState(false);
  const [docFilter, setDocFilter] = useState<'all' | 'pj' | 'pf'>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [fixingId, setFixingId] = useState<string | null>(null);
  const [cnpjLoading, setCnpjLoading] = useState(false);
  const [tiers, setTiers] = useState<CustomerTier[]>([]);
  const [scoreFor, setScoreFor] = useState<Customer | null>(null);

  useEffect(() => { loadTiers().then(setTiers); }, []);


  const lookupCnpj = async (digits: string) => {
    if (digits.length !== 14) {
      toast({ title: 'CNPJ inválido', description: 'Informe os 14 dígitos.', variant: 'destructive' });
      return;
    }
    setCnpjLoading(true);
    try {
      let d: any = null;
      let ieFromFocus = '';
      let ieAtivaFromFocus = false;
      try {
        const { data: focusData, error: focusErr } = await supabase.functions.invoke('lookup-cnpj-focus', {
          body: { cnpj: digits },
        });
        if (!focusErr && focusData?.success) {
          d = {
            razao_social: focusData.razao_social,
            nome_fantasia: focusData.nome_fantasia,
            cep: focusData.cep,
            logradouro: focusData.logradouro,
            numero: focusData.numero,
            complemento: focusData.complemento,
            bairro: focusData.bairro,
            municipio: focusData.municipio,
            uf: focusData.uf,
            codigo_municipio: focusData.codigo_municipio_ibge,
            email: focusData.email,
          };
          ieFromFocus = focusData.inscricao_estadual || '';
          ieAtivaFromFocus = !!focusData.ie_ativa;
        }
      } catch (err) {
        console.warn('Focus NFe lookup falhou, usando BrasilAPI:', err);
      }

      if (!d) {
        const res = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${digits}`);
        if (!res.ok) throw new Error('CNPJ não encontrado');
        d = await res.json();
      }

      const fmtCnpj = digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
      const fmtCep = (d.cep ? String(d.cep).padStart(8, '0') : '').replace(/^(\d{5})(\d{3})$/, '$1-$2');

      let ibge = d.codigo_municipio ? String(d.codigo_municipio) : '';
      if ((!ibge || ibge.length !== 7) && d.uf && d.municipio) {
        try {
          const ibgeRes = await fetch(`https://brasilapi.com.br/api/ibge/municipios/v1/${d.uf}?providers=dados-abertos-br,gov,wikipedia`);
          if (ibgeRes.ok) {
            const cidades: any[] = await ibgeRes.json();
            const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().trim();
            const alvo = norm(d.municipio);
            const match = cidades.find((c) => norm(c.nome) === alvo);
            if (match?.codigo_ibge) ibge = String(match.codigo_ibge);
          }
        } catch {}
      }

      setForm((prev) => ({
        ...prev,
        cnpj: fmtCnpj,
        company_name: d.razao_social || prev.company_name,
        full_name: prev.full_name || d.nome_fantasia || d.razao_social || '',
        email: d.email || prev.email,
        cep: fmtCep || prev.cep,
        street: d.logradouro || prev.street,
        number: d.numero || prev.number,
        neighborhood: d.bairro || prev.neighborhood,
        complemento: d.complemento || prev.complemento,
        municipio: d.municipio || prev.municipio,
        uf: d.uf || prev.uf,
        codigo_municipio_ibge: ibge || prev.codigo_municipio_ibge,
        inscricao_estadual: ieFromFocus && ieAtivaFromFocus ? ieFromFocus : prev.inscricao_estadual,
        ie_indicador: ieFromFocus && ieAtivaFromFocus ? '1' : prev.ie_indicador,
      }));
      toast({
        title: 'Dados preenchidos',
        description: ieFromFocus && ieAtivaFromFocus
          ? `${d.razao_social} — IE ${ieFromFocus}`
          : d.razao_social || 'Dados carregados',
      });
    } catch (e: any) {
      toast({ title: 'Erro ao buscar CNPJ', description: e?.message || 'Tente novamente', variant: 'destructive' });
    } finally {
      setCnpjLoading(false);
    }
  };

  // Tenta corrigir automaticamente UM cliente via ViaCEP
  const autoFixOne = async (c: Customer) => {
    const cep = (c.cep || '').replace(/\D/g, '');
    if (cep.length !== 8) {
      toast({ title: 'CEP inválido', description: 'Edite o cliente e informe um CEP válido.', variant: 'destructive' });
      return;
    }
    setFixingId(c.id);
    try {
      let d: any = null;
      try {
        const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
        d = await r.json();
      } catch {
        toast({ title: 'Erro ao consultar CEP', variant: 'destructive' });
        return;
      }
      if (!d || d.erro) {
        toast({ title: 'CEP não encontrado no ViaCEP', variant: 'destructive' });
        return;
      }

      const patch: Record<string, any> = {};
      if (!c.municipio?.trim() && d.localidade) patch.municipio = d.localidade;
      if ((!c.uf?.trim() || c.uf.length !== 2) && d.uf) patch.uf = d.uf;
      if (((c.codigo_municipio_ibge || '').replace(/\D/g, '').length !== 7) && d.ibge) {
        patch.codigo_municipio_ibge = d.ibge;
      }
      if (!c.neighborhood?.trim() && d.bairro) patch.neighborhood = d.bairro;
      if (!c.street?.trim() && d.logradouro) patch.street = d.logradouro;
      if (c.cnpj && !c.ie_indicador) patch.ie_indicador = '9';

      if (Object.keys(patch).length === 0) {
        toast({ title: 'Nada para corrigir automaticamente', description: 'As pendências exigem edição manual.' });
        return;
      }

      const { error } = await supabase.from('customers').update(patch).eq('id', c.id);
      if (error) {
        toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
        return;
      }
      toast({ title: 'Cliente corrigido', description: `${Object.keys(patch).length} campo(s) preenchido(s).` });
      await load();
    } finally {
      setFixingId(null);
    }
  };

  useEffect(() => {
    if (!authLoading && !isAdmin) navigate('/admin');
  }, [authLoading, isAdmin, navigate]);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('customers')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) {
      toast({ title: 'Erro ao carregar clientes', description: error.message, variant: 'destructive' });
    } else {
      setList((data || []) as Customer[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const validations = useMemo(() => {
    const m = new Map<string, ReturnType<typeof validateNfe>>();
    list.forEach((c) => m.set(c.id, validateNfe(c)));
    return m;
  }, [list]);

  const invalidCount = useMemo(
    () => list.filter((c) => !(validations.get(c.id)?.ok)).length,
    [list, validations]
  );

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    let arr = list;
    if (s) {
      arr = arr.filter((c) => {
        const doc = (c.cnpj || c.cpf || '').replace(/\D/g, '');
        return (
          c.full_name.toLowerCase().includes(s) ||
          (c.company_name || '').toLowerCase().includes(s) ||
          (c.email || '').toLowerCase().includes(s) ||
          doc.includes(s.replace(/\D/g, '')) ||
          (c.municipio || '').toLowerCase().includes(s)
        );
      });
    }
    if (onlyInvalid) arr = arr.filter((c) => !(validations.get(c.id)?.ok));
    if (docFilter === 'pj') arr = arr.filter((c) => !!c.cnpj);
    else if (docFilter === 'pf') arr = arr.filter((c) => !c.cnpj);
    return arr;
  }, [list, search, onlyInvalid, docFilter, validations]);

  const pjCount = useMemo(() => list.filter((c) => !!c.cnpj).length, [list]);
  const pfCount = useMemo(() => list.filter((c) => !c.cnpj).length, [list]);

  // Identifica documentos duplicados já existentes no banco
  const duplicateDocs = useMemo(() => {
    const counts = new Map<string, number>();
    list.forEach((c) => {
      const d = ((c.cnpj || c.cpf) || '').replace(/\D/g, '');
      if (d) counts.set(d, (counts.get(d) || 0) + 1);
    });
    return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([d]) => d));
  }, [list]);

  const isDuplicate = (c: Customer) => {
    const d = ((c.cnpj || c.cpf) || '').replace(/\D/g, '');
    return !!d && duplicateDocs.has(d);
  };

  const openNew = () => {
    setEditingId(null);
    setForm({ ...emptyForm });
    setDialogOpen(true);
  };

  const openEdit = (c: Customer) => {
    setEditingId(c.id);
    setForm({
      doc_type: c.cnpj ? 'cnpj' : 'cpf',
      full_name: c.full_name || '',
      cpf: c.cpf || '',
      cnpj: c.cnpj || '',
      company_name: c.company_name || '',
      email: c.email || '',
      cep: c.cep || '',
      street: c.street || '',
      number: c.number || '',
      neighborhood: c.neighborhood || '',
      complemento: c.complemento || '',
      municipio: c.municipio || '',
      uf: c.uf || '',
      codigo_municipio_ibge: c.codigo_municipio_ibge || '',
      inscricao_estadual: c.inscricao_estadual || '',
      ie_indicador: (c.ie_indicador as '1' | '2' | '9') || '9',
    });
    setDialogOpen(true);
  };

  const buscarCep = async () => {
    const cep = form.cep.replace(/\D/g, '');
    if (cep.length !== 8) return;
    try {
      const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const d = await r.json();
      if (d.erro) {
        toast({ title: 'CEP não encontrado', variant: 'destructive' });
        return;
      }
      setForm((p) => ({
        ...p,
        street: d.logradouro || p.street,
        neighborhood: d.bairro || p.neighborhood,
        municipio: d.localidade || p.municipio,
        uf: d.uf || p.uf,
        codigo_municipio_ibge: d.ibge || p.codigo_municipio_ibge,
      }));
    } catch {
      toast({ title: 'Erro ao buscar CEP', variant: 'destructive' });
    }
  };

  const save = async () => {
    const isCnpj = form.doc_type === 'cnpj';
    const docValue = isCnpj ? form.cnpj : form.cpf;
    if (!form.full_name.trim() || !docValue.trim() || !form.cep.trim() ||
        !form.street.trim() || !form.number.trim() || !form.neighborhood.trim()) {
      toast({ title: 'Preencha todos os campos obrigatórios', variant: 'destructive' });
      return;
    }
    if (isCnpj && !form.company_name.trim()) {
      toast({ title: 'Razão social obrigatória para CNPJ', variant: 'destructive' });
      return;
    }
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      toast({ title: 'E-mail inválido', variant: 'destructive' });
      return;
    }

    // Bloqueia duplicatas pelo documento (CPF/CNPJ)
    const docDigits = docValue.replace(/\D/g, '');
    const dup = list.find((c) => {
      if (editingId && c.id === editingId) return false;
      const other = ((isCnpj ? c.cnpj : c.cpf) || '').replace(/\D/g, '');
      return other && other === docDigits;
    });
    if (dup) {
      toast({
        title: 'Documento já cadastrado',
        description: `Já existe um cliente com este ${isCnpj ? 'CNPJ' : 'CPF'}: ${dup.company_name || dup.full_name}.`,
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        full_name: form.full_name,
        cpf: isCnpj ? null : form.cpf,
        cnpj: isCnpj ? form.cnpj : null,
        company_name: isCnpj ? form.company_name : null,
        email: form.email || null,
        cep: form.cep,
        street: form.street,
        number: form.number,
        neighborhood: form.neighborhood,
        complemento: form.complemento || null,
        municipio: form.municipio || null,
        uf: form.uf || null,
        codigo_municipio_ibge: isCnpj ? form.codigo_municipio_ibge || null : null,
        inscricao_estadual: form.inscricao_estadual.trim()
          ? form.inscricao_estadual.trim()
          : (isCnpj && form.ie_indicador !== '1' ? 'ISENTO' : null),
        ie_indicador: isCnpj ? form.ie_indicador : null,
      };

      if (editingId) {
        const { error } = await supabase.from('customers').update(payload).eq('id', editingId);
        if (error) throw error;
        toast({ title: 'Cliente atualizado' });
      } else {
        const { error } = await supabase.from('customers').insert(payload);
        if (error) throw error;
        toast({ title: 'Cliente cadastrado' });
      }
      setDialogOpen(false);
      load();
    } catch (e: any) {
      toast({ title: 'Erro ao salvar', description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from('customers').delete().eq('id', deleteId);
    if (error) {
      toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Cliente excluído' });
      load();
    }
    setDeleteId(null);
  };

  return (
    <AdminPageLayout
      icon={Users}
      eyebrow="Clientes"
      title="Gestão de Clientes"
      description="Cadastre, edite e gerencie clientes (PF e PJ) usados no PDV e em emissões de NF-e."
    >
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nome, documento, e-mail, cidade..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="inline-flex items-center rounded-md bg-muted p-0.5 text-sm">
              {([
                { key: 'all', label: 'Todos', count: list.length },
                { key: 'pj', label: 'PJ', count: pjCount },
                { key: 'pf', label: 'PF', count: pfCount },
              ] as const).map((t) => {
                const active = docFilter === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setDocFilter(t.key)}
                    className={`inline-flex items-center gap-1.5 h-8 px-3 rounded-[5px] font-medium transition-colors ${
                      active
                        ? 'bg-background text-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    {t.label}
                    <span className={`text-xs font-mono ${active ? 'text-muted-foreground' : 'opacity-70'}`}>
                      {t.count}
                    </span>
                  </button>
                );
              })}
            </div>

            
            <Button
              type="button"
              size="sm"
              variant={onlyInvalid ? 'default' : 'outline'}
              onClick={() => setOnlyInvalid((v) => !v)}
              className={onlyInvalid ? '' : 'border-destructive/40 text-destructive hover:text-destructive'}
            >
              <AlertTriangle className="w-4 h-4 mr-1.5" />
              {onlyInvalid ? 'Mostrando incompletos' : 'Só incompletos'}
              <Badge variant={onlyInvalid ? 'secondary' : 'destructive'} className="ml-2">{invalidCount}</Badge>
            </Button>
            <Badge variant="secondary">{filtered.length} de {list.length}</Badge>
            <Button onClick={openNew}>
              <Plus className="w-4 h-4 mr-2" />
              Novo cliente
            </Button>
          </div>
        </div>

        {!loading && invalidCount > 0 && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 flex items-start gap-2 text-sm">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-destructive">{invalidCount}</span>{' '}
              {invalidCount === 1 ? 'cliente possui dados' : 'clientes possuem dados'} incompletos e{' '}
              <span className="font-semibold">não serão aprovados em uma emissão de NF-e</span>.
              Edite os cadastros marcados com o aviso vermelho.
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <Loader2 className="w-5 h-5 animate-spin mr-2" />
            Carregando...
          </div>
        ) : filtered.length === 0 ? (
          <Card>
            <CardContent className="py-16 text-center text-muted-foreground">
              <Users className="w-10 h-10 mx-auto mb-2 opacity-50" />
              <p>{search ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado ainda.'}</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {filtered.map((c) => {
              const v = validations.get(c.id) || { ok: true, missing: [] };
              const dup = isDuplicate(c);
              return (
              <Card
                key={c.id}
                className={
                  dup
                    ? 'hover:shadow-md transition-shadow border-amber-500/60 bg-amber-50 dark:bg-amber-950/20'
                    : v.ok
                    ? 'hover:shadow-md transition-shadow'
                    : 'hover:shadow-md transition-shadow border-destructive/50 bg-destructive/5'
                }
              >
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-semibold truncate">
                        {c.cnpj && c.company_name ? c.company_name : c.full_name}
                      </div>
                      {c.cnpj && c.company_name && (
                        <div className="text-xs text-muted-foreground truncate">Resp.: {c.full_name}</div>
                      )}
                      <div className="text-xs font-mono text-muted-foreground mt-0.5">
                        {c.cnpj ? `CNPJ ${c.cnpj}` : c.cpf ? `CPF ${c.cpf}` : '—'}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge variant={c.cnpj ? 'default' : 'secondary'}>
                        {c.cnpj ? 'PJ' : 'PF'}
                      </Badge>
                      {(() => {
                        const tier = getTierForScore(tiers, c.score || 0);
                        if (!tier) return null;
                        return (
                          <Badge
                            className="gap-1 text-white border-0"
                            style={{ backgroundColor: tier.color }}
                          >
                            <Award className="w-3 h-3" /> {tier.name} · {c.score || 0}
                          </Badge>
                        );
                      })()}
                      {dup && (
                        <Badge className="gap-1 bg-amber-500 hover:bg-amber-500 text-white">
                          <AlertTriangle className="w-3 h-3" /> Duplicado
                        </Badge>
                      )}
                      {v.ok ? (
                        <Badge variant="outline" className="border-green-600/40 text-green-700 dark:text-green-400 gap-1">
                          <CheckCircle2 className="w-3 h-3" /> NF-e OK
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="w-3 h-3" /> NF-e bloqueada
                        </Badge>
                      )}
                    </div>
                  </div>

                  {c.email && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground truncate">
                      <Mail className="w-3 h-3 shrink-0" /> {c.email}
                    </div>
                  )}
                  <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="w-3 h-3 shrink-0 mt-0.5" />
                    <span className="truncate">
                      {c.street}, {c.number} — {c.neighborhood}
                      {c.municipio && ` · ${c.municipio}/${c.uf}`} · {c.cep}
                    </span>
                  </div>
                  {c.cnpj && (
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <FileText className="w-3 h-3 shrink-0" />
                      IE: {c.inscricao_estadual || '—'} (ind. {c.ie_indicador || '—'})
                    </div>
                  )}

                  {!v.ok && (
                    <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs">
                      <div className="font-semibold text-destructive flex items-center gap-1 mb-1">
                        <AlertTriangle className="w-3 h-3" /> Pendências para NF-e:
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {v.missing.map((m) => (
                          <Badge key={m} variant="outline" className="border-destructive/40 text-destructive font-normal">
                            {m}
                          </Badge>
                        ))}
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="mt-2 w-full h-8 border-primary/40 text-primary hover:text-primary"
                        onClick={() => autoFixOne(c)}
                        disabled={fixingId === c.id}
                      >
                        {fixingId === c.id ? (
                          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <Wand2 className="w-3.5 h-3.5 mr-1.5" />
                        )}
                        Corrigir automaticamente
                      </Button>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2">
                    <Button size="sm" variant="outline" className="flex-1" onClick={() => openEdit(c)}>
                      <Pencil className="w-3.5 h-3.5 mr-1.5" /> Editar
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setScoreFor(c)}>
                      <Award className="w-3.5 h-3.5 mr-1.5" /> Pontos
                    </Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeleteId(c.id)}>
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Dialog cadastrar/editar */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar cliente' : 'Novo cliente'}</DialogTitle>
            <DialogDescription>
              Preencha os dados do cliente. Para emissão de NF-e em CNPJ, informe IE e código IBGE.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="flex gap-2">
              <Button
                type="button"
                variant={form.doc_type === 'cpf' ? 'default' : 'outline'}
                onClick={() => setForm({ ...form, doc_type: 'cpf' })}
                className="flex-1"
              >
                Pessoa Física (CPF)
              </Button>
              <Button
                type="button"
                variant={form.doc_type === 'cnpj' ? 'default' : 'outline'}
                onClick={() => setForm({ ...form, doc_type: 'cnpj' })}
                className="flex-1"
              >
                Pessoa Jurídica (CNPJ)
              </Button>
            </div>

            <div className="space-y-2">
              <Label>{form.doc_type === 'cnpj' ? 'Nome do responsável *' : 'Nome completo *'}</Label>
              <Input
                value={form.full_name}
                onChange={(e) => setForm({ ...form, full_name: e.target.value })}
              />
            </div>

            {form.doc_type === 'cnpj' ? (
              <>
                <div className="space-y-2">
                  <Label>CNPJ *</Label>
                  <div className="flex gap-2">
                    <Input
                      value={form.cnpj}
                      onChange={(e) => {
                        const v = e.target.value;
                        setForm({ ...form, cnpj: v });
                        const digits = v.replace(/\D/g, '');
                        if (digits.length === 14) lookupCnpj(digits);
                      }}
                      placeholder="00.000.000/0000-00"
                      maxLength={18}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      disabled={cnpjLoading}
                      onClick={() => lookupCnpj(form.cnpj.replace(/\D/g, ''))}
                    >
                      {cnpjLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Buscar'}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Preenche automaticamente Razão Social, endereço, município, IBGE e IE (quando disponível).
                  </p>
                </div>
                <div className="space-y-2">
                  <Label>Razão Social *</Label>
                  <Input
                    value={form.company_name}
                    onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                  />
                </div>
              </>
            ) : (
              <div className="space-y-2">
                <Label>CPF *</Label>
                <Input
                  value={form.cpf}
                  onChange={(e) => setForm({ ...form, cpf: e.target.value })}
                  placeholder="000.000.000-00"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label>E-mail</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-2 col-span-2">
                <Label>CEP *</Label>
                <Input
                  value={form.cep}
                  onChange={(e) => setForm({ ...form, cep: e.target.value })}
                  onBlur={buscarCep}
                  placeholder="00000-000"
                />
              </div>
              <div className="space-y-2">
                <Label>UF</Label>
                <Input
                  value={form.uf}
                  onChange={(e) => setForm({ ...form, uf: e.target.value.toUpperCase() })}
                  maxLength={2}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="space-y-2 col-span-2">
                <Label>Rua *</Label>
                <Input value={form.street} onChange={(e) => setForm({ ...form, street: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Número *</Label>
                <Input value={form.number} onChange={(e) => setForm({ ...form, number: e.target.value })} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label>Bairro *</Label>
                <Input value={form.neighborhood} onChange={(e) => setForm({ ...form, neighborhood: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>Complemento</Label>
                <Input value={form.complemento} onChange={(e) => setForm({ ...form, complemento: e.target.value })} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Município</Label>
              <Input value={form.municipio} onChange={(e) => setForm({ ...form, municipio: e.target.value })} />
            </div>

            {form.doc_type === 'cnpj' && (
              <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 space-y-3">
                <p className="text-xs font-semibold text-orange-900">Dados para NF-e</p>
                <div className="space-y-2">
                  <Label>Código IBGE do município *</Label>
                  <Input
                    value={form.codigo_municipio_ibge}
                    onChange={(e) => setForm({ ...form, codigo_municipio_ibge: e.target.value.replace(/\D/g, '') })}
                    maxLength={7}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Indicador de IE *</Label>
                  <Select
                    value={form.ie_indicador}
                    onValueChange={(v) => setForm({ ...form, ie_indicador: v as '1' | '2' | '9' })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 - Contribuinte de ICMS</SelectItem>
                      <SelectItem value="2">2 - Contribuinte isento</SelectItem>
                      <SelectItem value="9">9 - Não contribuinte</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Inscrição Estadual {form.ie_indicador === '1' ? '*' : '(opcional)'}</Label>
                  <Input
                    value={form.inscricao_estadual}
                    onChange={(e) => setForm({ ...form, inscricao_estadual: e.target.value.replace(/\D/g, '') })}
                    inputMode="numeric"
                  />
                </div>
              </div>
            )}

            {form.doc_type === 'cpf' && (
              <div className="space-y-2">
                <Label>Inscrição Estadual (opcional — produtor rural)</Label>
                <Input
                  value={form.inscricao_estadual}
                  onChange={(e) => setForm({ ...form, inscricao_estadual: e.target.value.replace(/\D/g, '') })}
                  inputMode="numeric"
                />
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={save} disabled={saving}>
              {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              {editingId ? 'Salvar alterações' : 'Cadastrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. O cliente será removido permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AdminPageLayout>
  );
}
