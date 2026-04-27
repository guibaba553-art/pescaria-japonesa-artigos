import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Save, Loader2 } from 'lucide-react';

interface FiscalDefault {
  id: string;
  category: string;
  ncm: string | null;
  cest: string | null;
  cfop: string | null;
  csosn: string | null;
  origem: string | null;
  unidade_comercial: string | null;
}

export function CategoryFiscalDefaultsManager() {
  const [rows, setRows] = useState<FiscalDefault[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const { toast } = useToast();

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('category_fiscal_defaults')
      .select('*')
      .order('category');
    if (error) {
      toast({ title: 'Erro', description: error.message, variant: 'destructive' });
    } else {
      setRows(data || []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const updateField = (id: string, field: keyof FiscalDefault, value: string) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const save = async (row: FiscalDefault) => {
    setSavingId(row.id);
    const { error } = await supabase
      .from('category_fiscal_defaults')
      .update({
        ncm: row.ncm,
        cest: row.cest,
        cfop: row.cfop,
        csosn: row.csosn,
        origem: row.origem,
        unidade_comercial: row.unidade_comercial,
      })
      .eq('id', row.id);
    setSavingId(null);
    if (error) {
      toast({ title: 'Erro ao salvar', description: error.message, variant: 'destructive' });
    } else {
      toast({ title: 'Salvo', description: `Padrões fiscais de "${row.category}" atualizados.` });
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-8"><Loader2 className="animate-spin" /></div>;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Padrões Fiscais por Categoria</CardTitle>
        <CardDescription>
          Quando um produto é criado/editado nesta categoria, esses valores são sugeridos automaticamente.
          O <strong>CFOP</strong> aqui é só referência — na hora de emitir a NF-e, o sistema usa
          automaticamente <strong>5102</strong> (dentro de MT) ou <strong>6108</strong> (interestadual).
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Categoria</TableHead>
                <TableHead>NCM</TableHead>
                <TableHead>CEST</TableHead>
                <TableHead>CFOP</TableHead>
                <TableHead>CSOSN</TableHead>
                <TableHead>Origem</TableHead>
                <TableHead>Un.</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(row => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium">{row.category}</TableCell>
                  <TableCell><Input value={row.ncm ?? ''} onChange={e => updateField(row.id, 'ncm', e.target.value)} className="w-28" /></TableCell>
                  <TableCell><Input value={row.cest ?? ''} onChange={e => updateField(row.id, 'cest', e.target.value)} className="w-24" /></TableCell>
                  <TableCell><Input value={row.cfop ?? ''} onChange={e => updateField(row.id, 'cfop', e.target.value)} className="w-20" /></TableCell>
                  <TableCell><Input value={row.csosn ?? ''} onChange={e => updateField(row.id, 'csosn', e.target.value)} className="w-20" /></TableCell>
                  <TableCell><Input value={row.origem ?? ''} onChange={e => updateField(row.id, 'origem', e.target.value)} className="w-16" /></TableCell>
                  <TableCell><Input value={row.unidade_comercial ?? ''} onChange={e => updateField(row.id, 'unidade_comercial', e.target.value)} className="w-16" /></TableCell>
                  <TableCell>
                    <Button size="sm" variant="outline" onClick={() => save(row)} disabled={savingId === row.id}>
                      {savingId === row.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
