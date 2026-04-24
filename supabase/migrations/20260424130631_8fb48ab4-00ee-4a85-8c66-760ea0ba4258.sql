-- Tabela para armazenar XMLs baixados da Focus NFe (DFe) pendentes de revisão
CREATE TABLE public.nfe_entrada_pendentes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  chave_nfe TEXT NOT NULL UNIQUE,
  numero_nfe TEXT,
  serie TEXT,
  fornecedor_nome TEXT,
  fornecedor_cnpj TEXT,
  data_emissao TIMESTAMPTZ,
  valor_total NUMERIC,
  xml_content TEXT NOT NULL,
  parsed_data JSONB,
  status TEXT NOT NULL DEFAULT 'pendente', -- pendente | processado | ignorado
  manifestacao_status TEXT, -- ciencia | confirmacao | desconhecimento | operacao_nao_realizada | null
  manifestacao_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  processed_by UUID,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_nfe_entrada_pendentes_status ON public.nfe_entrada_pendentes(status);
CREATE INDEX idx_nfe_entrada_pendentes_created ON public.nfe_entrada_pendentes(created_at DESC);

ALTER TABLE public.nfe_entrada_pendentes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins e employees podem ver NFes pendentes"
ON public.nfe_entrada_pendentes FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

CREATE POLICY "Admins e employees podem atualizar NFes pendentes"
ON public.nfe_entrada_pendentes FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'employee'::app_role));

CREATE POLICY "Admins podem deletar NFes pendentes"
ON public.nfe_entrada_pendentes FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role pode inserir NFes pendentes"
ON public.nfe_entrada_pendentes FOR INSERT
WITH CHECK (auth.role() = 'service_role' OR has_role(auth.uid(), 'admin'::app_role));

CREATE TRIGGER update_nfe_entrada_pendentes_updated_at
BEFORE UPDATE ON public.nfe_entrada_pendentes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Habilitar pg_cron e pg_net para o agendamento
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;