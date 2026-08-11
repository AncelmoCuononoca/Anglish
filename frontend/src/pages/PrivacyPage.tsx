import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { useCanonical } from '../hooks/useCanonical'

const LAST_UPDATED = 'August 2026'
const COMPANY = 'Anglish Me'
const EMAIL = 'privacy@anglishme.com'

export function PrivacyPage() {
  useCanonical('/privacy')
  return (
    <div className="p-6 md:p-8 max-w-3xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-[var(--text-muted)] mb-6">
        <Link to="/settings" className="hover:text-[var(--text)]">Settings</Link>
        <ChevronRight size={14} />
        <span className="text-[var(--text)]">Privacy Policy</span>
      </div>

      <div className="flex items-center gap-3 mb-8">
        <img src="/mascots/bust/month01.png" alt="Anglish Me"
          className="w-12 h-12 rounded-xl object-cover bg-cyan-500/10 border border-cyan-400/20 flex-shrink-0" />
        <div>
          <h1 className="text-2xl font-black text-[var(--text)]">Privacy Policy</h1>
          <p className="text-sm text-[var(--text-muted)]">Anglish Me · Last updated: {LAST_UPDATED}</p>
        </div>
      </div>

      <div className="space-y-8 text-[var(--text-muted)] leading-relaxed">
        <section>
          <h2 className="text-lg font-bold text-[var(--text)] mb-3">1. Introduction & Who We Are</h2>
          <p className="mb-2">{COMPANY} ("we", "us", "our") is committed to protecting your personal data. This Privacy Policy explains how we collect, use, store, and protect your information when you use our Service, in accordance with the General Data Protection Regulation (GDPR) and applicable data protection laws.</p>
          <p>{COMPANY} operates the anglishme.com service and is the <strong className="text-[var(--text)]">data controller</strong> responsible for your personal data. We are based in Luanda, Angola, and serve learners internationally. For any privacy matter, contact us at <a href={`mailto:${EMAIL}`} className="text-cyan-400 hover:underline">{EMAIL}</a>.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-[var(--text)] mb-3">2. Data We Collect</h2>
          <p className="mb-3">We collect the following categories of personal data:</p>

          <p className="font-semibold text-[var(--text)] mb-1">Account Data</p>
          <ul className="list-disc list-inside space-y-1 ml-2 mb-3">
            <li>Email address and display name</li>
            <li>Authentication data (hashed password, OAuth tokens)</li>
            <li>Account creation date and last login</li>
          </ul>

          <p className="font-semibold text-[var(--text)] mb-1">Learning Data</p>
          <ul className="list-disc list-inside space-y-1 ml-2 mb-3">
            <li>Lessons completed, exercises attempted, and scores</li>
            <li>XP earned, level, and streak information</li>
            <li>Session history and learning progress</li>
          </ul>

          <p className="font-semibold text-[var(--text)] mb-1">Usage Data</p>
          <ul className="list-disc list-inside space-y-1 ml-2 mb-3">
            <li>IP address and device type (for security and performance)</li>
            <li>Pages visited and features used</li>
            <li>Error logs and crash reports</li>
          </ul>

          <p className="font-semibold text-[var(--text)] mb-1">Voice and Text Data (AI Features)</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Text messages sent to Chat (processed in real-time, not stored permanently)</li>
            <li>Voice recordings for Speaking (processed transiently, deleted after transcription)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-[var(--text)] mb-3">3. How We Use Your Data</h2>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>To provide and personalise the learning experience</li>
            <li>To track your progress and award XP and achievements</li>
            <li>To display your ranking on the leaderboard (name and XP only)</li>
            <li>To send learning reminders and important account notifications</li>
            <li>To improve our AI models and lesson quality (using anonymised, aggregated data)</li>
            <li>To comply with legal obligations and prevent fraud</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-[var(--text)] mb-3">4. Legal Basis for Processing</h2>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li><strong className="text-[var(--text)]">Contract performance:</strong> Processing necessary to provide the Service you subscribed to</li>
            <li><strong className="text-[var(--text)]">Legitimate interests:</strong> Security monitoring, fraud prevention, service improvement</li>
            <li><strong className="text-[var(--text)]">Consent:</strong> Marketing emails (you can withdraw consent at any time)</li>
            <li><strong className="text-[var(--text)]">Legal obligation:</strong> Compliance with applicable laws</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-[var(--text)] mb-3">5. Data Sharing</h2>
          <p className="mb-2">We do <strong className="text-[var(--text)]">not sell</strong> your personal data. We share data only with:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li><strong className="text-[var(--text)]">Supabase</strong> - database and authentication provider (EU-hosted infrastructure)</li>
            <li><strong className="text-[var(--text)]">OpenAI</strong> - for AI features (Chat, Speaking, TTS); data processed per OpenAI's API data policy</li>
            <li><strong className="text-[var(--text)]">Payment processors</strong> - for subscription billing (we never store full card details)</li>
            <li><strong className="text-[var(--text)]">Law enforcement</strong> - only when legally required by a court order or applicable law</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-[var(--text)] mb-3">5a. International Data Transfers</h2>
          <p>Some of our providers (for example OpenAI) process data on servers located outside the European Economic Area (EEA), including in the United States. Where personal data is transferred outside the EEA, we rely on appropriate safeguards recognised under the GDPR — such as the European Commission's Standard Contractual Clauses (SCCs) or an adequacy decision — so that your data continues to receive an equivalent level of protection. You can request a copy of the relevant safeguards by contacting us.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-[var(--text)] mb-3">6. Data Retention</h2>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Account data: retained for as long as your account is active, plus 30 days after deletion</li>
            <li>Learning progress: retained for the lifetime of your account</li>
            <li>Voice recordings: deleted within 24 hours of processing</li>
            <li>Billing records: retained for 7 years as required by financial regulations</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-[var(--text)] mb-3">7. Your Rights</h2>
          <p className="mb-2">Under GDPR and applicable data protection law, you have the right to:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li><strong className="text-[var(--text)]">Access</strong> - request a copy of all personal data we hold about you</li>
            <li><strong className="text-[var(--text)]">Rectification</strong> - correct inaccurate or incomplete data</li>
            <li><strong className="text-[var(--text)]">Erasure</strong> - request deletion of your account and associated data</li>
            <li><strong className="text-[var(--text)]">Portability</strong> - receive your data in a machine-readable format</li>
            <li><strong className="text-[var(--text)]">Objection</strong> - object to processing based on legitimate interests</li>
            <li><strong className="text-[var(--text)]">Withdraw consent</strong> - at any time, for consent-based processing</li>
          </ul>
          <p className="mt-2">To exercise these rights, email us at <a href={`mailto:${EMAIL}`} className="text-cyan-400 hover:underline">{EMAIL}</a>. We will respond within 30 days.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-[var(--text)] mb-3">8. Security</h2>
          <p>We implement industry-standard security measures including TLS encryption in transit, hashed passwords (never stored in plain text), row-level security in our database, and regular security audits. However, no system is 100% secure and we cannot guarantee absolute security.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-[var(--text)] mb-3">9. Children's Privacy</h2>
          <p>The Service is not directed at children. In the EU/EEA, we do not knowingly collect personal data from children under 16 (or the lower minimum age set by your country, but never under 13) without verifiable parental consent. Elsewhere, the minimum age is 13. If you believe a child has provided us with their data without the required consent, please contact us and we will delete it promptly.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-[var(--text)] mb-3">10. Cookies</h2>
          <p>We use essential cookies for authentication and session management. We do not use tracking or advertising cookies. You can disable cookies in your browser settings, but this may affect the functionality of the Service.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-[var(--text)] mb-3">11. Changes to This Policy</h2>
          <p>We may update this Privacy Policy periodically. We will notify you of material changes via email or in-app notification at least 30 days before they take effect.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-[var(--text)] mb-3">12. Contact & Data Protection Officer</h2>
          <p>
            For privacy questions, data requests, or complaints, contact us at{' '}
            <a href={`mailto:${EMAIL}`} className="text-cyan-400 hover:underline">{EMAIL}</a>.
            You also have the right to lodge a complaint with your local data protection authority.
          </p>
        </section>
      </div>

      <div className="mt-10 pt-6 border-t border-[var(--border)] flex items-center justify-between">
        <p className="text-xs text-[var(--text-muted)]">© {new Date().getFullYear()} {COMPANY}. All rights reserved.</p>
        <Link to="/terms" className="text-xs text-cyan-400 hover:underline">Terms of Service →</Link>
      </div>
    </div>
  )
}
