import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Check, ChevronsUpDown, Plus, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';

interface Brand {
  id: string;
  name: string;
}

interface BrandSelectProps {
  triggerId?: string;
  /** brand_id (empty string if none) */
  value: string;
  onChange: (brandId: string) => void;
}

/**
 * Busca+seleção de marca com combobox + criação inline.
 */
export function BrandSelect({ triggerId, value, onChange }: BrandSelectProps) {
  const { toast } = useToast();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [open, setOpen] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);

  const loadBrands = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('brands')
        .select('id, name')
        .order('name');
      if (error) throw error;
      setBrands(data || []);
    } catch (err: any) {
      toast({
        title: 'Erro ao carregar marcas',
        description: err.message,
        variant: 'destructive',
      });
    }
  }, [toast]);

  // Carrega marcas e escuta alterações em tempo real
  useEffect(() => {
    loadBrands();

    const channel = supabase
      .channel('brand-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'brands' },
        () => {
          loadBrands();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [loadBrands]);

  const selectedName = brands.find((b) => b.id === value)?.name;

  const handleCreate = async () => {
    const trimmed = newName.trim();
    if (!trimmed) {
      toast({ title: 'Nome obrigatório', variant: 'destructive' });
      return;
    }

    // Evita duplicata local
    if (brands.some((b) => b.name.toLowerCase() === trimmed.toLowerCase())) {
      toast({
        title: 'Marca já existe',
        description: `"${trimmed}" já está cadastrada.`,
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const { data, error } = await supabase
        .from('brands')
        .insert([{ name: trimmed }])
        .select('id')
        .single();

      if (error) throw error;

      toast({ title: 'Marca criada!', description: trimmed });
      onChange(data.id);
      setNewName('');
      setDialogOpen(false);
      // Recarrega a lista para incluir a nova marca
      await loadBrands();
    } catch (err: any) {
      toast({
        title: 'Erro ao criar marca',
        description: err.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex gap-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={triggerId}
            variant="outline"
            role="combobox"
            className="flex-1 justify-between hover:bg-background hover:text-foreground"
          >
            {selectedName || 'Selecionar marca...'}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
          <Command>
            <CommandInput placeholder="Buscar marca..." />
            <CommandList>
              <CommandEmpty>Nenhuma marca encontrada.</CommandEmpty>
              <CommandGroup>
                {brands.map((brand) => (
                  <CommandItem
                    key={brand.id}
                    value={brand.name}
                    onSelect={() => {
                      onChange(brand.id);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        'mr-2 h-4 w-4',
                        value === brand.id ? 'opacity-100' : 'opacity-0',
                      )}
                    />
                    {brand.name}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Button
        type="button"
        variant="outline"
        size="icon"
        className="hover:bg-background hover:text-foreground"
        onClick={() => setDialogOpen(true)}
        title="Nova marca"
      >
        <Plus className="w-4 h-4" />
      </Button>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova Marca</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="new-brand-name">Nome</Label>
            <Input
              id="new-brand-name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Ex: Shimano"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleCreate();
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
            >
              Cancelar
            </Button>
            <Button type="button" onClick={handleCreate} disabled={saving}>
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Criando...
                </>
              ) : (
                'Criar e selecionar'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
