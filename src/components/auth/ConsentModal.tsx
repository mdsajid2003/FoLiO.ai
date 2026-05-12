interface Props {
  onAccept: () => void;
  onCancel: () => void;
}

export function ConsentModal({ onAccept, onCancel }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xl w-full max-w-md">
        <div className="p-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <svg className="w-5 h-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-800">Data Processing Consent</h2>
              <p className="text-xs text-slate-500">Required under India DPDP Act 2023</p>
            </div>
          </div>

          <p className="text-sm text-slate-600 mb-4">
            Before uploading your settlement file, please review how FoLiOAI processes your data:
          </p>

          <ul className="space-y-2.5 mb-5">
            {[
              'Your settlement data is uploaded to our server for processing, then the report is returned to your browser.',
              'Processed reports are stored in your browser\'s local storage (up to 10 reports) and temporarily on our server.',
              'If you use the AI chat feature, aggregate report figures (not raw CSV data) are sent to our AI provider (Anthropic) to generate responses.',
              'We do not sell or share your data with advertisers or data brokers.',
              'You can clear saved reports by clearing browser storage. Server-side data can be deleted by contacting us.',
              'Results are deterministic from your CSV, but some tax outputs are assumption-based and should be reviewed by a CA before filing.',
            ].map((item, i) => (
              <li key={i} className="flex items-start gap-2.5 text-sm text-slate-600">
                <svg className="w-4 h-4 text-emerald-500 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                {item}
              </li>
            ))}
          </ul>

          <div className="bg-slate-50 rounded-xl p-3 mb-4 text-xs text-slate-500">
            By clicking Accept, you provide explicit consent for processing and storage of your settlement report on our servers and in your browser, in accordance with the Digital Personal Data Protection Act 2023 (India). See our <a href="/terms" style={{ color: '#059669', textDecoration: 'underline' }}>Terms</a> and <a href="/privacy" style={{ color: '#059669', textDecoration: 'underline' }}>Privacy Policy</a> for full details.
          </div>

          <div className="flex gap-3">
            <button
              onClick={onCancel}
              className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onAccept}
              className="flex-1 px-4 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 transition-colors"
            >
              Accept & Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
