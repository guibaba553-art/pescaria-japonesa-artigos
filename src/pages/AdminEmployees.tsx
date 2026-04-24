import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Users } from 'lucide-react';
import { AdminPageLayout } from '@/components/admin/AdminPageLayout';
import { EmployeesManagement } from '@/components/EmployeesManagement';

export default function AdminEmployees() {
  const navigate = useNavigate();
  const { user, isAdmin, loading } = useAuth();

  useEffect(() => {
    if (!loading && !isAdmin) {
      navigate('/admin');
    }
  }, [user, isAdmin, loading, navigate]);

  if (loading) return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  if (!isAdmin) return null;

  return (
    <AdminPageLayout
      icon={Users}
      eyebrow="Equipe"
      title="Gestão de Funcionários"
      description="Adicione funcionários, controle permissões individuais e acompanhe quem tem acesso ao PDV."
    >
      <EmployeesManagement />
    </AdminPageLayout>
  );
}
