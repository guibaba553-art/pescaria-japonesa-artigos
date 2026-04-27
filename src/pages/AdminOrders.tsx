import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { ClipboardList } from 'lucide-react';
import { AdminPageLayout } from '@/components/admin/AdminPageLayout';
import { OrdersManagement } from '@/components/OrdersManagement';

export default function AdminOrders() {
  const navigate = useNavigate();
  const { user, isEmployee, isAdmin, permissions, loading } = useAuth();
  const canView = isAdmin || (isEmployee && permissions.orders);

  useEffect(() => {
    if (!loading && !canView) {
      navigate('/admin');
    }
  }, [user, canView, loading, navigate]);

  if (loading) return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  if (!canView) return null;

  return (
    <AdminPageLayout
      icon={ClipboardList}
      eyebrow="Pedidos"
      title="Gestão de Pedidos do Site"
      description="Acompanhe, filtre e gerencie todos os pedidos da sua loja online em tempo real."
    >
      <OrdersManagement />
    </AdminPageLayout>
  );
}
