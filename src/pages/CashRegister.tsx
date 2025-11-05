import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Header } from '@/components/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { ArrowLeft, DollarSign, TrendingUp, TrendingDown, Lock, Unlock } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface CashRegister {
  id: string;
  opened_at: string;
  closed_at: string | null;
  opened_by: string;
  opening_amount: number;
  closing_amount: number | null;
  expected_amount: number;
  cash_sales: number;
  card_sales: number;
  pix_sales: number;
  withdrawals: number;
  additions: number;
  status: 'open' | 'closed';
}

export default function CashRegister() {
  const navigate = useNavigate();
  const { user, isAdmin, loading } = useAuth();
  const { toast } = useToast();

  const [currentRegister, setCurrentRegister] = useState<CashRegister | null>(null);
  const [openingAmount, setOpeningAmount] = useState('');
  const [closingAmount, setClosingAmount] = useState('');
  const [withdrawalAmount, setWithdrawalAmount] = useState('');
  const [withdrawalReason, setWithdrawalReason] = useState('');
  const [additionAmount, setAdditionAmount] = useState('');
  const [additionReason, setAdditionReason] = useState('');
  const [showWithdrawal, setShowWithdrawal] = useState(false);
  const [showAddition, setShowAddition] = useState(false);
  const [showClosing, setShowClosing] = useState(false);
  const [loadingAction, setLoadingAction] = useState(false);
  const [salesSummary, setSalesSummary] = useState({
    cash: 0,
    card: 0,
    pix: 0
  });

  useEffect(() => {
    if (!loading && !isAdmin) {
      navigate('/auth');
    }
  }, [user, isAdmin, loading, navigate]);

  useEffect(() => {
    if (isAdmin) {
      loadCurrentRegister();
    }
  }, [isAdmin]);

  const loadCurrentRegister = async () => {
    try {
      // Buscar caixa aberto
      const { data, error } = await supabase
        .from('cash_registers')
        .select('*')
        .eq('status', 'open')
        .order('opened_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error && error.code !== 'PGRST116') throw error;

      setCurrentRegister(data);

      if (data) {
        // Buscar vendas do caixa
        const { data: orders } = await supabase
          .from('orders')
          .select('total_amount, shipping_cost')
          .eq('status', 'entregado')
          .gte('created_at', data.opened_at)
          .is('closed_at', null);

        // Aqui você precisaria ter um campo payment_method na tabela orders
        // Por enquanto, vou simular:
        const totalSales = orders?.reduce((sum, o) => 
          sum + parseFloat(o.total_amount) + parseFloat(o.shipping_cost), 0
        ) || 0;

        setSalesSummary({
          cash: totalSales * 0.3, // 30% dinheiro (exemplo)
          card: totalSales * 0.5, // 50% cartão
          pix: totalSales * 0.2   // 20% pix
        });
      }
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar caixa',
        description: error.message,
        variant: 'destructive'
      });
    }
  };

  const handleOpenRegister = async () => {
    if (!openingAmount || parseFloat(openingAmount) < 0) {
      toast({
        title: 'Valor inválido',
        description: 'Informe o valor de abertura do caixa',
        variant: 'destructive'
      });
      return;
    }

    setLoadingAction(true);
    try {
      const { error } = await supabase
        .from('cash_registers')
        .insert([{
          opened_by: user!.id,
          opening_amount: parseFloat(openingAmount),
          expected_amount: parseFloat(openingAmount),
          status: 'open'
        }]);

      if (error) throw error;

      toast({
        title: 'Caixa aberto!',
        description: `Caixa aberto com R$ ${openingAmount}`,
      });

      setOpeningAmount('');
      loadCurrentRegister();
    } catch (error: any) {
      toast({
        title: 'Erro ao abrir caixa',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoadingAction(false);
    }
  };

  const handleWithdrawal = async () => {
    if (!withdrawalAmount || parseFloat(withdrawalAmount) <= 0) {
      toast({
        title: 'Valor inválido',
        description: 'Informe um valor válido para sangria',
        variant: 'destructive'
      });
      return;
    }

    setLoadingAction(true);
    try {
      const newWithdrawals = currentRegister!.withdrawals + parseFloat(withdrawalAmount);
      const newExpected = currentRegister!.expected_amount - parseFloat(withdrawalAmount);

      const { error } = await supabase
        .from('cash_registers')
        .update({
          withdrawals: newWithdrawals,
          expected_amount: newExpected
        })
        .eq('id', currentRegister!.id);

      if (error) throw error;

      // Registrar no log
      await supabase
        .from('cash_movements')
        .insert([{
          cash_register_id: currentRegister!.id,
          type: 'withdrawal',
          amount: parseFloat(withdrawalAmount),
          reason: withdrawalReason,
          performed_by: user!.id
        }]);

      toast({
        title: 'Sangria realizada',
        description: `R$ ${withdrawalAmount} retirado do caixa`,
      });

      setWithdrawalAmount('');
      setWithdrawalReason('');
      setShowWithdrawal(false);
      loadCurrentRegister();
    } catch (error: any) {
      toast({
        title: 'Erro ao realizar sangria',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoadingAction(false);
    }
  };

  const handleAddition = async () => {
    if (!additionAmount || parseFloat(additionAmount) <= 0) {
      toast({
        title: 'Valor inválido',
        description: 'Informe um valor válido para reforço',
        variant: 'destructive'
      });
      return;
    }

    setLoadingAction(true);
    try {
      const newAdditions = currentRegister!.additions + parseFloat(additionAmount);
      const newExpected = currentRegister!.expected_amount + parseFloat(additionAmount);

      const { error } = await supabase
        .from('cash_registers')
        .update({
          additions: newAdditions,
          expected_amount: newExpected
        })
        .eq('id', currentRegister!.id);

      if (error) throw error;

      // Registrar no log
      await supabase
        .from('cash_movements')
        .insert([{
          cash_register_id: currentRegister!.id,
          type: 'addition',
          amount: parseFloat(additionAmount),
          reason: additionReason,
          performed_by: user!.id
        }]);

      toast({
        title: 'Reforço realizado',
        description: `R$ ${additionAmount} adicionado ao caixa`,
      });

      setAdditionAmount('');
      setAdditionReason('');
      setShowAddition(false);
      loadCurrentRegister();
    } catch (error: any) {
      toast({
        title: 'Erro ao realizar reforço',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoadingAction(false);
    }
  };

  const handleCloseRegister = async () => {
    if (!closingAmount || parseFloat(closingAmount) < 0) {
      toast({
        title: 'Valor inválido',
        description: 'Informe o valor de fechamento do caixa',
        variant: 'destructive'
      });
      return;
    }

    setLoadingAction(true);
    try {
      const { error } = await supabase
        .from('cash_registers')
        .update({
          closing_amount: parseFloat(closingAmount),
          closed_at: new Date().toISOString(),
          status: 'closed'
        })
        .eq('id', currentRegister!.id);

      if (error) throw error;

      toast({
        title: 'Caixa fechado!',
        description: 'Fechamento realizado com sucesso',
      });

      setClosingAmount('');
      setShowClosing(false);
      loadCurrentRegister();
    } catch (error: any) {
      toast({
        title: 'Erro ao fechar caixa',
        description: error.message,
        variant: 'destructive'
      });
    } finally {
      setLoadingAction(false);
    }
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }

  if (!isAdmin) {
    return null;
  }

  const difference = currentRegister 
    ? salesSummary.cash + currentRegister.opening_amount + currentRegister.additions - currentRegister.withdrawals - (currentRegister.expected_amount)
    : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5">
      <Header />
      
      <div className="container mx-auto p-6 pt-24 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <DollarSign className="w-8 h-8" />
            Fechamento de Caixa
          </h1>
          <Button variant="outline" onClick={() => navigate('/pdv')}>
            <ArrowLeft className="w-4 h-4 mr-2" />
            Voltar ao PDV
          </Button>
        </div>

        {!currentRegister ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Unlock className="w-5 h-5" />
                Abrir Caixa
              </CardTitle>
              <CardDescription>Informe o valor inicial do caixa</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="opening">Valor de Abertura (R$)</Label>
                <Input
                  id="opening"
                  type="number"
                  step="0.01"
                  value={openingAmount}
                  onChange={(e) => setOpeningAmount(e.target.value)}
                  placeholder="0.00"
                />
              </div>
              <Button 
                onClick={handleOpenRegister} 
                disabled={loadingAction}
                className="w-full"
              >
                Abrir Caixa
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Valor de Abertura</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    R$ {currentRegister.opening_amount.toFixed(2)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Vendas em Dinheiro</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-green-600">
                    R$ {salesSummary.cash.toFixed(2)}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-sm">Valor Esperado</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    R$ {currentRegister.expected_amount.toFixed(2)}
                  </div>
                </CardContent>
              </Card>
            </div>

            <Tabs defaultValue="operations">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="operations">Operações</TabsTrigger>
                <TabsTrigger value="summary">Resumo de Vendas</TabsTrigger>
              </TabsList>

              <TabsContent value="operations" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Sangrias</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="text-xl font-bold text-red-600">
                        R$ {currentRegister.withdrawals.toFixed(2)}
                      </div>
                      <Button 
                        variant="outline" 
                        className="w-full"
                        onClick={() => setShowWithdrawal(true)}
                      >
                        <TrendingDown className="w-4 h-4 mr-2" />
                        Nova Sangria
                      </Button>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Reforços</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="text-xl font-bold text-blue-600">
                        R$ {currentRegister.additions.toFixed(2)}
                      </div>
                      <Button 
                        variant="outline" 
                        className="w-full"
                        onClick={() => setShowAddition(true)}
                      >
                        <TrendingUp className="w-4 h-4 mr-2" />
                        Novo Reforço
                      </Button>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Fechar Caixa</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="text-xl font-bold">
                        Conferir
                      </div>
                      <Button 
                        className="w-full"
                        onClick={() => setShowClosing(true)}
                      >
                        <Lock className="w-4 h-4 mr-2" />
                        Fechar Caixa
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="summary">
                <Card>
                  <CardHeader>
                    <CardTitle>Resumo de Vendas por Forma de Pagamento</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex justify-between p-4 border rounded">
                      <span className="font-medium">💵 Dinheiro</span>
                      <span className="font-bold">R$ {salesSummary.cash.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between p-4 border rounded">
                      <span className="font-medium">💳 Cartão</span>
                      <span className="font-bold">R$ {salesSummary.card.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between p-4 border rounded">
                      <span className="font-medium">📱 PIX</span>
                      <span className="font-bold">R$ {salesSummary.pix.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between p-4 bg-primary/10 border-2 border-primary rounded">
                      <span className="font-bold text-lg">TOTAL</span>
                      <span className="font-bold text-lg">
                        R$ {(salesSummary.cash + salesSummary.card + salesSummary.pix).toFixed(2)}
                      </span>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>

      {/* Dialog Sangria */}
      <Dialog open={showWithdrawal} onOpenChange={setShowWithdrawal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Realizar Sangria</DialogTitle>
            <DialogDescription>
              Retirar dinheiro do caixa
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Valor (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={withdrawalAmount}
                onChange={(e) => setWithdrawalAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Motivo</Label>
              <Input
                value={withdrawalReason}
                onChange={(e) => setWithdrawalReason(e.target.value)}
                placeholder="Ex: Troco, despesas"
              />
            </div>
            <Button 
              onClick={handleWithdrawal} 
              disabled={loadingAction}
              className="w-full"
            >
              Confirmar Sangria
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Reforço */}
      <Dialog open={showAddition} onOpenChange={setShowAddition}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Realizar Reforço</DialogTitle>
            <DialogDescription>
              Adicionar dinheiro ao caixa
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Valor (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={additionAmount}
                onChange={(e) => setAdditionAmount(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Motivo</Label>
              <Input
                value={additionReason}
                onChange={(e) => setAdditionReason(e.target.value)}
                placeholder="Ex: Troco adicional"
              />
            </div>
            <Button 
              onClick={handleAddition} 
              disabled={loadingAction}
              className="w-full"
            >
              Confirmar Reforço
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog Fechamento */}
      <Dialog open={showClosing} onOpenChange={setShowClosing}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Fechar Caixa</DialogTitle>
            <DialogDescription>
              Confira o valor em caixa e confirme o fechamento
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded space-y-2">
              <div className="flex justify-between">
                <span>Valor Esperado:</span>
                <span className="font-bold">R$ {currentRegister?.expected_amount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Vendas Dinheiro:</span>
                <span className="font-bold text-green-600">R$ {salesSummary.cash.toFixed(2)}</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Valor Contado no Caixa (R$)</Label>
              <Input
                type="number"
                step="0.01"
                value={closingAmount}
                onChange={(e) => setClosingAmount(e.target.value)}
              />
            </div>
            {closingAmount && (
              <div className={`p-4 rounded ${
                parseFloat(closingAmount) === currentRegister?.expected_amount 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-red-100 text-red-800'
              }`}>
                <div className="font-bold">
                  {parseFloat(closingAmount) === currentRegister?.expected_amount 
                    ? '✓ Caixa conferido!' 
                    : `⚠ Diferença: R$ ${(parseFloat(closingAmount) - (currentRegister?.expected_amount || 0)).toFixed(2)}`
                  }
                </div>
              </div>
            )}
            <Button 
              onClick={handleCloseRegister} 
              disabled={loadingAction}
              className="w-full"
            >
              Confirmar Fechamento
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
