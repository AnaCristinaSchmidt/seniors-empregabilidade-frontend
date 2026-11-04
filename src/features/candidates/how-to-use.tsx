import { Link } from "@tanstack/react-router";

interface Step {
  title: string;
  description: string;
  illustration: string;
  illustrationAlt: string;
  shortcut?: { label: string; to: string };
}

// Every sentence describes what the delivered screens do today. Hours and
// numbers for support, e-mail notices and course suggestions are left out on
// purpose: none of them is confirmed, so the text must not promise them.
const steps: Step[] = [
  {
    title: "Complete seu currículo",
    description:
      'Em "Meu perfil" você preenche resumo, experiências, habilidades e certificações. Quanto mais completo o perfil, mais fácil é ver o que você já atende nas vagas.',
    illustration: "tela de perfil",
    illustrationAlt:
      "Ilustração da tela Meu perfil, com o resumo e as experiências do candidato em blocos de texto.",
    shortcut: { label: "Ir para Meu perfil", to: "/candidato/perfil" },
  },
  {
    title: "Procure vagas e veja o que você já atende",
    description:
      'Em "Vagas" você busca anúncios e abre cada um para ver quantos requisitos já tem no seu perfil e quais ainda faltam.',
    illustration: "lista de vagas",
    illustrationAlt:
      "Ilustração da lista de vagas, com cartões de anúncios um abaixo do outro.",
    shortcut: { label: "Ir para Vagas", to: "/candidato/vagas" },
  },
  {
    title: "Candidate-se à vaga",
    description:
      'Abra a vaga, leia a descrição e clique em "Candidatar-se". A candidatura usa o perfil que você mantém em "Meu perfil".',
    illustration: "detalhe da vaga",
    illustrationAlt:
      "Ilustração da janela de detalhes da vaga, com a descrição e o botão Candidatar-se.",
  },
  {
    title: "Acompanhe cada processo",
    description:
      'Em "Candidaturas" você vê a situação de cada processo, há quantos dias ele está em andamento e, se quiser, pode sair dele. Consulte essa tela para ver a situação mais recente.',
    illustration: "candidaturas",
    illustrationAlt:
      "Ilustração da tela Candidaturas, com a lista de processos e a situação de cada um.",
    shortcut: { label: "Ir para Candidaturas", to: "/candidato/candidaturas" },
  },
];

function Illustration({ label, alt }: { label: string; alt: string }) {
  return (
    <div
      role="img"
      aria-label={alt}
      className="w-full rounded-lg border border-border bg-muted p-4 md:w-72 md:shrink-0"
    >
      <div aria-hidden="true" className="flex flex-col gap-2">
        <div className="h-3 w-3/5 rounded bg-border" />
        <div className="h-2 w-full rounded bg-border/70" />
        <div className="h-2 w-4/5 rounded bg-border/70" />
        <p className="mt-2 text-base text-muted-foreground">
          Ilustração: {label}
        </p>
      </div>
    </div>
  );
}

export default function HowToUsePage() {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-8 pb-28 sm:px-8">
      <header className="flex flex-col gap-3">
        <h1 className="text-3xl font-bold text-foreground">
          Como usar a plataforma
        </h1>
        <p className="text-lg text-muted-foreground">
          Quatro passos, do currículo ao acompanhamento. Cada bloco mostra onde
          a ação acontece na tela.
        </p>
      </header>

      <ol className="flex flex-col border-t-2 border-foreground">
        {steps.map((step, index) => (
          <li
            key={step.title}
            className="flex flex-col gap-4 border-b border-border py-6 md:flex-row md:items-start md:gap-6"
          >
            <span
              aria-hidden="true"
              className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-primary text-2xl font-bold text-primary-foreground"
            >
              {index + 1}
            </span>

            <div className="flex flex-1 flex-col gap-2">
              <h2 className="text-xl font-bold text-foreground">
                <span className="sr-only">Passo {index + 1}: </span>
                {step.title}
              </h2>
              <p className="text-lg text-foreground">{step.description}</p>
              {step.shortcut ? (
                <Link
                  to={step.shortcut.to}
                  className="mt-2 inline-flex min-h-11 items-center self-start rounded-sm font-medium text-foreground underline underline-offset-4 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
                >
                  {step.shortcut.label}
                </Link>
              ) : null}
            </div>

            <Illustration
              label={step.illustration}
              alt={step.illustrationAlt}
            />
          </li>
        ))}
      </ol>

      <section
        aria-labelledby="how-to-use-help"
        className="rounded-lg border border-border p-6"
      >
        <h2 id="how-to-use-help" className="text-xl font-bold text-foreground">
          Precisa de ajuda?
        </h2>
        <p className="mt-2 text-lg text-foreground">
          Ficou com dúvida em alguma etapa? Use o botão “Suporte no WhatsApp”,
          que fica no canto da tela em todas as páginas da área do candidato.
        </p>
      </section>
    </div>
  );
}
