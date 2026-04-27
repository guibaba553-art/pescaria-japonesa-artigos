import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Header } from '@/components/Header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  ArrowLeft, DollarSign, TrendingUp, TrendingDown, Lock, Unlock,
  Clock, Receipt, Printer, History, Target, ShoppingCart,
} from 'lucide-react';
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
  status: string;
}

interface CashMovement {
  id: string;
  type: string;
  amount: number;
  reason: string | null;
  created_at: string;
}

const formatBRL = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const formatDateTime = (s: string) =>
  new Date(s).toLocaleString('pt-BR');

const formatDuration = (start: string) => {
  const ms = Date.now() - new Date(start).getTime();
  const h = Math.floor(ms / (1000 * 60 * 60));
  const m = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
  return `${h}h ${m}min`;
};

export default function CashRegister() {
  const navigate = useNavigate();
  const { user, isAdmin, permissions, loading } = useAuth();
  const { toast } = useToast();

  const canView = isAdmin || permissions.cash_register;

  const [currentRegister, setCurrentRegister] = useState<CashRegister | null>(null);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [history, setHistory] = useState<CashRegister[]>([]);
  const [salesCount, setSalesCount] = useState(0);
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
  const [salesSummary, setSalesSummary] = useState({ cash: 0, card: 0, pix: 0 });

  useEffect(() => {
    if (!loading && !canView) navigate('/admin');
  }, [user, canView, loading, navigate]);

  useEffect(() => {
    if (canView) {
      loadCurrentRegister();
      loadHistory();
    }
  }, [canView]);

  const loadCurrentRegister = async () => {
    try {
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
        const { data: sales } = await supabase
          .from('saved_sales')
          .select('total_amount, payment_method')
          .gte('created_at', data.opened_at);

        const summary = { cash: 0, card: 0, pix: 0 };
        (sales || []).forEach((s) => {
          const amount = Number(s.total_amount) || 0;
          const method = (s.payment_method || '').toLowerCase();
          if (method.includes('dinheiro') || method === 'cash') summary.cash += amount;
          else if (method.includes('pix')) summary.pix += amount;
          else if (
            method.includes('cart') || method.includes('card') ||
            method.includes('credit') || method.includes('debit')
          ) summary.card += amount;
        });
        setSalesSummary(summary);
        setSalesCount((sales || []).length);

        // Movimentações deste caixa
        const { data: movs } = await supabase
          .from('cash_movements')
          .select('id, type, amount, reason, created_at')
          .eq('cash_register_id', data.id)
          .order('created_at', { ascending: false });
        setMovements(movs || []);
      } else {
        setMovements([]);
        setSalesCount(0);
      }
    } catch (error: any) {
      toast({ title: 'Erro ao carregar caixa', description: error.message, variant: 'destructive' });
    }
  };

  const loadHistory = async () => {
    try {
      const { data } = await supabase
        .from('cash_registers')
        .select('*')
        .eq('status', 'closed')
        .order('closed_at', { ascending: false })
        .limit(20);
      setHistory(data || []);
    } catch (error: any) {
      console.error('Erro ao carregar histórico:', error);
    }
  };

  const handleOpenRegister = async () => {
    if (!openingAmount || parseFloat(openingAmount) < 0) {
      toast({ title: 'Valor inválido', description: 'Informe o valor de abertura', variant: 'destructive' });
      return;
    }
    setLoadingAction(true);
    try {
      const { error } = await supabase.from('cash_registers').insert([{
        opened_by: user!.id,
        opening_amount: parseFloat(openingAmount),
        expected_amount: parseFloat(openingAmount),
        status: 'open',
      }]);
      if (error) throw error;
      toast({ title: 'Caixa aberto!', description: `Caixa aberto com R$ ${openingAmount}` });
      setOpeningAmount('');
      loadCurrentRegister();
    } catch (error: any) {
      toast({ title: 'Erro ao abrir caixa', description: error.message, variant: 'destructive' });
    } finally {
      setLoadingAction(false);
    }
  };

  const handleWithdrawal = async () => {
    if (!withdrawalAmount || parseFloat(withdrawalAmount) <= 0) {
      toast({ title: 'Valor inválido', variant: 'destructive' });
      return;
    }
    setLoadingAction(true);
    try {
      const newWithdrawals = currentRegister!.withdrawals + parseFloat(withdrawalAmount);
      const newExpected = currentRegister!.expected_amount - parseFloat(withdrawalAmount);
      const { error } = await supabase.from('cash_registers').update({
        withdrawals: newWithdrawals, expected_amount: newExpected,
      }).eq('id', currentRegister!.id);
      if (error) throw error;
      await supabase.from('cash_movements').insert([{
        cash_register_id: currentRegister!.id, type: 'withdrawal',
        amount: parseFloat(withdrawalAmount), reason: withdrawalReason, performed_by: user!.id,
      }]);
      toast({ title: 'Sangria realizada', description: `R$ ${withdrawalAmount} retirado` });
      setWithdrawalAmount(''); setWithdrawalReason(''); setShowWithdrawal(false);
      loadCurrentRegister();
    } catch (error: any) {
      toast({ title: 'Erro ao realizar sangria', description: error.message, variant: 'destructive' });
    } finally { setLoadingAction(false); }
  };

  const handleAddition = async () => {
    if (!additionAmount || parseFloat(additionAmount) <= 0) {
      toast({ title: 'Valor inválido', variant: 'destructive' });
      return;
    }
    setLoadingAction(true);
    try {
      const newAdditions = currentRegister!.additions + parseFloat(additionAmount);
      const newExpected = currentRegister!.expected_amount + parseFloat(additionAmount);
      const { error } = await supabase.from('cash_registers').update({
        additions: newAdditions, expected_amount: newExpected,
      }).eq('id', currentRegister!.id);
      if (error) throw error;
      await supabase.from('cash_movements').insert([{
        cash_register_id: currentRegister!.id, type: 'addition',
        amount: parseFloat(additionAmount), reason: additionReason, performed_by: user!.id,
      }]);
      toast({ title: 'Reforço realizado', description: `R$ ${additionAmount} adicionado` });
      setAdditionAmount(''); setAdditionReason(''); setShowAddition(false);
      loadCurrentRegister();
    } catch (error: any) {
      toast({ title: 'Erro ao realizar reforço', description: error.message, variant: 'destructive' });
    } finally { setLoadingAction(false); }
  };

  const handleCloseRegister = async () => {
    if (!closingAmount || parseFloat(closingAmount) < 0) {
      toast({ title: 'Valor inválido', variant: 'destructive' });
      return;
    }
    setLoadingAction(true);
    try {
      const { error } = await supabase.from('cash_registers').update({
        closing_amount: parseFloat(closingAmount),
        closed_at: new Date().toISOString(),
        status: 'closed',
        cash_sales: salesSummary.cash,
        card_sales: salesSummary.card,
        pix_sales: salesSummary.pix,
      }).eq('id', currentRegister!.id);
      if (error) throw error;
      toast({ title: 'Caixa fechado!' });
      setClosingAmount(''); setShowClosing(false);
      loadCurrentRegister();
      loadHistory();
    } catch (error: any) {
      toast({ title: 'Erro ao fechar caixa', description: error.message, variant: 'destructive' });
    } finally { setLoadingAction(false); }
  };

  const printReport = () => {
    if (!currentRegister) return;
    const totalSales = salesSummary.cash + salesSummary.card + salesSummary.pix;
    const avgTicket = salesCount > 0 ? totalSales / salesCount : 0;
    const w = window.open('', '_blank', 'width=400,height=600');
    if (!w) return;
    w.document.write(`
      <html><head><title>Relatório de Caixa</title>
      <style>
        body { font-family: monospace; padding: 16px; max-width: 360px; }
        h2 { text-align: center; margin: 4px 0; }
        hr { border: none; border-top: 1px dashed #000; margin: 8px 0; }
        .row { display: flex; justify-content: space-between; padding: 2px 0; }
        .total { font-weight: bold; font-size: 14px; }
      </style></head><body>
      <h2>RELATÓRIO DE CAIXA</h2>
      <div class="row"><span>Aberto em:</span><span>${formatDateTime(currentRegister.opened_at)}</span></div>
      <div class="row"><span>Tempo aberto:</span><span>${formatDuration(currentRegister.opened_at)}</span></div>
      <hr/>
      <div class="row"><span>Abertura:</span><span>${formatBRL(currentRegister.opening_amount)}</span></div>
      <div class="row"><span>Reforços:</span><span>${formatBRL(currentRegister.additions)}</span></div>
      <div class="row"><span>Sangrias:</span><span>-${formatBRL(currentRegister.withdrawals)}</span></div>
      <hr/>
      <div class="row"><span>Vendas Dinheiro:</span><span>${formatBRL(salesSummary.cash)}</span></div>
      <div class="row"><span>Vendas Cartão:</span><span>${formatBRL(salesSummary.card)}</span></div>
      <div class="row"><span>Vendas PIX:</span><span>${formatBRL(salesSummary.pix)}</span></div>
      <div class="row total"><span>Total Vendas:</span><span>${formatBRL(totalSales)}</span></div>
      <hr/>
      <div class="row"><span>Nº de vendas:</span><span>${salesCount}</span></div>
      <div class="row"><span>Ticket médio:</span><span>${formatBRL(avgTicket)}</span></div>
      <hr/>
      <div class="row total"><span>Esperado em caixa:</span><span>${formatBRL(currentRegister.expected_amount)}</span></div>
      <p style="text-align:center; font-size:11px;">Impresso em ${new Date().toLocaleString('pt-BR')}</p>
      </body></html>
    `);
    w.document.close();
    setTimeout(() => w.print(), 250);
  };

  const totalSales = salesSummary.cash + salesSummary.card + salesSummary.pix;
  const avgTicket = salesCount > 0 ? totalSales / salesCount : 0;

  if (loading) return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  if (!canView) return null;

  return (
    <div className="min-h-screen bg-muted/30">
      <Header />

      {/* Banner */}
      <div className="bg-foreground text-background pt-20 lg:pt-32 pb-8">
        <div className="container mx-auto px-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 text-primary mb-3">
                <DollarSign className="w-3.5 h-3.5" />
                <span className="text-[11px] font-bold uppercase tracking-wider">Caixa</span>
              </div>
              <h1 className="text-3xl md:text-4xl font-display font-black tracking-tight">
                Fechamento de Caixa
              </h1>
              <p className="text-sm text-background/60 mt-1">
                Abertura, sangrias, suprimentos, vendas e fechamento.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {currentRegister && (
                <Button
                  variant="outline"
                  onClick={printReport}
                  className="rounded-full bg-transparent border-background/20 text-background hover:bg-background hover:text-foreground"
                >
                  <Printer className="w-4 h-4 mr-2" />
                  Imprimir
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() => navigate('/pdv')}
                className="rounded-full bg-transparent border-background/20 text-background hover:bg-background hover:text-foreground"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Voltar ao PDV
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="container mx-auto p-6 -mt-4 space-y-6">
        {!currentRegister ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Unlock className="w-5 h-5" /> Abrir Caixa
                </CardTitle>
                <CardDescription>Informe o valor inicial do caixa</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="opening">Valor de Abertura (R$)</Label>
                  <Input
                    id="opening" type="number" step="0.01"
                    value={openingAmount}
                    onChange={(e) => setOpeningAmount(e.target.value)}
                    placeholder="0.00"
                  />
                </div>
                <Button onClick={handleOpenRegister} disabled={loadingAction} className="w-full">
                  Abrir Caixa
                </Button>
              </CardContent>
            </Card>

            {/* Histórico mesmo sem caixa aberto */}
            {history.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <History className="w-5 h-5" /> Últimos Fechamentos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <HistoryList history={history} />
                </CardContent>
              </Card>
            )}
          </>
        ) : (
          <>
            {/* KPIs principais */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard label="Abertura" value={formatBRL(currentRegister.opening_amount)} icon={<Unlock className="w-4 h-4" />} />
              <KpiCard label="Vendas (total)" value={formatBRL(totalSales)} icon={<DollarSign className="w-4 h-4" />} accent="text-green-600" />
              <KpiCard label="Esperado em caixa" value={formatBRL(currentRegister.expected_amount)} icon={<Target className="w-4 h-4" />} />
              <KpiCard label="Aberto há" value={formatDuration(currentRegister.opened_at)} icon={<Clock className="w-4 h-4" />} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard label="Nº de vendas" value={String(salesCount)} icon={<ShoppingCart className="w-4 h-4" />} />
              <KpiCard label="Ticket médio" value={formatBRL(avgTicket)} icon={<Target className="w-4 h-4" />} />
              <KpiCard label="Reforços" value={formatBRL(currentRegister.additions)} icon={<TrendingUp className="w-4 h-4" />} accent="text-blue-600" />
              <KpiCard label="Sangrias" value={formatBRL(currentRegister.withdrawals)} icon={<TrendingDown className="w-4 h-4" />} accent="text-red-600" />
            </div>

            <Tabs defaultValue="operations">
              <TabsList className="grid w-full grid-cols-4">
                <TabsTrigger value="operations">Operações</TabsTrigger>
                <TabsTrigger value="summary">Vendas</TabsTrigger>
                <TabsTrigger value="movements">Movimentações</TabsTrigger>
                <TabsTrigger value="history">Histórico</TabsTrigger>
              </TabsList>

              <TabsContent value="operations" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <ActionCard
                    title="Sangria"
                    desc="Retirar dinheiro"
                    value={formatBRL(currentRegister.withdrawals)}
                    accent="text-red-600"
                    icon={<TrendingDown className="w-4 h-4 mr-2" />}
                    onClick={() => setShowWithdrawal(true)}
                  />
                  <ActionCard
                    title="Reforço"
                    desc="Adicionar dinheiro"
                    value={formatBRL(currentRegister.additions)}
                    accent="text-blue-600"
                    icon={<TrendingUp className="w-4 h-4 mr-2" />}
                    onClick={() => setShowAddition(true)}
                  />
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Fechar Caixa</CardTitle>
                      <CardDescription>Conferir e encerrar</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="text-xl font-bold">Conferir</div>
                      <Button className="w-full" onClick={() => setShowClosing(true)}>
                        <Lock className="w-4 h-4 mr-2" /> Fechar Caixa
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
                      <span className="font-bold">{formatBRL(salesSummary.cash)}</span>
                    </div>
                    <div className="flex justify-between p-4 border rounded">
                      <span className="font-medium">💳 Cartão</span>
                      <span className="font-bold">{formatBRL(salesSummary.card)}</span>
                    </div>
                    <div className="flex justify-between p-4 border rounded">
                      <span className="font-medium">📱 PIX</span>
                      <span className="font-bold">{formatBRL(salesSummary.pix)}</span>
                    </div>
                    <div className="flex justify-between p-4 bg-primary/10 border-2 border-primary rounded">
                      <span className="font-bold text-lg">TOTAL</span>
                      <span className="font-bold text-lg">{formatBRL(totalSales)}</span>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="movements">
                <Card>
                  <CardHeader>
                    <CardTitle>Movimentações do Caixa</CardTitle>
                    <CardDescription>Sangrias e reforços registrados</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {movements.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-6">
                        Nenhuma movimentação registrada
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {movements.map((m) => (
                          <div key={m.id} className="flex justify-between items-center p-3 border rounded">
                            <div className="flex items-center gap-3">
                              {m.type === 'withdrawal' ? (
                                <TrendingDown className="w-4 h-4 text-red-600" />
                              ) : (
                                <TrendingUp className="w-4 h-4 text-blue-600" />
                              )}
                              <div>
                                <div className="font-medium text-sm">
                                  {m.type === 'withdrawal' ? 'Sangria' : 'Reforço'}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {m.reason || 'Sem motivo'} · {formatDateTime(m.created_at)}
                                </div>
                              </div>
                            </div>
                            <span className={`font-bold ${m.type === 'withdrawal' ? 'text-red-600' : 'text-blue-600'}`}>
                              {m.type === 'withdrawal' ? '-' : '+'}{formatBRL(Number(m.amount))}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="history">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <History className="w-5 h-5" /> Últimos Fechamentos
                    </CardTitle>
                    <CardDescription>20 caixas mais recentes</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <HistoryList history={history} />
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>

      {/* Dialog Sangria */}
      <Dialog open={showWithdrawal} onOpenChange={setShowWithdrawal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Realizar Sangria</DialogTitle>
            <DialogDescription>Retirar dinheiro do caixa</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Valor (R$)</Label>
              <Input type="number" step="0.01" value={withdrawalAmount}
                onChange={(e) => setWithdrawalAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Motivo</Label>
              <Input value={withdrawalReason}
                onChange={(e) => setWithdrawalReason(e.target.value)}
                placeholder="Ex: Troco, despesas" />
            </div>
            <Button onClick={handleWithdrawal} disabled={loadingAction} className="w-full">
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
            <DialogDescription>Adicionar dinheiro ao caixa</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Valor (R$)</Label>
              <Input type="number" step="0.01" value={additionAmount}
                onChange={(e) => setAdditionAmount(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Motivo</Label>
              <Input value={additionReason}
                onChange={(e) => setAdditionReason(e.target.value)}
                placeholder="Ex: Troco adicional" />
            </div>
            <Button onClick={handleAddition} disabled={loadingAction} className="w-full">
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
            <DialogDescription>Confira o valor em caixa e confirme</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="p-4 bg-muted rounded space-y-2">
              <div className="flex justify-between">
                <span>Valor Esperado:</span>
                <span className="font-bold">{formatBRL(currentRegister?.expected_amount ?? 0)}</span>
              </div>
              <div className="flex justify-between">
                <span>Vendas Dinheiro:</span>
                <span className="font-bold text-green-600">{formatBRL(salesSummary.cash)}</span>
              </div>
              <div className="flex justify-between">
                <span>Total de vendas:</span>
                <span className="font-bold">{formatBRL(totalSales)}</span>
              </div>
              <div className="flex justify-between">
                <span>Nº de vendas:</span>
                <span className="font-bold">{salesCount}</span>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Valor Contado no Caixa (R$)</Label>
              <Input type="number" step="0.01" value={closingAmount}
                onChange={(e) => setClosingAmount(e.target.value)} />
            </div>
            {closingAmount && (() => {
              const counted = parseFloat(closingAmount);
              const expected = currentRegister?.expected_amount ?? 0;
              const diff = counted - expected;
              const matches = Math.abs(diff) < 0.01;
              return (
                <div className={`p-4 rounded ${matches ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                  <div className="font-bold">
                    {matches ? '✓ Caixa conferido!' : `⚠ Diferença: ${formatBRL(diff)}`}
                  </div>
                </div>
              );
            })()}
            <Button onClick={handleCloseRegister} disabled={loadingAction} className="w-full">
              Confirmar Fechamento
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function KpiCard({
  label, value, icon, accent,
}: { label: string; value: string; icon: React.ReactNode; accent?: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground uppercase tracking-wider">{label}</span>
          <span className="text-muted-foreground">{icon}</span>
        </div>
        <div className={`text-xl font-bold mt-1 ${accent || ''}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

function ActionCard({
  title, desc, value, accent, icon, onClick,
}: {
  title: string; desc: string; value: string; accent: string;
  icon: React.ReactNode; onClick: () => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
        <CardDescription>{desc}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className={`text-xl font-bold ${accent}`}>{value}</div>
        <Button variant="outline" className="w-full" onClick={onClick}>
          {icon} Nova {title}
        </Button>
      </CardContent>
    </Card>
  );
}

function HistoryList({ history }: { history: CashRegister[] }) {
  if (history.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-6">Nenhum caixa fechado ainda</p>;
  }
  return (
    <div className="space-y-2">
      {history.map((c) => {
        const totalSales = Number(c.cash_sales) + Number(c.card_sales) + Number(c.pix_sales);
        const expected = Number(c.expected_amount);
        const closed = Number(c.closing_amount ?? 0);
        const diff = closed - expected;
        const matches = Math.abs(diff) < 0.01;
        return (
          <div key={c.id} className="p-3 border rounded space-y-2">
            <div className="flex justify-between items-center">
              <div>
                <div className="text-sm font-medium">
                  {formatDateTime(c.opened_at)} → {c.closed_at ? formatDateTime(c.closed_at) : '—'}
                </div>
                <div className="text-xs text-muted-foreground">
                  Vendas: {formatBRL(totalSales)}
                </div>
              </div>
              <Badge variant={matches ? 'secondary' : 'destructive'}>
                {matches ? 'Conferido' : `Dif: ${formatBRL(diff)}`}
              </Badge>
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground">
              <span>💵 {formatBRL(Number(c.cash_sales))}</span>
              <span>💳 {formatBRL(Number(c.card_sales))}</span>
              <span>📱 {formatBRL(Number(c.pix_sales))}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
