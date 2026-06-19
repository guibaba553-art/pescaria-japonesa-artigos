import { useEffect, useMemo, useState } from "react";
import { format, addMonths, addDays, startOfMonth, endOfMonth, startOfDay, endOfDay, parseISO, isAfter, isBefore, subDays, isSameDay, getDaysInMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Plus, Trash2, Pencil, Repeat, Zap, ChevronLeft, ChevronRight, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { getSettlementDate } from "@/utils/pdvSettlement";


const CATEGORIES_FIXED = ["Aluguel", "Energia", "Internet", "Água", "Telefone", "Salários", "Contador", "Sistema/Software", "Seguro", "Financiamento", "Outros"];
const CATEGORIES_VARIABLE = ["Mercadoria", "Frete", "Embalagem", "Marketing", "Manutenção", "Combustível", "Impostos", "Taxas bancárias", "Comissões", "Reparos", "Outros"];
const PAYMENT_METHODS = ["Dinheiro", "PIX", "Débito", "Crédito", "Boleto", "Transferência"];

interface Expense {
  id: string;
  type: "fixed" | "variable";
  category: string;
  description: string;
  amount: number;
  expense_date: string;
  end_date: string | null;
  payment_method: string | null;
  supplier: string | null;
  notes: string | null;
}
interface Override {
  id: string;
  expense_id: string;
  year_month: string;
  amount: number | null;
  skipped: boolean;
  notes: string | null;
}
interface MonthlyEntry {
  expense: Expense;
  effectiveAmount: number;
  override?: Override;
  isRecurring: boolean;
}

const fmtBRL = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

interface IncomeEntry {
  id: string;
  source: "site" | "pdv";
  created_at: string;
  total_amount: number;
  customer_name?: string | null;
  payment_method?: string | null;
}

interface PdvReceivable {
  date: string; // yyyy-MM-dd (data prevista de entrada)
  total: number;
  count: number;
}

export function ExpenseTracker() {
  const { toast } = useToast();
  const [currentMonth, setCurrentMonth] = useState<Date>(startOfMonth(new Date()));
  const [selectedDay, setSelectedDay] = useState<Date>(startOfDay(new Date()));
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [incomes, setIncomes] = useState<IncomeEntry[]>([]);
  const [pdvOrders, setPdvOrders] = useState<IncomeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);

  const yearMonth = format(currentMonth, "yyyy-MM");

  const loadData = async () => {
    setLoading(true);
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const pdvLookbackStart = monthStart.toISOString();
    const [{ data: exp }, { data: ov }, { data: siteOrd }, { data: pdvOrd }] = await Promise.all([
      supabase.from("expenses").select("*").order("expense_date", { ascending: false }),
      supabase.from("expense_overrides").select("*"),
      supabase
        .from("orders")
        .select("id, source, created_at, total_amount, payment_method, status")
        .eq("source", "site" as any)
        .gte("created_at", monthStart.toISOString())
        .lte("created_at", monthEnd.toISOString())
        .neq("status", "cancelado" as any)
        .order("created_at", { ascending: false }),
      supabase
        .from("orders")
        .select("id, source, created_at, total_amount, payment_method, status")
        .eq("source", "pdv" as any)
        .gte("created_at", pdvLookbackStart)
        .lte("created_at", monthEnd.toISOString())
        .neq("status", "cancelado" as any)
        .order("created_at", { ascending: false }),
    ]);
    setExpenses((exp ?? []) as Expense[]);
    setOverrides((ov ?? []) as Override[]);
    const mapOrder = (o: any): IncomeEntry => ({
      id: o.id,
      source: o.source === "pdv" ? "pdv" : "site",
      created_at: o.created_at,
      total_amount: Number(o.total_amount || 0),
      customer_name: o.customer_name,
      payment_method: o.payment_method,
    });
    setIncomes(((siteOrd ?? []) as any[]).map(mapOrder));
    setPdvOrders(((pdvOrd ?? []) as any[]).map(mapOrder));
    setLoading(false);
  };
  useEffect(() => { loadData(); }, [currentMonth]);

  useEffect(() => {
    const ms = startOfMonth(currentMonth);
    const me = endOfMonth(currentMonth);
    if (selectedDay < ms || selectedDay > me) {
      const today = startOfDay(new Date());
      setSelectedDay(today >= ms && today <= me ? today : ms);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentMonth]);

  const monthEntries: MonthlyEntry[] = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const result: MonthlyEntry[] = [];
    for (const e of expenses) {
      const start = parseISO(e.expense_date);
      const end = e.end_date ? parseISO(e.end_date) : null;
      if (e.type === "fixed") {
        if (isAfter(start, monthEnd)) continue;
        if (end && isBefore(end, monthStart)) continue;
        const ov = overrides.find(o => o.expense_id === e.id && o.year_month === yearMonth);
        if (ov?.skipped) continue;
        result.push({ expense: e, effectiveAmount: ov?.amount ?? e.amount, override: ov, isRecurring: true });
      } else {
        if (start >= monthStart && start <= monthEnd) {
          result.push({ expense: e, effectiveAmount: e.amount, isRecurring: false });
        }
      }
    }
    return result.sort((a, b) => a.expense.expense_date.localeCompare(b.expense.expense_date));
  }, [expenses, overrides, currentMonth, yearMonth]);

  // Despesas que caem NO DIA selecionado
  const dayEntries: MonthlyEntry[] = useMemo(() => {
    const targetDay = selectedDay.getDate();
    const monthEndSel = endOfMonth(selectedDay);
    return monthEntries.filter(entry => {
      const start = parseISO(entry.expense.expense_date);
      if (entry.expense.type === "variable") {
        return isSameDay(start, selectedDay);
      }
      if (isAfter(start, selectedDay)) return false;
      const end = entry.expense.end_date ? parseISO(entry.expense.end_date) : null;
      if (end && isBefore(end, selectedDay)) return false;
      // Se o dia de vencimento original (ex: 31) não existe no mês corrente,
      // marca como vencido no último dia útil do mês.
      const effectiveDay = Math.min(start.getDate(), monthEndSel.getDate());
      return targetDay === effectiveDay;
    });
  }, [monthEntries, selectedDay]);

  const pdvReceivables: PdvReceivable[] = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(currentMonth);
    const byDate = new Map<string, PdvReceivable>();
    for (const o of pdvOrders) {
      const orderDate = parseISO(o.created_at);
      const settle = getSettlementDate(orderDate, o.payment_method);
      if (settle < monthStart || settle > monthEnd) continue;
      const key = format(settle, "yyyy-MM-dd");
      const cur = byDate.get(key);
      if (cur) {
        cur.total += o.total_amount;
        cur.count += 1;
      } else {
        byDate.set(key, { date: key, total: o.total_amount, count: 1 });
      }
    }
    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [pdvOrders, currentMonth]);

  const dayIncomes = useMemo(() => {
    const ds = startOfDay(selectedDay);
    const de = endOfDay(selectedDay);
    return incomes.filter(i => {
      const d = parseISO(i.created_at);
      return d >= ds && d <= de;
    });
  }, [incomes, selectedDay]);

  const dayPdvReceivables = useMemo(() => {
    const key = format(selectedDay, "yyyy-MM-dd");
    return pdvReceivables.filter(r => r.date === key);
  }, [pdvReceivables, selectedDay]);

  const dayTotals = useMemo(() => {
    const fixed = dayEntries.filter(e => e.expense.type === "fixed").reduce((s, e) => s + Number(e.effectiveAmount), 0);
    const variable = dayEntries.filter(e => e.expense.type === "variable").reduce((s, e) => s + Number(e.effectiveAmount), 0);
    const incomeSite = dayIncomes.reduce((s, i) => s + i.total_amount, 0);
    const incomePdv = dayPdvReceivables.reduce((s, r) => s + r.total, 0);
    const expensesTotal = fixed + variable;
    const income = incomeSite + incomePdv;
    return { fixed, variable, total: expensesTotal, incomeSite, incomePdv, income, balance: income - expensesTotal };
  }, [dayEntries, dayIncomes, dayPdvReceivables]);

  const monthTotals = useMemo(() => {
    const fixed = monthEntries.filter(e => e.expense.type === "fixed").reduce((s, e) => s + Number(e.effectiveAmount), 0);
    const variable = monthEntries.filter(e => e.expense.type === "variable").reduce((s, e) => s + Number(e.effectiveAmount), 0);
    const incomeSite = incomes.reduce((s, i) => s + i.total_amount, 0);
    const incomePdv = pdvReceivables.reduce((s, r) => s + r.total, 0);
    const expensesTotal = fixed + variable;
    const income = incomeSite + incomePdv;
    return { total: expensesTotal, income, balance: income - expensesTotal };
  }, [monthEntries, incomes, pdvReceivables]);

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir esta despesa? Se for fixa, todos os meses serão afetados.")) return;
    const { error } = await supabase.from("expenses").delete().eq("id", id);
    if (error) return toast({ title: "Erro", description: error.message, variant: "destructive" });
    toast({ title: "Despesa excluída" });
    loadData();
  };

  const handleSkipMonth = async (entry: MonthlyEntry) => {
    if (entry.override) {
      await supabase.from("expense_overrides").update({ skipped: true, amount: null }).eq("id", entry.override.id);
    } else {
      await supabase.from("expense_overrides").insert({ expense_id: entry.expense.id, year_month: yearMonth, skipped: true });
    }
    toast({ title: "Despesa pulada neste mês" });
    loadData();
  };

  const handleOverrideAmount = async (entry: MonthlyEntry) => {
    const v = prompt(`Novo valor para ${format(currentMonth, "MMMM/yyyy", { locale: ptBR })}:`, String(entry.effectiveAmount));
    if (!v) return;
    const amount = Number(v.replace(",", "."));
    if (isNaN(amount) || amount < 0) return toast({ title: "Valor inválido", variant: "destructive" });
    if (entry.override) {
      await supabase.from("expense_overrides").update({ amount, skipped: false }).eq("id", entry.override.id);
    } else {
      await supabase.from("expense_overrides").insert({ expense_id: entry.expense.id, year_month: yearMonth, amount });
    }
    toast({ title: "Valor ajustado neste mês" });
    loadData();
  };

  const isToday = isSameDay(selectedDay, new Date());

  return (
    <div className="space-y-6">
      {/* Navegação de mês (contexto) */}
      <Card>
        <CardContent className="p-4 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, -1))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="min-w-[200px] justify-center font-semibold capitalize">
                  <CalendarIcon className="w-4 h-4 mr-2" />
                  {format(currentMonth, "MMMM 'de' yyyy", { locale: ptBR })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="center">
                <Calendar
                  mode="single"
                  selected={currentMonth}
                  onSelect={(d) => d && setCurrentMonth(startOfMonth(d))}
                  locale={ptBR}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
            <Button variant="outline" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
              <ChevronRight className="w-4 h-4" />
            </Button>
            <span className="text-xs text-muted-foreground ml-2 hidden md:inline">
              Mês: <strong>{fmtBRL(monthTotals.income)}</strong> ent −{" "}
              <strong>{fmtBRL(monthTotals.total)}</strong> sai ={" "}
              <strong className={monthTotals.balance >= 0 ? "text-emerald-600" : "text-red-600"}>
                {fmtBRL(monthTotals.balance)}
              </strong>
            </span>
          </div>

          <Dialog open={dialogOpen} onOpenChange={(o) => { setDialogOpen(o); if (!o) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
                <Plus className="w-4 h-4 mr-2" /> Nova despesa
              </Button>
            </DialogTrigger>
            <ExpenseDialog
              key={editing?.id ?? "new"}
              expense={editing}
              defaultDate={selectedDay}
              onSaved={() => { setDialogOpen(false); setEditing(null); loadData(); }}
            />
          </Dialog>
        </CardContent>
      </Card>

      {/* Navegação de DIA (foco principal) */}
      <Card className="border-primary/40">
        <CardContent className="p-4 flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="icon" onClick={() => setSelectedDay(addDays(selectedDay, -1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="default" className="min-w-[260px] justify-center font-semibold capitalize">
                <CalendarIcon className="w-4 h-4 mr-2" />
                {format(selectedDay, "EEEE, dd 'de' MMMM", { locale: ptBR })}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="center">
              <Calendar
                mode="single"
                selected={selectedDay}
                onSelect={(d) => {
                  if (!d) return;
                  setSelectedDay(startOfDay(d));
                  setCurrentMonth(startOfMonth(d));
                }}
                locale={ptBR}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
            </PopoverContent>
          </Popover>
          <Button variant="outline" size="icon" onClick={() => setSelectedDay(addDays(selectedDay, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
          <Button
            variant={isToday ? "secondary" : "ghost"}
            size="sm"
            onClick={() => {
              const t = startOfDay(new Date());
              setSelectedDay(t);
              setCurrentMonth(startOfMonth(t));
            }}
          >
            Hoje
          </Button>
        </CardContent>
      </Card>

      {/* KPIs do DIA */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
              <span>Entradas Site</span><TrendingUp className="w-4 h-4" />
            </div>
            <div className="text-xl font-bold text-emerald-600 mt-2">{fmtBRL(dayTotals.incomeSite)}</div>
            <div className="text-[10px] text-muted-foreground mt-1">no dia</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
              <span>Entradas PDV</span><TrendingUp className="w-4 h-4" />
            </div>
            <div className="text-xl font-bold text-emerald-600 mt-2">{fmtBRL(dayTotals.incomePdv)}</div>
            <div className="text-[10px] text-muted-foreground mt-1">liquidando no dia</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
              <span>Custos fixos</span><Repeat className="w-4 h-4" />
            </div>
            <div className="text-xl font-bold text-blue-600 mt-2">{fmtBRL(dayTotals.fixed)}</div>
            <div className="text-[10px] text-muted-foreground mt-1">que vencem no dia</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
              <span>Custos variáveis</span><Zap className="w-4 h-4" />
            </div>
            <div className="text-xl font-bold text-orange-600 mt-2">{fmtBRL(dayTotals.variable)}</div>
            <div className="text-[10px] text-muted-foreground mt-1">no dia</div>
          </CardContent>
        </Card>
        <Card className={cn(dayTotals.balance >= 0 ? "border-emerald-500/30" : "border-red-500/30")}>
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-xs uppercase tracking-wider text-muted-foreground">
              <span>Saldo do dia</span><Wallet className="w-4 h-4" />
            </div>
            <div className={cn("text-xl font-bold mt-2", dayTotals.balance >= 0 ? "text-emerald-600" : "text-red-600")}>
              {fmtBRL(dayTotals.balance)}
            </div>
            <div className="text-[10px] text-muted-foreground mt-1">
              {fmtBRL(dayTotals.income)} − {fmtBRL(dayTotals.total)}
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="all">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="all">Saídas do dia ({dayEntries.length})</TabsTrigger>
          <TabsTrigger value="fixed">Fixas ({dayEntries.filter(e => e.expense.type === "fixed").length})</TabsTrigger>
          <TabsTrigger value="variable">Variáveis ({dayEntries.filter(e => e.expense.type === "variable").length})</TabsTrigger>
          <TabsTrigger value="incomes">Entradas ({dayIncomes.length + dayPdvReceivables.length})</TabsTrigger>
        </TabsList>
        {(["all", "fixed", "variable"] as const).map(tab => (
          <TabsContent key={tab} value={tab}>
            <ExpenseList
              entries={tab === "all" ? dayEntries : dayEntries.filter(e => e.expense.type === tab)}
              loading={loading}
              emptyHint={`Nenhuma despesa em ${format(selectedDay, "dd/MM", { locale: ptBR })}.`}
              onEdit={(e) => { setEditing(e); setDialogOpen(true); }}
              onDelete={handleDelete}
              onSkip={handleSkipMonth}
              onOverride={handleOverrideAmount}
            />
          </TabsContent>
        ))}
        <TabsContent value="incomes">
          <IncomeList incomes={dayIncomes} pdvReceivables={dayPdvReceivables} loading={loading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}


function IncomeList({ incomes, pdvReceivables, loading }: { incomes: IncomeEntry[]; pdvReceivables: PdvReceivable[]; loading: boolean }) {
  if (loading) return <div className="text-center py-8 text-muted-foreground">Carregando...</div>;
  if (incomes.length === 0 && pdvReceivables.length === 0) return (
    <Card><CardContent className="p-8 text-center text-muted-foreground">
      Nenhuma entrada (venda) neste mês.
    </CardContent></Card>
  );
  return (
    <div className="space-y-2">
      {pdvReceivables.map(r => (
        <Card key={`pdv-${r.date}`} className="hover:shadow-md transition-shadow border-emerald-500/20">
          <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="default" className="text-[10px]">PDV</Badge>
                <Badge variant="outline" className="text-[10px]">A receber</Badge>
              </div>
              <div className="font-semibold mt-1 truncate">Entrada de vendas</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {format(parseISO(r.date), "dd/MM/yyyy", { locale: ptBR })} • {r.count} venda(s) liquidando neste dia
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-emerald-600">{fmtBRL(r.total)}</div>
            </div>
          </CardContent>
        </Card>
      ))}
      {incomes.map(i => (
        <Card key={i.id} className="hover:shadow-md transition-shadow">
          <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary" className="text-[10px]">Site</Badge>
                {i.payment_method && <Badge variant="outline" className="text-[10px]">{i.payment_method}</Badge>}
              </div>
              <div className="font-semibold mt-1 truncate">{i.customer_name || "Cliente não identificado"}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {format(parseISO(i.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })} • Pedido #{i.id.slice(0, 8)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-emerald-600">{fmtBRL(i.total_amount)}</div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ExpenseList({ entries, loading, emptyHint, onEdit, onDelete, onSkip, onOverride }: {
  entries: MonthlyEntry[]; loading: boolean; emptyHint?: string;
  onEdit: (e: Expense) => void; onDelete: (id: string) => void;
  onSkip: (e: MonthlyEntry) => void; onOverride: (e: MonthlyEntry) => void;
}) {
  if (loading) return <div className="text-center py-8 text-muted-foreground">Carregando...</div>;
  if (entries.length === 0) return (
    <Card><CardContent className="p-8 text-center text-muted-foreground">
      {emptyHint || "Nenhuma despesa. Clique em \"Nova despesa\" para adicionar."}
    </CardContent></Card>
  );
  return (
    <div className="space-y-2">
      {entries.map(entry => (
        <Card key={entry.expense.id + (entry.override?.id ?? "")} className="hover:shadow-md transition-shadow">
          <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant={entry.expense.type === "fixed" ? "default" : "secondary"} className="text-[10px]">
                  {entry.expense.type === "fixed" ? <><Repeat className="w-3 h-3 mr-1" />Fixa</> : <><Zap className="w-3 h-3 mr-1" />Variável</>}
                </Badge>
                <Badge variant="outline" className="text-[10px]">{entry.expense.category}</Badge>
                {entry.override?.amount != null && <Badge className="bg-amber-100 text-amber-800 text-[10px]">ajustada</Badge>}
              </div>
              <div className="font-semibold mt-1 truncate">{entry.expense.description}</div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {format(parseISO(entry.expense.expense_date), "dd/MM/yyyy", { locale: ptBR })}
                {entry.expense.supplier && <> • {entry.expense.supplier}</>}
                {entry.expense.payment_method && <> • {entry.expense.payment_method}</>}
              </div>
            </div>
            <div className="text-right">
              <div className="text-lg font-bold text-red-600">{fmtBRL(Number(entry.effectiveAmount))}</div>
              {entry.expense.type === "fixed" && entry.override?.amount != null && (
                <div className="text-[10px] text-muted-foreground line-through">{fmtBRL(entry.expense.amount)}</div>
              )}
            </div>
            <div className="flex gap-1">
              {entry.expense.type === "fixed" && (
                <>
                  <Button variant="ghost" size="sm" onClick={() => onOverride(entry)} title="Ajustar valor neste mês">
                    <TrendingUp className="w-4 h-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => onSkip(entry)} title="Pular este mês">
                    <TrendingDown className="w-4 h-4" />
                  </Button>
                </>
              )}
              <Button variant="ghost" size="sm" onClick={() => onEdit(entry.expense)}>
                <Pencil className="w-4 h-4" />
              </Button>
              <Button variant="ghost" size="sm" onClick={() => onDelete(entry.expense.id)}>
                <Trash2 className="w-4 h-4 text-red-600" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function ExpenseDialog({ expense, defaultDate, onSaved }: {
  expense: Expense | null; defaultDate: Date; onSaved: () => void;
}) {
  const { toast } = useToast();
  const [type, setType] = useState<"fixed" | "variable">(expense?.type ?? "variable");
  const [category, setCategory] = useState(expense?.category ?? "");
  const [description, setDescription] = useState(expense?.description ?? "");
  const [amount, setAmount] = useState(expense?.amount ? String(expense.amount) : "");
  const [date, setDate] = useState<Date>(expense ? parseISO(expense.expense_date) : defaultDate);
  const [endDate, setEndDate] = useState<Date | undefined>(expense?.end_date ? parseISO(expense.end_date) : undefined);
  const [paymentMethod, setPaymentMethod] = useState(expense?.payment_method ?? "");
  const [supplier, setSupplier] = useState(expense?.supplier ?? "");
  const [notes, setNotes] = useState(expense?.notes ?? "");
  const [saving, setSaving] = useState(false);

  const categories = type === "fixed" ? CATEGORIES_FIXED : CATEGORIES_VARIABLE;

  const parseBRL = (raw: string): number => {
    if (!raw) return NaN;
    let s = String(raw).trim().replace(/R\$\s?/gi, "").replace(/\s/g, "");
    const hasComma = s.includes(",");
    const hasDot = s.includes(".");
    if (hasComma && hasDot) {
      // Formato BR "1.500,50" → remove pontos (milhar) e troca vírgula por ponto
      s = s.replace(/\./g, "").replace(",", ".");
    } else if (hasComma) {
      s = s.replace(",", ".");
    }
    // Mantém apenas dígitos, ponto e sinal
    s = s.replace(/[^0-9.\-]/g, "");
    return Number(s);
  };

  const handleSave = async () => {
    if (!description.trim() || !category || !amount) {
      return toast({ title: "Preencha todos os campos obrigatórios", variant: "destructive" });
    }
    const amountN = parseBRL(amount);
    if (isNaN(amountN) || amountN < 0) return toast({ title: "Valor inválido", description: `Não consegui interpretar "${amount}". Use vírgula como decimal, ex: 1500,50`, variant: "destructive" });
    setSaving(true);
    const payload = {
      type, category, description: description.trim(), amount: amountN,
      expense_date: format(date, "yyyy-MM-dd"),
      end_date: endDate ? format(endDate, "yyyy-MM-dd") : null,
      payment_method: paymentMethod || null,
      supplier: supplier.trim() || null,
      notes: notes.trim() || null,
    };
    const { data: { user } } = await supabase.auth.getUser();
    const res = expense
      ? await supabase.from("expenses").update(payload).eq("id", expense.id)
      : await supabase.from("expenses").insert({ ...payload, created_by: user?.id });
    setSaving(false);
    if (res.error) return toast({ title: "Erro", description: res.error.message, variant: "destructive" });
    toast({ title: expense ? "Despesa atualizada" : "Despesa criada" });
    onSaved();
  };

  return (
    <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{expense ? "Editar despesa" : "Nova despesa"}</DialogTitle>
        <DialogDescription>
          {type === "fixed" ? "Despesas fixas se repetem todos os meses até a data final (opcional)." : "Despesa pontual em uma data específica."}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant={type === "fixed" ? "default" : "outline"} onClick={() => { setType("fixed"); setCategory(""); }}>
            <Repeat className="w-4 h-4 mr-2" />Fixa (recorrente)
          </Button>
          <Button type="button" variant={type === "variable" ? "default" : "outline"} onClick={() => { setType("variable"); setCategory(""); }}>
            <Zap className="w-4 h-4 mr-2" />Variável
          </Button>
        </div>

        <div>
          <Label>Categoria *</Label>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
            <SelectContent>{categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        <div>
          <Label>Descrição *</Label>
          <Input value={description} onChange={e => setDescription(e.target.value)} placeholder="Ex: Aluguel da loja" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>Valor (R$) *</Label>
            <Input type="text" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0,00" />
          </div>
          <div>
            <Label>Forma de pagamento</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger><SelectValue placeholder="-" /></SelectTrigger>
              <SelectContent>{PAYMENT_METHODS.map(p => <SelectItem key={p} value={p}>{p}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>{type === "fixed" ? "Início *" : "Data *"}</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" className="w-full justify-start font-normal">
                  <CalendarIcon className="w-4 h-4 mr-2" />
                  {format(date, "dd/MM/yyyy", { locale: ptBR })}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={date} onSelect={(d) => d && setDate(d)} locale={ptBR} className={cn("p-3 pointer-events-auto")} /></PopoverContent>
            </Popover>
          </div>
          {type === "fixed" && (
            <div>
              <Label>Fim (opcional)</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start font-normal">
                    <CalendarIcon className="w-4 h-4 mr-2" />
                    {endDate ? format(endDate, "dd/MM/yyyy", { locale: ptBR }) : <span className="text-muted-foreground">Sem fim</span>}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar mode="single" selected={endDate} onSelect={setEndDate} locale={ptBR} className={cn("p-3 pointer-events-auto")} />
                  {endDate && <div className="p-2 border-t"><Button variant="ghost" size="sm" className="w-full" onClick={() => setEndDate(undefined)}>Limpar</Button></div>}
                </PopoverContent>
              </Popover>
            </div>
          )}
        </div>

        <div>
          <Label>Fornecedor / quem recebeu</Label>
          <Input value={supplier} onChange={e => setSupplier(e.target.value)} placeholder="Opcional" />
        </div>

        <div>
          <Label>Observações</Label>
          <Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} />
        </div>
      </div>

      <DialogFooter>
        <Button onClick={handleSave} disabled={saving}>{saving ? "Salvando..." : "Salvar"}</Button>
      </DialogFooter>
    </DialogContent>
  );
}
