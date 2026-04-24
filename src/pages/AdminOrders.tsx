import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { ClipboardList } from 'lucide-react';
import { AdminPageLayout } from '@/components/admin/AdminPageLayout';
import { OrdersManagement } from '@/components/OrdersManagement';

export default function AdminOrders() {
  const navigate = useNavigate();
  const { user, isEmployee, isAdmin, loading } = useAuth();

  useEffect(() => {
    if (!loading && !isEmployee && !isAdmin) {
      navigate('/auth');
    }
  }, [user, isEmployee, isAdmin, loading, navigate]);

  if (loading) return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  if (!isEmployee && !isAdmin) return null;

  return (
    <AdminPageLayout
      icon={ClipboardList}
      eyebrow="Pedidos"
      title="Gestão de Pedidos"
      description="Acompanhe, filtre e gerencie todos os pedidos da sua loja online em tempo real."
    >
      <OrdersManagement />
    </AdminPageLayout>
  );
}
