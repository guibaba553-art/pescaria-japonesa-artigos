import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { Trash2, UserPlus, Loader2, Users, ShieldCheck, ShieldOff } from 'lucide-react';
import { PanelHeader } from '@/components/admin/PanelHeader';

interface EmployeeRow {
  user_id: string;
  full_name: string | null;
  email: string | null;
  can_access_pdv: boolean;
}

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
      supabase.from('employee_permissions').select('user_id, can_access_pdv').in('user_id', ids),
    ]);

    const rows: EmployeeRow[] = ids.map((id) => {
      const profile = profiles?.find((p) => p.id === id);
      const perm = perms?.find((p) => p.user_id === id);
      return {
        user_id: id,
        full_name: profile?.full_name ?? null,
        email: null,
        can_access_pdv: perm?.can_access_pdv ?? true,
      };
    });
    setEmployees(rows);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const togglePdv = async (userId: string, value: boolean) => {
    setEmployees((prev) => prev.map((e) => (e.user_id === userId ? { ...e, can_access_pdv: value } : e)));
    const { error } = await supabase
      .from('employee_permissions')
      .upsert({ user_id: userId, can_access_pdv: value }, { onConflict: 'user_id' });
    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
      load();
    } else {
      toast({ title: 'Permissão atualizada', description: value ? 'PDV liberado' : 'PDV bloqueado' });
    }
  };

  const addEmployee = async () => {
    const email = newEmail.trim().toLowerCase();
    if (!email) return;
    setAdding(true);

    const { data: matches, error } = await supabase
      .from('profiles')
      .select('id, full_name')
      .ilike('full_name', email)
      .limit(1);

    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
      setAdding(false);
      return;
    }

    if (!matches || matches.length === 0) {
      toast({
        title: 'Usuário não encontrado',
        description: 'O usuário precisa criar uma conta primeiro com este email.',
        variant: 'destructive',
      });
      setAdding(false);
      return;
    }

    const userId = matches[0].id;
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
      .upsert({ user_id: userId, can_access_pdv: true }, { onConflict: 'user_id' });

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

  const withPdv = employees.filter((e) => e.can_access_pdv).length;
  const withoutPdv = employees.length - withPdv;

  const initials = (name: string | null) =>
    (name || '?')
      .split(' ')
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join('')
      .toUpperCase();

  return (
    <Card className="overflow-hidden border-0 shadow-sm">
      <PanelHeader
        icon={Users}
        title="Gestão de Funcionários"
        description="Adicione funcionários por email e controle individualmente os acessos"
        kpis={[
          { label: 'Total', value: employees.length },
          { label: 'Com PDV', value: withPdv, tone: 'success' },
          { label: 'Sem PDV', value: withoutPdv, tone: 'warning' },
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {employees.map((emp) => (
              <Card
                key={emp.user_id}
                className={`border-l-4 transition-all hover:shadow-md ${
                  emp.can_access_pdv ? 'border-l-emerald-500' : 'border-l-orange-500'
                }`}
              >
                <div className="p-4 flex items-center gap-3">
                  <div className="w-12 h-12 shrink-0 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center text-primary font-bold">
                    {initials(emp.full_name)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{emp.full_name || 'Sem nome'}</p>
                    <p className="text-xs text-muted-foreground font-mono truncate">
                      {emp.user_id.slice(0, 8)}...
                    </p>
                    <Badge
                      variant="outline"
                      className={`mt-1.5 text-[10px] uppercase font-semibold ${
                        emp.can_access_pdv
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
                          : 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30'
                      }`}
                    >
                      {emp.can_access_pdv ? (
                        <><ShieldCheck className="w-3 h-3 mr-1" /> PDV liberado</>
                      ) : (
                        <><ShieldOff className="w-3 h-3 mr-1" /> PDV bloqueado</>
                      )}
                    </Badge>
                  </div>
                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <Switch
                      checked={emp.can_access_pdv}
                      onCheckedChange={(v) => togglePdv(emp.user_id, v)}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => removeEmployee(emp.user_id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
