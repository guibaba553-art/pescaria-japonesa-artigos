import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';

interface Supplier {
  id: string;
  nome_fantasia: string | null;
  razao_social: string;
}

export interface SupplierSelectProps {
  triggerId?: string;
  value: string;
  onChange: (supplierId: string) => void;
}

export function SupplierSelect({ triggerId, value, onChange }: SupplierSelectProps) {
  const [open, setOpen] = useState(false);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);

  useEffect(() => {
    supabase
      .from('suppliers')
      .select('id, nome_fantasia, razao_social')
      .eq('is_active', true)
      .order('razao_social')
      .then(({ data }) => {
        if (data) {
          setSuppliers(data as Supplier[]);
        }
      });
  }, []);

  const selectedSupplier = suppliers.find((s) => s.id === value);
  const selectedName = selectedSupplier
    ? selectedSupplier.nome_fantasia || selectedSupplier.razao_social
    : null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={triggerId}
          variant="outline"
          role="combobox"
          className="w-full justify-between hover:bg-background hover:text-foreground"
        >
          {selectedName || 'Buscar fornecedor...'}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <Command>
          <CommandInput placeholder="Buscar fornecedor..." />
          <CommandList>
            <CommandEmpty>Nenhum fornecedor encontrado.</CommandEmpty>
            <CommandGroup>
              {suppliers.map((supplier) => {
                const displayName =
                  supplier.nome_fantasia || supplier.razao_social;
                return (
                  <CommandItem
                    key={supplier.id}
                    value={displayName}
                    onSelect={() => {
                      onChange(supplier.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        value === supplier.id ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    {displayName}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
