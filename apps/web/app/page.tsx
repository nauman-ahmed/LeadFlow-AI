import Script from 'next/script';
import { SampleQuestion } from './SampleQuestion';

// What the assistant knows. Mirrors kb/en/*.md (and the French copies in kb/fr).
const KB_DOCS = [
  {
    title: 'Services overview',
    frTitle: 'Aperçu des services',
    file: 'services.md',
    covers: [
      'CRMs supported: HubSpot, Salesforce, Pipedrive, Close, Zoho',
      'What we do: CRM selection, data migration, pipeline design, team training, 30-day support',
      "What we don't do: custom apps, full marketing automation, ongoing managed services",
      'Who it’s for: 10–200 employees, 2–20 sales reps'
    ],
    questions: ['What services do you offer?', 'Can you build a custom mobile app for us?']
  },
  {
    title: 'Pricing',
    frTitle: 'Tarifs',
    file: 'pricing.md',
    covers: [
      'Starter $4,500 (under 5 reps, 2–3 weeks)',
      'Growth $9,500 (5–15 reps, 4–6 weeks)',
      'Scale $18,000 (15–50 reps, 8–10 weeks)',
      'Add-ons, billing terms (50% on signing, 50% at go-live) and what’s not included'
    ],
    questions: [
      'How much is the Growth package and what do I get?',
      'What does an extra integration cost?'
    ]
  },
  {
    title: 'Engagement process',
    frTitle: "Processus d'engagement",
    file: 'process.md',
    covers: [
      'Week 1: discovery and CRM recommendation',
      'Weeks 2–5: build and data migration (always on a Friday evening)',
      'Weeks 4–6: training and go-live',
      '30 days of office hours and async help after launch'
    ],
    questions: ['What happens in the first week?', 'When does data migration happen?']
  },
  {
    title: 'Frequently asked questions',
    frTitle: 'Questions fréquentes',
    file: 'faq.md',
    covers: [
      'Fixing a messy CRM (a “CRM reset”)',
      'NDAs, data residency, refund policy',
      'Migrating notes and call recordings',
      'Switching CRMs later, equity (no)'
    ],
    questions: ['Our CRM is a complete mess, can you help?', "What's your refund policy?"]
  }
];

const MORE_QUESTIONS = {
  booking: ["We're a team of 12 reps. Can I book an intro call?"],
  french: ['Quels CRM supportez-vous ?', 'Combien coûte le forfait Starter ?'],
  outOfScope: ["What's the weather in Dublin today?", 'Should I buy NVIDIA stock?'],
  handoff: ['Can I talk to a real person?']
};

export default function HomePage() {
  return (
    <>
      <div className="landing-top">
        <div className="landing-top-inner">
          <a className="landing-brand" href="/">
            LeadFlow
          </a>
          <nav className="landing-nav" aria-label="Primary">
            <a href="/admin">Leads</a>
          </nav>
        </div>
      </div>

      <main>
        <div className="landing-hero">
          <h1>Capture every inbound conversation</h1>
          <p className="landing-lede">
            Web chat and phone inquiries land in one place. Your team sees transcripts, contact
            details, and status—without digging through inboxes or spreadsheets.
          </p>
          <dl className="landing-metrics">
            <div>
              <dt>Live demo</dt>
              <dd>Open the chat bubble ↘</dd>
            </div>
            <div>
              <dt>Data</dt>
              <dd>Supabase + dashboard</dd>
            </div>
            <div>
              <dt>Stack</dt>
              <dd>Next.js widget + API</dd>
            </div>
          </dl>
        </div>

        <div className="landing-grid">
          <section className="card">
            <h2 className="landing-card-title">Try it</h2>
            <p className="muted" style={{ margin: '0 0 12px', fontSize: '0.9375rem' }}>
              Use the widget in the corner as a visitor would. Each session creates a lead you can
              open in the{' '}
              <a href="/admin">leads view</a>.
            </p>
            <ul className="landing-list">
              <li>Answers come from the knowledge base and cite their source.</li>
              <li>Write in French (or switch the header to FR) and it answers in French.</li>
              <li>Ask to book an intro call to see real Cal.com slots.</li>
              <li>Each conversation shows up in the password-protected leads view.</li>
            </ul>
          </section>

          <section className="card" id="install">
            <h2 className="landing-card-title">Add to your site</h2>
            <p className="muted small" style={{ margin: 0 }}>
              Replace the host with your deployed origin when you go live.
            </p>
            <pre className="landing-code">
              {`<script
  src="https://your-domain.example/leadflow-widget.js"
  data-tenant="demo"
  data-language="en"
  data-api="https://your-domain.example/api/chat"
  async
></script>`}
            </pre>
          </section>
        </div>

        <section className="kb-section" id="knowledge-base" aria-labelledby="kb-heading">
          <h2 id="kb-heading" className="kb-heading">
            What the assistant knows
          </h2>
          <p className="kb-lede">
            The chat and phone agents answer only from a small knowledge base about{' '}
            <strong>Acme CRM Onboarding</strong>, a demo consultancy that helps B2B teams choose and
            roll out a CRM. It has four documents, each in English and French. Click any question to
            ask it in the chat.
          </p>

          <div className="kb-docs">
            {KB_DOCS.map((doc) => (
              <article key={doc.file} className="card kb-doc">
                <h3 className="kb-doc-title">{doc.title}</h3>
                <p className="kb-doc-meta">
                  FR: {doc.frTitle} · <code>{doc.file}</code>
                </p>
                <ul className="landing-list">
                  {doc.covers.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
                <div className="kb-questions">
                  {doc.questions.map((q) => (
                    <SampleQuestion key={q} text={q} />
                  ))}
                </div>
              </article>
            ))}
          </div>

          <div className="kb-more">
            <article className="card">
              <h3 className="kb-doc-title">More to try</h3>
              <dl className="kb-try">
                <dt>Book a call</dt>
                <dd>
                  {MORE_QUESTIONS.booking.map((q) => (
                    <SampleQuestion key={q} text={q} />
                  ))}
                  <span className="kb-note">Asks for your name and email, then shows real Cal.com slots.</span>
                </dd>
                <dt>In French</dt>
                <dd>
                  {MORE_QUESTIONS.french.map((q) => (
                    <SampleQuestion key={q} text={q} />
                  ))}
                  <span className="kb-note">Switches to French and uses the French documents.</span>
                </dd>
                <dt>Outside its knowledge</dt>
                <dd>
                  {MORE_QUESTIONS.outOfScope.map((q) => (
                    <SampleQuestion key={q} text={q} />
                  ))}
                  <span className="kb-note">It says it doesn’t know instead of guessing.</span>
                </dd>
                <dt>Ask for a person</dt>
                <dd>
                  {MORE_QUESTIONS.handoff.map((q) => (
                    <SampleQuestion key={q} text={q} />
                  ))}
                  <span className="kb-note">Flags the lead for a teammate; nobody joins the chat live.</span>
                </dd>
              </dl>
            </article>

            <article className="card">
              <h3 className="kb-doc-title">How answers are found</h3>
              <ol className="landing-list">
                <li>
                  Each document is split by heading into short sections (30 in total, up to 800
                  characters each), keeping the heading path so a list never loses its title.
                </li>
                <li>Every section is embedded with Qwen and stored in Postgres with pgvector.</li>
                <li>
                  A question is embedded the same way and the five closest sections in its language
                  are retrieved.
                </li>
                <li>
                  If nothing is close enough, the assistant says it doesn’t know and offers a call or a
                  teammate follow-up.
                </li>
                <li>Otherwise it answers only from those sections and cites the source.</li>
              </ol>
              <p className="kb-note">
                The phone agent uses the same knowledge base through its <code>search_kb</code> tool.
              </p>
            </article>
          </div>
        </section>

        <footer className="landing-foot">
          LeadFlow — inbound qualification prototype. Not affiliated with any CRM vendor.
        </footer>
      </main>

      <Script
        src="/leadflow-widget.js"
        strategy="afterInteractive"
        data-tenant="demo"
        data-language="en"
      />
    </>
  );
}
