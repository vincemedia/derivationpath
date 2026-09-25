import { ArrowLeft, FileText } from 'lucide-react';
import { TERMS_SECTIONS, TERMS_SUMMARY, TERMS_UPDATED } from '../terms';

export function TermsPage({ onBack }: { onBack: () => void }) {
  return (
    <main className="terms">
      <button type="button" className="btn btn-secondary btn-sm" onClick={onBack}><ArrowLeft size={14} /> Back to the app</button>
      <div className="card"><div className="card-body">
        <div className="section-title">
          <span className="chip" aria-hidden><FileText size={20} /></span>
          <div><h3>Terms of Use</h3><p>Last updated {TERMS_UPDATED}</p></div>
        </div>
        <p className="terms-summary">
          <b>In short:</b> {TERMS_SUMMARY}
        </p>
        {TERMS_SECTIONS.map(s => (
          <section key={s.title} className="terms-section">
            <h4>{s.title}</h4>
            {s.body.map((p, i) => <p key={i}>{p}</p>)}
          </section>
        ))}
      </div></div>
    </main>
  );
}
