import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Settings } from 'lucide-react';
import { AdminPageLayout } from '@/components/admin/AdminPageLayout';
import { CompanySettingsForm } from '@/components/CompanySettingsForm';

export default function AdminSettings() {
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
      icon={Settings}
      eyebrow="Configurações"
      title="Configurações da Empresa"
      description="CNPJ, razão social, endereço e dados de contato usados em comprovantes e documentos oficiais."
    >
      <CompanySettingsForm />
    </AdminPageLayout>
  );
}
