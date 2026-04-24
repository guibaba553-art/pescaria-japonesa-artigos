import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ShieldCheck, Download } from "lucide-react";

interface DataItem {
  categoria: string;
  dados: string;
  finalidade: string;
  baseLegal: string;
  retencao: string;
  compartilhamento: string;
}

const ROPA: DataItem[] = [
  {
    categoria: "Identificação do Cliente",
    dados: "Nome completo, CPF, e-mail, telefone",
    finalidade: "Cadastro, autenticação, emissão de nota fiscal e contato sobre pedidos",
    baseLegal: "Execução de contrato (Art. 7º, V, LGPD) e obrigação legal (Art. 7º, II)",
    retencao: "Enquanto a conta estiver ativa + 5 anos após o último pedido (obrigação fiscal)",
    compartilhamento: "Receita Federal (NF-e), SEFAZ-MT (NFC-e), Focus NFe (intermediário)",
  },
  {
    categoria: "Endereço de Entrega",
    dados: "CEP, rua, número, complemento, bairro, cidade, estado",
    finalidade: "Cálculo de frete, envio do pedido, emissão de etiqueta",
    baseLegal: "Execução de contrato (Art. 7º, V, LGPD)",
    retencao: "Enquanto endereço estiver cadastrado + 5 anos após último pedido",
    compartilhamento: "Correios, Melhor Envio (transportadoras parceiras)",
  },
  {
    categoria: "Dados de Pagamento",
    dados: "Forma de pagamento, status da transação, ID do pagamento",
    finalidade: "Processamento da compra, conciliação financeira, antifraude",
    baseLegal: "Execução de contrato (Art. 7º, V, LGPD) e obrigação legal",
    retencao: "5 anos (legislação fiscal)",
    compartilhamento: "Mercado Pago (gateway de pagamento — não armazenamos dados de cartão)",
  },
  {
    categoria: "Histórico de Pedidos",
    dados: "Itens comprados, valores, datas, status",
    finalidade: "Atendimento pós-venda, garantia, emissão de NF-e e relatórios fiscais",
    baseLegal: "Execução de contrato e obrigação legal",
    retencao: "5 anos (Art. 174 CTN e legislação fiscal)",
    compartilhamento: "Sistema fiscal interno e SEFAZ-MT quando aplicável",
  },
  {
    categoria: "Avaliações de Produtos",
    dados: "Nota, comentário, nome do autor",
    finalidade: "Exibir reviews na página do produto",
    baseLegal: "Consentimento (Art. 7º, I, LGPD) — usuário decide publicar",
    retencao: "Enquanto a conta existir ou até a remoção solicitada",
    compartilhamento: "Público no site (visível a qualquer visitante)",
  },
  {
    categoria: "Dados de Navegação",
    dados: "Páginas visitadas, dispositivo, IP (anonimizado), referrer",
    finalidade: "Analytics interno, melhoria de UX, prevenção a fraudes",
    baseLegal: "Legítimo interesse (Art. 7º, IX, LGPD)",
    retencao: "12 meses",
    compartilhamento: "Não compartilhado com terceiros",
  },
  {
    categoria: "Cookies e Sessão",
    dados: "Token de sessão, preferências, carrinho",
    finalidade: "Manter login, lembrar carrinho, funcionalidade do site",
    baseLegal: "Cookies essenciais: legítimo interesse. Demais: consentimento (banner)",
    retencao: "Sessão ou até 30 dias",
    compartilhamento: "Não compartilhado",
  },
  {
    categoria: "Mensagens de Chat",
    dados: "Conteúdo das mensagens trocadas com a loja",
    finalidade: "Atendimento ao cliente",
    baseLegal: "Execução de contrato e legítimo interesse",
    retencao: "2 anos após o último contato",
    compartilhamento: "Apenas equipe interna autorizada (admin/funcionários)",
  },
];

export default function AdminLGPD() {
  const navigate = useNavigate();
  const { isAdmin, loading } = useAuth();

  useEffect(() => {
    if (!loading && !isAdmin) navigate("/");
  }, [loading, isAdmin, navigate]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Carregando...</div>;
  }
  if (!isAdmin) return null;

  const exportarCSV = () => {
    const header = "Categoria;Dados Coletados;Finalidade;Base Legal;Retenção;Compartilhamento\n";
    const rows = ROPA.map((r) =>
      [r.categoria, r.dados, r.finalidade, r.baseLegal, r.retencao, r.compartilhamento]
        .map((v) => `"${v.replace(/"/g, '""')}"`)
        .join(";")
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ROPA_JapaPesca_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-muted/30">
      <Header />

      <div className="bg-foreground text-background pt-20 lg:pt-32 pb-8">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 text-primary mb-3">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span className="text-[11px] font-bold uppercase tracking-wider">LGPD</span>
              </div>
              <h1 className="text-3xl md:text-4xl font-display font-black tracking-tight">
                ROPA — Registro de Operações de Tratamento de Dados
              </h1>
              <p className="text-sm text-background/60 mt-1">
                Documento interno exigido pelo Art. 37 da Lei 13.709/18 (LGPD).
              </p>
            </div>
            <div className="flex gap-2 self-start md:self-end">
              <Button
                variant="outline"
                onClick={exportarCSV}
                className="rounded-full bg-transparent border-background/20 text-background hover:bg-background hover:text-foreground"
              >
                <Download className="w-4 h-4 mr-2" />
                Exportar CSV
              </Button>
              <Button
                variant="outline"
                onClick={() => navigate("/admin")}
                className="rounded-full bg-transparent border-background/20 text-background hover:bg-background hover:text-foreground"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Voltar
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-6 space-y-6">
        {/* Cabeçalho do controlador */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <h2 className="font-display font-bold text-lg mb-4">Controlador de Dados</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-muted-foreground">Razão Social:</span>{" "}
              <strong>JAPA PESCA E CONVENIENCIA LTDA (G. SEITI GARCIA BABA LTDA)</strong>
            </div>
            <div>
              <span className="text-muted-foreground">CNPJ:</span>{" "}
              <strong>33.169.502/0001-08</strong>
            </div>
            <div>
              <span className="text-muted-foreground">Inscrição Estadual:</span>{" "}
              <strong>13.900.915-9</strong>
            </div>
            <div>
              <span className="text-muted-foreground">Endereço:</span>{" "}
              <strong>Av. das Itaúbas, 2281 — Jardim Paraíso, Sinop/MT — CEP 78556-100</strong>
            </div>
            <div>
              <span className="text-muted-foreground">Encarregado (DPO):</span>{" "}
              <strong>Roberto Baba</strong>
            </div>
            <div>
              <span className="text-muted-foreground">Contato LGPD:</span>{" "}
              <strong>robertobaba2@gmail.com</strong>
            </div>
          </div>
        </div>

        {/* Tabela ROPA */}
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="p-6 border-b border-border">
            <h2 className="font-display font-bold text-lg">
              Registros de Tratamento ({ROPA.length})
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Mapa completo dos dados pessoais tratados pela operação.
            </p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-4 py-3 font-semibold">Categoria</th>
                  <th className="px-4 py-3 font-semibold">Dados</th>
                  <th className="px-4 py-3 font-semibold">Finalidade</th>
                  <th className="px-4 py-3 font-semibold">Base Legal</th>
                  <th className="px-4 py-3 font-semibold">Retenção</th>
                  <th className="px-4 py-3 font-semibold">Compartilhamento</th>
                </tr>
              </thead>
              <tbody>
                {ROPA.map((r, i) => (
                  <tr key={i} className="border-t border-border align-top">
                    <td className="px-4 py-3 font-medium">{r.categoria}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.dados}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.finalidade}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.baseLegal}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.retencao}</td>
                    <td className="px-4 py-3 text-muted-foreground">{r.compartilhamento}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Direitos dos titulares */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <h2 className="font-display font-bold text-lg mb-3">
            Direitos dos Titulares (Art. 18 LGPD)
          </h2>
          <p className="text-sm text-muted-foreground mb-4">
            Os clientes têm direito a:
          </p>
          <ul className="list-disc pl-6 space-y-1.5 text-sm">
            <li>Confirmação da existência de tratamento</li>
            <li>Acesso aos dados</li>
            <li>Correção de dados incompletos, inexatos ou desatualizados</li>
            <li>Anonimização, bloqueio ou eliminação de dados desnecessários</li>
            <li>Portabilidade dos dados</li>
            <li>Eliminação dos dados tratados com consentimento</li>
            <li>Informação sobre compartilhamento com terceiros</li>
            <li>Revogação do consentimento</li>
          </ul>
          <p className="text-sm text-muted-foreground mt-4">
            Os titulares exercem esses direitos via página{" "}
            <a href="/meus-dados" className="text-primary underline">
              /meus-dados
            </a>{" "}
            ou e-mail ao DPO.
          </p>
        </div>

        {/* Medidas de segurança */}
        <div className="bg-card border border-border rounded-2xl p-6">
          <h2 className="font-display font-bold text-lg mb-3">Medidas de Segurança</h2>
          <ul className="list-disc pl-6 space-y-1.5 text-sm">
            <li>Criptografia em trânsito (HTTPS/TLS) em todas as conexões</li>
            <li>Banco de dados com Row Level Security (RLS) e isolamento por usuário</li>
            <li>Senhas armazenadas com hash (bcrypt) — nunca em texto puro</li>
            <li>Verificação de senhas vazadas (HIBP) ativada</li>
            <li>Tokens JWT com rotação automática</li>
            <li>Log de auditoria para todas as ações administrativas</li>
            <li>Acesso restrito por papéis (admin / funcionário / cliente)</li>
            <li>Backups automáticos diários</li>
          </ul>
        </div>

        <p className="text-xs text-muted-foreground text-center">
          Documento gerado em {new Date().toLocaleString("pt-BR")} · Atualize sempre que houver
          mudança no tratamento de dados.
        </p>
      </div>
    </div>
  );
}
