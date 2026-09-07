export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-slate-950 px-6 py-12 text-slate-100">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-4xl font-bold">Privacy Policy</h1>

        <p className="mt-3 text-sm text-slate-400">
          Last updated: September 2, 2026
        </p>

        <section className="mt-10 space-y-4">
          <h2 className="text-2xl font-semibold">1. Overview</h2>
          <p className="leading-7 text-slate-300">
            Cyber Sakhi is a cybersecurity platform designed to help users
            analyze suspicious emails, investigate potential phishing and
            spoofing attempts, preserve digital evidence, and manage security
            incidents.
          </p>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="text-2xl font-semibold">2. Information We Process</h2>
          <p className="leading-7 text-slate-300">
            Depending on the features you use, Cyber Sakhi may process
            information such as email headers, sender and recipient addresses,
            message metadata, URLs, domains, IP addresses, authentication
            results, and other technical indicators required for cybersecurity
            analysis.
          </p>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="text-2xl font-semibold">3. Gmail Integration</h2>
          <p className="leading-7 text-slate-300">
            When you choose to connect Gmail, Cyber Sakhi requests read-only
            access to Gmail information required for email forensic analysis.
            This access is used to retrieve email messages and their technical
            information so that Cyber Sakhi can analyze suspicious emails.
          </p>

          <p className="leading-7 text-slate-300">
            Cyber Sakhi does not use Gmail data for advertising, does not sell
            Gmail data, and does not modify, delete, or send Gmail messages.
          </p>

          <p className="leading-7 text-slate-300">
            Gmail information is used only for the cybersecurity functionality
            requested by the user. Users may disconnect the Gmail integration
            and revoke its access through their Google account settings.
          </p>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="text-2xl font-semibold">4. Email Forensic Analysis</h2>
          <p className="leading-7 text-slate-300">
            Email data may be analyzed to identify phishing indicators,
            suspicious sender domains, spoofing signals, SPF/DKIM/DMARC
            authentication results, SMTP relay paths, originating IP
            information, domain intelligence, and related threat indicators.
          </p>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="text-2xl font-semibold">5. Evidence and Case Management</h2>
          <p className="leading-7 text-slate-300">
            If a user explicitly saves forensic information as evidence,
            Cyber Sakhi may retain the corresponding evidence metadata,
            integrity information, and investigation records to support
            evidence preservation and chain-of-custody functionality.
          </p>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="text-2xl font-semibold">6. Security</h2>
          <p className="leading-7 text-slate-300">
            Cyber Sakhi is designed to protect processed information using
            appropriate technical and organizational safeguards. Access to
            security-sensitive functionality is restricted according to the
            application's authentication and authorization mechanisms.
          </p>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="text-2xl font-semibold">7. Third-Party Services</h2>
          <p className="leading-7 text-slate-300">
            Cyber Sakhi may use trusted third-party services for functionality
            such as authentication, DNS information, IP intelligence, or other
            cybersecurity analysis. Information shared with such services is
            limited to what is necessary for the relevant functionality.
          </p>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="text-2xl font-semibold">8. User Control</h2>
          <p className="leading-7 text-slate-300">
            Users can choose whether to connect external services such as
            Gmail. Users can also revoke Google account permissions through
            their Google account security settings.
          </p>
        </section>

        <section className="mt-8 space-y-4">
          <h2 className="text-2xl font-semibold">9. Contact</h2>
          <p className="leading-7 text-slate-300">
            For privacy-related questions or concerns regarding Cyber Sakhi,
            please contact the developer through the contact information
            provided with the application.
          </p>
        </section>

        <div className="mt-12 border-t border-slate-800 pt-6">
          <p className="text-sm text-slate-500">
            Cyber Sakhi — Cybersecurity and Email Forensics Platform
          </p>
        </div>
      </div>
    </main>
  );
}