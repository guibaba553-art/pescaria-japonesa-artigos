import { Helmet } from "react-helmet-async";
import { Header } from "@/components/Header";
import Footer from "@/components/Footer";

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Para quais regiões a JAPAS Pesca entrega?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Entregamos para todo o território nacional, partindo de Sinop/MT, via Correios (PAC e SEDEX) e Melhor Envio (Jadlog, Buslog, Loggi e parceiras). Também há retirada gratuita na loja em Sinop/MT.",
      },
    },
    {
      "@type": "Question",
      name: "Como o frete é calculado?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "O valor e o prazo são calculados automaticamente no carrinho a partir do CEP de destino, peso e dimensões dos produtos. O cliente escolhe entre as opções disponíveis.",
      },
    },
    {
      "@type": "Question",
      name: "Qual o prazo de entrega?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "O prazo total inclui até 2 dias úteis de preparação após a confirmação do pagamento mais o tempo de transporte da transportadora escolhida.",
      },
    },
    {
      "@type": "Question",
      name: "Como rastrear meu pedido?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Após a postagem você recebe o código de rastreio por e-mail e pode acompanhar em Minha Conta > Pedidos.",
      },
    },
  ],
};

export default function PoliticaFrete() {
  return (
    <div className="min-h-screen flex flex-col">
      <Helmet>
        <title>Política de Frete — JAPAS Pesca</title>
        <meta name="description" content="Frete para todo o Brasil via Correios e Melhor Envio. Veja prazos, cálculo, rastreio e retirada na loja em Sinop/MT." />
        <link rel="canonical" href="https://japaspesca.com.br/politica-de-frete" />
        <meta property="og:title" content="Política de Frete — JAPAS Pesca" />
        <meta property="og:description" content="Prazos, transportadoras, cálculo e rastreio dos pedidos da JAPAS Pesca." />
        <meta property="og:url" content="https://japaspesca.com.br/politica-de-frete" />
        <script type="application/ld+json">{JSON.stringify(faqJsonLd)}</script>
      </Helmet>
      <Header />
      <main className="flex-1 container mx-auto px-4 py-12 max-w-4xl pt-24">
        <h1 className="text-4xl font-bold mb-2">Política de Frete</h1>
        <p className="text-sm text-muted-foreground mb-8">
          Última atualização: {new Date().toLocaleDateString('pt-BR')}
        </p>

        <div className="space-y-8 text-foreground">
          <section>
            <h2 className="text-2xl font-bold mb-3">Área de entrega</h2>
            <p>
              A <strong>JAPA PESCA E CONVENIENCIA LTDA</strong> realiza entregas para
              <strong> todo o território nacional</strong>, partindo de Sinop/MT.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-3">Transportadoras</h2>
            <p>Trabalhamos com as seguintes opções de envio, integradas em tempo real:</p>
            <ul className="list-disc pl-6 space-y-2 mt-3">
              <li><strong>Correios:</strong> PAC e SEDEX</li>
              <li><strong>Melhor Envio:</strong> Jadlog, Buslog, Loggi e demais transportadoras parceiras</li>
              <li><strong>Retirada na loja:</strong> sem custo, em Sinop/MT</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-3">Cálculo do frete</h2>
            <p>
              O valor e o prazo são calculados automaticamente no carrinho a partir do
              CEP de destino, peso e dimensões dos produtos. O cliente sempre escolhe
              entre as opções disponíveis (a mais barata fica destacada).
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-3">Prazos de entrega</h2>
            <p>
              Os prazos exibidos no carrinho são <strong>estimativas das transportadoras</strong>,
              contados em dias úteis após a postagem. O prazo total inclui:
            </p>
            <ul className="list-disc pl-6 space-y-2 mt-3">
              <li><strong>Preparação do pedido:</strong> até 2 dias úteis após a confirmação do pagamento</li>
              <li><strong>Transporte:</strong> conforme a opção escolhida (varia por região)</li>
            </ul>
            <p className="mt-3 text-sm text-muted-foreground">
              Pedidos pagos via Pix são preparados mais rápido do que pagamentos por boleto.
              Atrasos pontuais podem ocorrer em períodos de alta demanda (Black Friday, Natal)
              ou por motivos de força maior (greves, enchentes etc.).
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-3">Rastreamento</h2>
            <p>
              Após a postagem, você recebe o <strong>código de rastreio</strong> por e-mail e
              também pode acompanhá-lo na sua área <strong>Minha Conta &gt; Pedidos</strong>.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-3">Frete grátis</h2>
            <p>
              Eventualmente promoções ou cupons podem oferecer frete grátis em determinadas
              regiões ou acima de um valor mínimo. As condições aparecem destacadas no
              carrinho durante a campanha.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-3">Endereço de entrega</h2>
            <p>
              É responsabilidade do cliente informar corretamente CEP, rua, número, bairro e
              cidade. Pedidos devolvidos ao remetente por endereço incorreto, ausência do
              destinatário ou recusa terão um <strong>novo frete cobrado</strong> para reenvio.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-3">Recebimento e avarias</h2>
            <p>Ao receber, confira a embalagem antes de assinar:</p>
            <ul className="list-disc pl-6 space-y-2 mt-3">
              <li>Se a embalagem estiver violada ou avariada, recuse o recebimento e nos avise.</li>
              <li>Se notar a avaria depois de receber, entre em contato em até 7 dias com fotos.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-3">Retirada na loja</h2>
            <p>Você pode retirar gratuitamente na nossa loja:</p>
            <p className="mt-2 p-4 bg-muted rounded-lg">
              <strong>JAPA PESCA E CONVENIENCIA</strong><br />
              Avenida das Itaúbas, 2281 — Jardim Paraíso<br />
              Sinop/MT — CEP 78556-100
            </p>
            <p className="mt-3">
              O pedido fica disponível em até 24h úteis após a confirmação do pagamento.
              Você recebe um aviso por e-mail/WhatsApp quando estiver pronto.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-3">Devoluções e trocas</h2>
            <p>
              Para devoluções e trocas, consulte nossa{" "}
              <a href="/politica-de-trocas" className="text-primary underline">
                Política de Trocas e Devoluções
              </a>.
              O frete de retorno por arrependimento (Art. 49 do CDC) é por nossa conta.
            </p>
          </section>

          <section>
            <h2 className="text-2xl font-bold mb-3">Dúvidas</h2>
            <p>
              Fale com a gente no WhatsApp{" "}
              <a href="https://wa.me/5566992111712" className="text-primary underline">
                (66) 99211-1712
              </a>{" "}
              ou pelo e-mail{" "}
              <a href="mailto:robertobaba2@gmail.com" className="text-primary underline">
                robertobaba2@gmail.com
              </a>.
            </p>
          </section>
        </div>
      </main>
      <Footer />
    </div>
  );
}
