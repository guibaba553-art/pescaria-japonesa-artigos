import { useEffect, useRef, useState } from 'react';
import { Search, User, Loader2, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface Customer {
  id: string;
  full_name: string;
  company_name: string | null;
  cpf: string | null;
  cnpj: string | null;
  [k: string]: any;
}

interface Props {
  onSelect: (c: Customer) => void;
  placeholder?: string;
}

/**
 * Busca clientes server-side (ilike) com debounce — escala para grandes volumes.
 * Não carrega todos os clientes; consulta somente conforme o usuário digita.
 */
export function CustomerSearchCombobox({ onSelect, placeholder }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<number | null>(null);

  // Busca no servidor com debounce
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    debounceRef.current = window.setTimeout(async () => {
      try {
        // Sanitiza para usar em ilike (escapa % e _)
        const safe = term.replace(/[%_]/g, (m) => `\\${m}`);
        const onlyDigits = term.replace(/\D/g, '');
        const ors: string[] = [
          `full_name.ilike.%${safe}%`,
          `company_name.ilike.%${safe}%`,
          `cpf.ilike.%${safe}%`,
          `cnpj.ilike.%${safe}%`,
        ];
        if (onlyDigits.length >= 2) {
          ors.push(`cpf.ilike.%${onlyDigits}%`);
          ors.push(`cnpj.ilike.%${onlyDigits}%`);
        }
        const { data, error } = await supabase
          .from('customers')
          .select('id, full_name, company_name, cpf, cnpj, cep, street, number, neighborhood, municipio, uf, email, codigo_municipio_ibge, inscricao_estadual, ie_indicador, complemento, score')
          .or(ors.join(','))
          .order('full_name')
          .limit(20);
        if (error) throw error;
        setResults((data as Customer[]) || []);
        setHighlight(0);
      } catch (e) {
        console.error('Erro ao buscar clientes:', e);
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Fechar ao clicar fora
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  const choose = (c: Customer) => {
    onSelect(c);
    setQuery('');
    setResults([]);
    setOpen(false);
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (!open) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Enter' && results[highlight]) {
      e.preventDefault();
      choose(results[highlight]);
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  };

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          type="text"
          autoComplete="off"
          maxLength={50}
          value={query}
          placeholder={placeholder || 'Buscar por nome, empresa, CPF ou CNPJ...'}
          onFocus={() => setOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onKeyDown={onKey}
          className="pl-9 pr-9"
        />
        {query && (
          <button
            type="button"
            onClick={() => { setQuery(''); setResults([]); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
            aria-label="Limpar"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {open && (query.trim().length >= 2 || loading) && (
        <div className="absolute z-50 mt-1 w-full bg-popover border rounded-md shadow-lg max-h-80 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-6 text-muted-foreground text-sm gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Buscando...
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-6 text-center text-sm text-muted-foreground">
              Nenhum cliente encontrado para "{query}"
            </div>
          ) : (
            <ul className="py-1">
              {results.map((c, idx) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onMouseEnter={() => setHighlight(idx)}
                    onClick={() => choose(c)}
                    className={`w-full text-left px-3 py-2 flex items-start gap-2 ${
                      idx === highlight ? 'bg-accent' : 'hover:bg-accent/50'
                    }`}
                  >
                    <User className="w-4 h-4 mt-0.5 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">
                        {c.company_name || c.full_name}
                      </p>
                      {c.company_name && (
                        <p className="text-xs text-muted-foreground truncate">
                          Resp.: {c.full_name}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {c.cnpj ? `CNPJ: ${c.cnpj}` : c.cpf ? `CPF: ${c.cpf}` : '—'}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!loading && results.length === 20 && (
            <div className="px-3 py-2 text-[11px] text-muted-foreground border-t bg-muted/30">
              Mostrando os 20 primeiros resultados — refine a busca para encontrar outros.
            </div>
          )}
        </div>
      )}

      {query.trim().length > 0 && query.trim().length < 2 && open && (
        <div className="absolute z-50 mt-1 w-full bg-popover border rounded-md shadow-lg px-3 py-2 text-xs text-muted-foreground">
          Digite ao menos 2 caracteres...
        </div>
      )}
    </div>
  );
}
