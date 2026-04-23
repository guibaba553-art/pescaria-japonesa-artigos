import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { Trash2, UserPlus, Loader2 } from 'lucide-react';

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
    // Get all employees from user_roles
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

    // Find user by email in profiles via full_name fallback won't work; try matching profile through auth metadata is unavailable client-side.
    // We search profiles by matching a placeholder: we ask user to enter email and look up the user via profiles.full_name OR ask them to provide the user id.
    // Best-effort: query profiles where full_name = email (handle_new_user uses email when full_name is null).
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Gerenciar Funcionários</CardTitle>
        <CardDescription>
          Adicione funcionários por email e controle individualmente os acessos.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <Label htmlFor="new-employee-email">Email do funcionário</Label>
            <Input
              id="new-employee-email"
              type="email"
              placeholder="funcionario@email.com"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
          </div>
          <Button onClick={addEmployee} disabled={adding || !newEmail.trim()}>
            {adding ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            Adicionar
          </Button>
        </div>

        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin" />
          </div>
        ) : employees.length === 0 ? (
          <p className="text-center text-muted-foreground py-8">Nenhum funcionário cadastrado.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Funcionário</TableHead>
                <TableHead className="text-center">Acesso ao PDV</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {employees.map((emp) => (
                <TableRow key={emp.user_id}>
                  <TableCell>
                    <div className="font-medium">{emp.full_name || 'Sem nome'}</div>
                    <div className="text-xs text-muted-foreground font-mono">{emp.user_id.slice(0, 8)}...</div>
                  </TableCell>
                  <TableCell className="text-center">
                    <Switch
                      checked={emp.can_access_pdv}
                      onCheckedChange={(v) => togglePdv(emp.user_id, v)}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => removeEmployee(emp.user_id)}
                    >
                      <Trash2 className="w-4 h-4 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
