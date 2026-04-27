import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Trash2, UserPlus, Loader2, Users, ShieldCheck,
  Package, ShoppingCart, DollarSign, TrendingUp,
  ClipboardList, CalendarRange, ScanBarcode, Calculator,
} from 'lucide-react';
import { PanelHeader } from '@/components/admin/PanelHeader';

type PermKey =
  | 'can_access_pdv'
  | 'can_access_catalog'
  | 'can_access_cash_register'
  | 'can_access_dashboard'
  | 'can_access_orders'
  | 'can_access_sales_analysis'
  | 'can_access_triagem'
  | 'can_access_fiscal';

interface EmployeeRow {
  user_id: string;
  full_name: string | null;
  can_access_pdv: boolean;
  can_access_catalog: boolean;
  can_access_cash_register: boolean;
  can_access_dashboard: boolean;
  can_access_orders: boolean;
  can_access_sales_analysis: boolean;
  can_access_triagem: boolean;
  can_access_fiscal: boolean;
}

const PERMISSIONS: Array<{ key: PermKey; label: string; icon: any; defaultValue: boolean }> = [
  { key: 'can_access_pdv', label: 'PDV', icon: ShoppingCart, defaultValue: true },
  { key: 'can_access_catalog', label: 'Catálogo', icon: Package, defaultValue: true },
  { key: 'can_access_orders', label: 'Pedidos', icon: ClipboardList, defaultValue: true },
  { key: 'can_access_triagem', label: 'Triagem', icon: ScanBarcode, defaultValue: true },
  { key: 'can_access_cash_register', label: 'Caixa', icon: DollarSign, defaultValue: false },
  { key: 'can_access_dashboard', label: 'Dashboard', icon: TrendingUp, defaultValue: false },
  { key: 'can_access_sales_analysis', label: 'Análise de Vendas', icon: CalendarRange, defaultValue: false },
  { key: 'can_access_fiscal', label: 'Fiscal', icon: Calculator, defaultValue: false },
];

const defaultPerms = (): Pick<EmployeeRow, PermKey> => {
  const out: any = {};
  PERMISSIONS.forEach((p) => { out[p.key] = p.defaultValue; });
  return out;
};

export function EmployeesManagement() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [adding, setAdding] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: roles, error: rolesErr } = await supabase
      .from('user_roles')
      .select('user_id')
      .eq('role', 'employee');

    if (rolesErr) {
      toast({ title: 'Erro', description: rolesErr.message, variant: 'destructive' });
      setLoading(false);
      return;
    }

    const ids = (roles || []).map((r) => r.user_id);
    if (ids.length === 0) {
      setEmployees([]);
      setLoading(false);
      return;
    }

    const [{ data: profiles }, { data: perms }] = await Promise.all([
      supabase.from('profiles').select('id, full_name').in('id', ids),
      supabase.from('employee_permissions').select('*').in('user_id', ids),
    ]);

    const rows: EmployeeRow[] = ids.map((id) => {
      const profile = profiles?.find((p) => p.id === id);
      const perm = perms?.find((p: any) => p.user_id === id);
      const defaults = defaultPerms();
      return {
        user_id: id,
        full_name: profile?.full_name ?? null,
        can_access_pdv: perm?.can_access_pdv ?? defaults.can_access_pdv,
        can_access_catalog: perm?.can_access_catalog ?? defaults.can_access_catalog,
        can_access_cash_register: perm?.can_access_cash_register ?? defaults.can_access_cash_register,
        can_access_dashboard: perm?.can_access_dashboard ?? defaults.can_access_dashboard,
        can_access_orders: perm?.can_access_orders ?? defaults.can_access_orders,
        can_access_sales_analysis: perm?.can_access_sales_analysis ?? defaults.can_access_sales_analysis,
        can_access_triagem: perm?.can_access_triagem ?? defaults.can_access_triagem,
        can_access_fiscal: perm?.can_access_fiscal ?? defaults.can_access_fiscal,
      };
    });
    setEmployees(rows);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const togglePermission = async (userId: string, key: PermKey, value: boolean) => {
    setEmployees((prev) =>
      prev.map((e) => (e.user_id === userId ? { ...e, [key]: value } : e))
    );

    const current = employees.find((e) => e.user_id === userId);
    if (!current) return;

    const payload: any = {
      user_id: userId,
      can_access_pdv: current.can_access_pdv,
      can_access_catalog: current.can_access_catalog,
      can_access_cash_register: current.can_access_cash_register,
      can_access_dashboard: current.can_access_dashboard,
      can_access_orders: current.can_access_orders,
      can_access_sales_analysis: current.can_access_sales_analysis,
      can_access_triagem: current.can_access_triagem,
      can_access_fiscal: current.can_access_fiscal,
      [key]: value,
    };

    const { error } = await supabase
      .from('employee_permissions')
      .upsert(payload, { onConflict: 'user_id' });

    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
      load();
    } else {
      const label = PERMISSIONS.find((p) => p.key === key)?.label ?? key;
      toast({ title: 'Permissão atualizada', description: `${label}: ${value ? 'liberado' : 'bloqueado'}` });
    }
  };

  const addEmployee = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    setAdding(true);

    const { data: userId, error } = await supabase
      .rpc('get_user_id_by_email', { _email: email });

    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      setAdding(false);
      return;
    }

    if (!userId) {
      toast({
        title: 'Usuário não encontrado',
        description: 'O usuário precisa criar uma conta primeiro com este email.',
        variant: 'destructive',
      });
      setAdding(false);
      return;
    }

    const { error: roleErr } = await supabase
      .from('user_roles')
      .insert({ user_id: userId, role: 'employee' });

    if (roleErr && !roleErr.message.includes('duplicate')) {
      toast({ title: 'Erro', description: roleErr.message, variant: 'destructive' });
      setAdding(false);
      return;
    }

    await supabase
      .from('employee_permissions')
      .upsert({ user_id: userId, ...defaultPerms() }, { onConflict: 'user_id' });

    toast({ title: 'Funcionário adicionado!' });
    setNewEmail('');
    setAdding(false);
    load();
  };

  const removeEmployee = async (userId: string) => {
    if (!confirm('Remover este funcionário? Ele perderá acesso ao painel.')) return;
    const { error } = await supabase
      .from('user_roles')
      .delete()
      .eq('user_id', userId)
      .eq('role', 'employee');
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      return;
    }
    await supabase.from('employee_permissions').delete().eq('user_id', userId);
    toast({ title: 'Funcionário removido' });
    load();
  };

  const initials = (name: string | null) =>
    (name || '?')
      .split(' ')
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase();

  const countActive = (emp: EmployeeRow) =>
    PERMISSIONS.filter((p) => emp[p.key]).length;

  return (
    <Card className="overflow-hidden border-0 shadow-sm">
      <PanelHeader
        icon={Users}
        title="Gestão de Funcionários"
        description="Adicione funcionários por email e controle individualmente cada área do painel"
        kpis={[
          { label: 'Total', value: employees.length },
          { label: 'Áreas disponíveis', value: PERMISSIONS.length },
        ]}
      />

      <CardContent className="p-4 md:p-6 space-y-6">
        {/* Adicionar funcionário */}
        <div className="rounded-xl border bg-muted/30 p-4">
          <Label htmlFor="new-employee-email" className="text-xs uppercase tracking-wide text-muted-foreground font-semibold">
            Adicionar novo funcionário
          </Label>
          <div className="flex gap-2 items-center mt-2">
            <Input
              id="new-employee-email"
              type="email"
              placeholder="funcionario@email.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              className="flex-1"
            />
            <Button onClick={addEmployee} disabled={adding || !newEmail.trim()} className="gap-2">
              {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
              Adicionar
            </Button>
          </div>
        </div>

        {/* Lista */}
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : employees.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground rounded-xl border border-dashed bg-muted/30">
            <Users className="w-14 h-14 mb-3 opacity-40" />
            <p className="text-sm font-medium">Nenhum funcionário cadastrado</p>
            <p className="text-xs opacity-70 mt-1">Adicione o primeiro funcionário pelo email acima</p>
          </div>
        ) : (
          <div className="space-y-4">
            {employees.map((emp) => {
              const active = countActive(emp);
              return (
                <Card key={emp.user_id} className="border-l-4 border-l-primary/40">
                  {/* Header */}
                  <div className="p-4 flex items-center gap-3 border-b">
                    <div className="w-12 h-12 shrink-0 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center text-primary font-bold">
                      {initials(emp.full_name)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{emp.full_name || 'Sem nome'}</p>
                      <p className="text-xs text-muted-foreground font-mono truncate">
                        {emp.user_id.slice(0, 8)}...
                      </p>
                    </div>
                    <Badge variant="outline" className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30">
                      <ShieldCheck className="w-3 h-3 mr-1" />
                      {active}/{PERMISSIONS.length} áreas
                    </Badge>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => removeEmployee(emp.user_id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>

                  {/* Permissões */}
                  <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {PERMISSIONS.map(({ key, label, icon: Icon }) => {
                      const enabled = emp[key];
                      return (
                        <div
                          key={key}
                          className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                            enabled ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-muted/30'
                          }`}
                        >
                          <div className={`w-9 h-9 shrink-0 rounded-md flex items-center justify-center ${
                            enabled ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400' : 'bg-muted text-muted-foreground'
                          }`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate">{label}</p>
                            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                              {enabled ? 'Liberado' : 'Bloqueado'}
                            </p>
                          </div>
                          <Switch
                            checked={enabled}
                            onCheckedChange={(v) => togglePermission(emp.user_id, key, v)}
                          />
                        </div>
                      );
                    })}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
