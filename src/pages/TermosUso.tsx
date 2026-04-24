import { Header } from "@/components/Header";
import Footer from "@/components/Footer";

export default function TermosUso() {
  return (
    <div className="min-h-screen flex flex-col">
      <Header />
      <main className="flex-1 container mx-auto px-4 py-12 max-w-4xl">
        <h1 className="text-4xl font-bold mb-2">Termos de Uso</h1>
        <p className="text-muted-foreground mb-8">Última atualização: 23/04/2026</p>

        <div className="space-y-6 text-foreground">
          <section>
            <h2 className="text-2xl font-bold mb-3">1. Aceitação</h2>
            <p>Ao acessar e utilizar o site da JAPA PESCA E CONVENIENCIA, você concorda integralmente
            com estes Termos de Uso e com nossa Política de Privacidade.</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-3">2. Cadastro</h2>
            <p>Para realizar compras, é necessário cadastro com informações verídicas. Você é responsável
            por manter a confidencialidade da senha e por todas as atividades em sua conta.</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-3">3. Produtos e preços</h2>
            <p>As imagens são meramente ilustrativas. Preços e disponibilidade podem ser alterados sem
            aviso prévio. Em caso de erro evidente de preço, reservamos o direito de cancelar o pedido
            com restituição integral.</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-3">4. Pagamento</h2>
            <p>Pagamentos são processados pelo Mercado Pago. Não armazenamos dados de cartão. O pedido
            é confirmado após aprovação do pagamento.</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-3">5. Entrega</h2>
            <p>Os prazos informados começam a contar após confirmação do pagamento. Atrasos da
            transportadora ou eventos imprevisíveis podem afetar a entrega.</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-3">6. Direito de Arrependimento (CDC Art. 49)</h2>
            <p>Compras online podem ser canceladas em até <strong>7 (sete) dias corridos</strong>
            após o recebimento, com restituição integral, mediante devolução do produto sem sinais
            de uso e na embalagem original.</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-3">7. Trocas e devoluções</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>Defeito de fabricação: 90 dias (CDC Art. 26);</li>
              <li>Arrependimento: 7 dias após recebimento;</li>
              <li>Solicite pelo WhatsApp (66) 99211-1712 ou e-mail.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-3">8. Propriedade intelectual</h2>
            <p>Logos, marcas, textos e imagens são de propriedade da JAPA PESCA E CONVENIENCIA ou
            licenciados, sendo vedada a reprodução sem autorização.</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-3">9. Responsabilidades</h2>
            <p>Não nos responsabilizamos por uso indevido dos produtos, danos indiretos ou
            indisponibilidade temporária do site por motivos técnicos.</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-3">10. Alterações</h2>
            <p>Podemos atualizar estes Termos a qualquer momento. A versão vigente está sempre
            disponível nesta página.</p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-3">11. Foro</h2>
            <p>Fica eleito o foro da Comarca de Sinop - MT para dirimir questões relativas a
            estes Termos, salvo direito do consumidor de optar pelo foro de seu domicílio.</p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
