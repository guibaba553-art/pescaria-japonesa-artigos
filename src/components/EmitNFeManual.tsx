import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Plus, Trash2, Loader2, Send, Info } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Item {
  descricao: string;
  ncm: string;
  cfop: string;
  unidade: string;
  quantidade: string;
  valor_unitario: string;
  cest?: string;
  csosn?: string;
  origem?: string;
  codigo?: string;
}

const emptyItem = (): Item => ({
  descricao: '', ncm: '', cfop: '5102', unidade: 'UN',
  quantidade: '1', valor_unitario: '0', csosn: '102', origem: '0',
});

export function EmitNFeManual() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [serie, setSerie] = useState('1');
  const [numero, setNumero] = useState('');
  const [finalidade, setFinalidade] = useState<'1' | '2' | '3' | '4'>('1');
  const [natureza, setNatureza] = useState('Venda de mercadoria');
  const [chaveRef, setChaveRef] = useState('');
  const [observacoes, setObservacoes] = useState('');
  const [formaPag, setFormaPag] = useState('99');
  const [presenca, setPresenca] = useState('1');

  // destinatário
  const [tipoDest, setTipoDest] = useState<'cpf' | 'cnpj' | 'consumidor'>('cpf');
  const [docDest, setDocDest] = useState('');
  const [nomeDest, setNomeDest] = useState('');
  const [ieDest, setIeDest] = useState('');
  const [indIe, setIndIe] = useState<'1' | '2' | '9'>('9');
  const [logradouro, setLogradouro] = useState('');
  const [numeroEnd, setNumeroEnd] = useState('');
  const [complemento, setComplemento] = useState('');
  const [bairro, setBairro] = useState('');
  const [municipio, setMunicipio] = useState('');
  const [uf, setUf] = useState('MT');
  const [cep, setCep] = useState('');

  const [items, setItems] = useState<Item[]>([emptyItem()]);

  const total = items.reduce((s, it) => s + (Number(it.quantidade) || 0) * (Number(it.valor_unitario) || 0), 0);

  const updateItem = (idx: number, field: keyof Item, value: string) =>
    setItems(items.map((it, i) => i === idx ? { ...it, [field]: value } : it));

  const addItem = () => setItems([...items, emptyItem()]);
  const removeItem = (idx: number) => setItems(items.filter((_, i) => i !== idx));

  const finalidadeRequerRef = finalidade === '2' || finalidade === '4';

  const handleEmit = async () => {
    try {
      if (!natureza.trim()) { toast({ title: 'Informe a natureza da operação', variant: 'destructive' }); return; }
      if (finalidadeRequerRef && chaveRef.replace(/\D/g, '').length !== 44) {
        toast({ title: 'Chave da NF-e referenciada deve ter 44 dígitos', variant: 'destructive' });
        return;
      }
      if (items.some(i => !i.descricao || !i.ncm || !i.cfop)) {
        toast({ title: 'Preencha descrição, NCM e CFOP de todos os itens', variant: 'destructive' });
        return;
      }
      setLoading(true);
      const { data, error } = await supabase.functions.invoke('emit-nfe-manual', {
        body: {
          serie: Number(serie),
          numero: numero ? Number(numero) : undefined,
          finalidade: Number(finalidade),
          natureza_operacao: natureza,
          presenca_comprador: Number(presenca),
          forma_pagamento: formaPag,
          chave_referenciada: finalidadeRequerRef ? chaveRef.replace(/\D/g, '') : undefined,
          observacoes: observacoes || undefined,
          destinatario: {
            tipo: tipoDest,
            documento: tipoDest !== 'consumidor' ? docDest : undefined,
            nome: nomeDest || undefined,
            inscricao_estadual: tipoDest === 'cnpj' ? ieDest : undefined,
            indicador_ie: tipoDest === 'cnpj' ? Number(indIe) : undefined,
            logradouro: logradouro || undefined,
            numero: numeroEnd || undefined,
            complemento: complemento || undefined,
            bairro: bairro || undefined,
            municipio: municipio || undefined,
            uf: uf || undefined,
            cep: cep || undefined,
          },
          items: items.map(it => ({
            descricao: it.descricao,
            ncm: it.ncm,
            cfop: it.cfop,
            unidade: it.unidade,
            quantidade: Number(it.quantidade),
            valor_unitario: Number(it.valor_unitario),
            cest: it.cest || undefined,
            csosn: it.csosn || undefined,
            origem: it.origem || undefined,
            codigo: it.codigo || undefined,
          })),
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast({
        title: 'NF-e enviada à SEFAZ',
        description: (data as any)?.message || 'Acompanhe pelo histórico de Notas Fiscais.',
      });
    } catch (e: any) {
      toast({ title: 'Erro ao emitir NF-e', description: e.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Emitir NF-e (modelo 55) — manual</CardTitle>
        <CardDescription>
          Use para emitir notas avulsas, séries diferentes (ex.: série 1), devoluções a fornecedor,
          complementares ou de ajuste.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Cabeçalho */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <Label>Série</Label>
            <Input value={serie} onChange={e => setSerie(e.target.value.replace(/\D/g, ''))} />
          </div>
          <div>
            <Label>Nº (opcional)</Label>
            <Input
              value={numero}
              onChange={e => setNumero(e.target.value.replace(/\D/g, ''))}
              placeholder="Auto"
            />
          </div>
          <div>
            <Label>Finalidade</Label>
            <Select value={finalidade} onValueChange={v => setFinalidade(v as any)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 — Normal</SelectItem>
                <SelectItem value="2">2 — Complementar</SelectItem>
                <SelectItem value="3">3 — Ajuste</SelectItem>
                <SelectItem value="4">4 — Devolução</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Presença do comprador</Label>
            <Select value={presenca} onValueChange={setPresenca}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="0">0 — N/A</SelectItem>
                <SelectItem value="1">1 — Presencial</SelectItem>
                <SelectItem value="2">2 — Internet</SelectItem>
                <SelectItem value="4">4 — Entrega em domicílio</SelectItem>
                <SelectItem value="9">9 — Outros</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 md:col-span-3">
            <Label>Natureza da operação</Label>
            <Input value={natureza} onChange={e => setNatureza(e.target.value)} />
          </div>
          <div>
            <Label>Forma de pagamento</Label>
            <Select value={formaPag} onValueChange={setFormaPag}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="01">01 — Dinheiro</SelectItem>
                <SelectItem value="03">03 — Crédito</SelectItem>
                <SelectItem value="04">04 — Débito</SelectItem>
                <SelectItem value="17">17 — PIX</SelectItem>
                <SelectItem value="90">90 — Sem pagamento</SelectItem>
                <SelectItem value="99">99 — Outros</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {finalidadeRequerRef && (
          <div>
            <Label>Chave da NF-e referenciada (44 dígitos) *</Label>
            <Input
              value={chaveRef}
              onChange={e => setChaveRef(e.target.value)}
              placeholder="00000000000000000000000000000000000000000000"
              maxLength={50}
            />
          </div>
        )}

        {/* Destinatário */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Destinatário</h3>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <Label>Tipo</Label>
              <Select value={tipoDest} onValueChange={v => setTipoDest(v as any)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="cpf">Pessoa Física (CPF)</SelectItem>
                  <SelectItem value="cnpj">Pessoa Jurídica (CNPJ)</SelectItem>
                  <SelectItem value="consumidor">Consumidor não identificado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {tipoDest !== 'consumidor' && (
              <div>
                <Label>{tipoDest === 'cpf' ? 'CPF' : 'CNPJ'}</Label>
                <Input value={docDest} onChange={e => setDocDest(e.target.value)} />
              </div>
            )}
            <div className="md:col-span-2">
              <Label>Nome / Razão Social</Label>
              <Input value={nomeDest} onChange={e => setNomeDest(e.target.value)} />
            </div>
            {tipoDest === 'cnpj' && (
              <>
                <div>
                  <Label>Indicador IE</Label>
                  <Select value={indIe} onValueChange={v => setIndIe(v as any)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1 — Contribuinte</SelectItem>
                      <SelectItem value="2">2 — Isento</SelectItem>
                      <SelectItem value="9">9 — Não contribuinte</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {indIe === '1' && (
                  <div>
                    <Label>Inscrição Estadual</Label>
                    <Input value={ieDest} onChange={e => setIeDest(e.target.value)} />
                  </div>
                )}
              </>
            )}
            <div className="md:col-span-2">
              <Label>Logradouro</Label>
              <Input value={logradouro} onChange={e => setLogradouro(e.target.value)} />
            </div>
            <div>
              <Label>Número</Label>
              <Input value={numeroEnd} onChange={e => setNumeroEnd(e.target.value)} />
            </div>
            <div>
              <Label>Complemento</Label>
              <Input value={complemento} onChange={e => setComplemento(e.target.value)} />
            </div>
            <div>
              <Label>Bairro</Label>
              <Input value={bairro} onChange={e => setBairro(e.target.value)} />
            </div>
            <div>
              <Label>Município</Label>
              <Input value={municipio} onChange={e => setMunicipio(e.target.value)} />
            </div>
            <div>
              <Label>UF</Label>
              <Input value={uf} maxLength={2} onChange={e => setUf(e.target.value.toUpperCase())} />
            </div>
            <div>
              <Label>CEP</Label>
              <Input value={cep} onChange={e => setCep(e.target.value)} />
            </div>
          </div>
        </div>

        {/* Itens */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Itens</h3>
            <Button size="sm" variant="outline" onClick={addItem}>
              <Plus className="w-4 h-4 mr-1" /> Adicionar item
            </Button>
          </div>
          {items.map((it, idx) => (
            <div key={idx} className="border rounded-lg p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">Item {idx + 1}</span>
                {items.length > 1 && (
                  <Button size="icon" variant="ghost" onClick={() => removeItem(idx)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
                <div className="md:col-span-3">
                  <Label className="text-xs">Descrição</Label>
                  <Input value={it.descricao} onChange={e => updateItem(idx, 'descricao', e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Código</Label>
                  <Input value={it.codigo || ''} onChange={e => updateItem(idx, 'codigo', e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">NCM (8)</Label>
                  <Input value={it.ncm} maxLength={10} onChange={e => updateItem(idx, 'ncm', e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">CFOP</Label>
                  <Input value={it.cfop} maxLength={4} onChange={e => updateItem(idx, 'cfop', e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Un.</Label>
                  <Input value={it.unidade} maxLength={6} onChange={e => updateItem(idx, 'unidade', e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Qtd</Label>
                  <Input type="number" step="0.0001" value={it.quantidade} onChange={e => updateItem(idx, 'quantidade', e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Valor unit.</Label>
                  <Input type="number" step="0.01" value={it.valor_unitario} onChange={e => updateItem(idx, 'valor_unitario', e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">CSOSN</Label>
                  <Input value={it.csosn || ''} onChange={e => updateItem(idx, 'csosn', e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Origem</Label>
                  <Input value={it.origem || ''} maxLength={1} onChange={e => updateItem(idx, 'origem', e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">CEST</Label>
                  <Input value={it.cest || ''} onChange={e => updateItem(idx, 'cest', e.target.value)} />
                </div>
                <div className="flex items-end text-sm font-semibold">
                  Subtotal: {(Number(it.quantidade || 0) * Number(it.valor_unitario || 0)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div>
          <Label>Observações / Informações adicionais</Label>
          <Textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} rows={3} />
        </div>

        <Alert>
          <Info className="w-4 h-4" />
          <AlertDescription>
            Total da nota: <strong>{total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</strong>
          </AlertDescription>
        </Alert>

        <div className="flex justify-end">
          <Button onClick={handleEmit} disabled={loading} size="lg">
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Emitir NF-e
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
