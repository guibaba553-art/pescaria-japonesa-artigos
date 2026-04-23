import { Header } from "@/components/Header";
import Footer from "@/components/Footer";

export default function PoliticaPrivacidade() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-12 max-w-4xl">
        <h1 className="text-4xl font-bold mb-2">Política de Privacidade</h1>
        <p className="text-muted-foreground mb-8">Última atualização: 23/04/2026</p>

        <div className="prose prose-lg max-w-none space-y-6 text-foreground">
          <section>
            <h2 className="text-2xl font-bold mb-3">1. Quem somos</h2>
            <p>
              <strong>JAPA PESCA E CONVENIENCIA</strong>, pessoa jurídica de direito privado,
              inscrita no CNPJ sob nº <strong>[CNPJ DA EMPRESA]</strong>, com sede em Sinop - MT,
              é a Controladora dos dados pessoais tratados nesta plataforma, nos termos da
              Lei nº 13.709/2018 (LGPD).
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-3">2. Dados que coletamos</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Cadastro:</strong> nome completo, CPF, e-mail, telefone, CEP, endereço.</li>
              <li><strong>Pedidos:</strong> histórico de compras, endereço de entrega, dados de pagamento (processados pelo Mercado Pago — não armazenamos cartões).</li>
              <li><strong>Navegação:</strong> páginas visitadas, dispositivo, navegador, referência de origem (mediante consentimento por cookies).</li>
              <li><strong>Comunicações:</strong> mensagens enviadas pelo chat ou e-mail.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-3">3. Finalidades do tratamento</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Processar pedidos, pagamentos e entregas;</li>
              <li>Emitir notas fiscais (NF-e/NFC-e) — obrigação legal;</li>
              <li>Prestar suporte e atendimento ao cliente;</li>
              <li>Prevenir fraudes e cumprir obrigações legais e regulatórias;</li>
              <li>Melhorar a experiência de navegação (com seu consentimento).</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-3">4. Bases legais (LGPD Art. 7º)</h2>
            <p>Tratamos seus dados com base em: execução de contrato, cumprimento de obrigação legal,
            legítimo interesse (ex.: prevenção a fraude) e consentimento (ex.: cookies de análise).</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-3">5. Compartilhamento</h2>
            <p>Compartilhamos dados apenas com:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li><strong>Mercado Pago</strong> — processamento de pagamentos;</li>
              <li><strong>Focus NFe</strong> — emissão de notas fiscais;</li>
              <li><strong>Transportadoras</strong> — entrega dos pedidos;</li>
              <li><strong>Autoridades</strong> — quando exigido por lei.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-3">6. Retenção</h2>
            <p>Mantemos seus dados pelo tempo necessário ao cumprimento das finalidades acima,
            e por prazos legais obrigatórios (fiscal: 5 anos; contábil: 10 anos).</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-3">7. Seus direitos (LGPD Art. 18)</h2>
            <p>Você pode, a qualquer momento, solicitar:</p>
            <ul className="list-disc pl-6 space-y-2">
              <li>Confirmação e acesso aos seus dados;</li>
              <li>Correção de dados incompletos ou desatualizados;</li>
              <li>Anonimização, bloqueio ou eliminação de dados desnecessários;</li>
              <li>Portabilidade;</li>
              <li>Revogação do consentimento;</li>
              <li>Informações sobre compartilhamento.</li>
            </ul>
            <p className="mt-3">Para exercer seus direitos, acesse <a href="/meus-dados" className="text-primary underline">Meus Dados</a> ou envie e-mail ao nosso Encarregado.</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-3">8. Encarregado de Dados (DPO)</h2>
            <p>
              <strong>Nome:</strong> Roberto Baba<br />
              <strong>E-mail:</strong> <a href="mailto:robertobaba2@gmail.com" className="text-primary underline">robertobaba2@gmail.com</a>
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-3">9. Segurança</h2>
            <p>Adotamos medidas técnicas e organizacionais (criptografia em trânsito, controle de acesso,
            Row-Level Security no banco) para proteger seus dados contra acessos não autorizados.</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-3">10. Cookies</h2>
            <p>Utilizamos cookies essenciais (necessários ao funcionamento) e, mediante seu consentimento,
            cookies analíticos. Você pode gerenciar suas preferências a qualquer momento pelo banner
            de cookies.</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-3">11. ANPD</h2>
            <p>Caso entenda que seus direitos não foram atendidos, você pode reclamar junto à
            Autoridade Nacional de Proteção de Dados (ANPD): <a href="https://www.gov.br/anpd" target="_blank" rel="noopener noreferrer" className="text-primary underline">gov.br/anpd</a>.</p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
