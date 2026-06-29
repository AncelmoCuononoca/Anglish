import { Link } from 'react-router-dom'
import { ChevronRight, FileText } from 'lucide-react'

const LAST_UPDATED = 'June 2025'
const COMPANY = 'Anglish Me'
const EMAIL = 'support@anglishai.com'

export function TermsPage() {
  return (
    <div className="p-6 md:p-8 max-w-3xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-[var(--text-muted)] mb-6">
        <Link to="/settings" className="hover:text-[var(--text)]">Settings</Link>
        <ChevronRight size={14} />
        <span className="text-[var(--text)]">Terms of Service</span>
      </div>

      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-400/20 flex items-center justify-center">
          <FileText size={18} className="text-purple-400" />
        </div>
        <div>
          <h1 className="text-2xl font-black text-[var(--text)]">Terms of Service</h1>
          <p className="text-sm text-[var(--text-muted)]">Last updated: {LAST_UPDATED}</p>
        </div>
      </div>

      <div className="space-y-8 text-[var(--text-muted)] leading-relaxed">
        <section>
          <h2 className="text-lg font-bold text-[var(--text)] mb-3">1. Acceptance of Terms</h2>
          <p>By accessing or using {COMPANY} ("the Service", "we", "us", "our"), you agree to be bound by these Terms of Service. If you do not agree to these terms, please do not use the Service.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-[var(--text)] mb-3">2. Description of Service</h2>
          <p className="mb-2">{COMPANY} is an AI-powered English language learning platform designed for Portuguese speakers. The Service provides:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Interactive grammar and vocabulary lessons</li>
            <li>AI-powered conversation practice (Chat)</li>
            <li>Speaking exercises with real-time feedback (Speaking)</li>
            <li>Progress tracking, XP, and achievement systems</li>
            <li>Scheduled live classes with human teachers</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-[var(--text)] mb-3">3. Account Registration</h2>
          <p className="mb-2">You must create an account to access the Service. You agree to:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Provide accurate and complete information during registration</li>
            <li>Maintain the security of your password and account credentials</li>
            <li>Notify us immediately of any unauthorised use of your account</li>
            <li>Be responsible for all activities that occur under your account</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-[var(--text)] mb-3">4. Subscription and Payments</h2>
          <p className="mb-2">{COMPANY} offers free and paid subscription plans. For paid plans:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Payments are processed securely through our payment provider</li>
            <li>Subscriptions automatically renew unless cancelled before the renewal date</li>
            <li>Refunds may be requested within 7 days of purchase for annual plans</li>
            <li>Price changes will be communicated at least 30 days in advance</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-[var(--text)] mb-3">5. Acceptable Use</h2>
          <p className="mb-2">You agree NOT to:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Use the Service for any unlawful purpose or in violation of any regulations</li>
            <li>Share your account credentials with others or allow multiple users to access one account</li>
            <li>Attempt to reverse-engineer, decompile, or extract the AI models used</li>
            <li>Use automated tools, bots, or scripts to interact with the Service</li>
            <li>Upload or transmit any malicious code, spam, or harmful content</li>
            <li>Harass, abuse, or harm other users through any community features</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-bold text-[var(--text)] mb-3">6. Intellectual Property</h2>
          <p>All content provided by {COMPANY}, including lessons, exercises, audio recordings, AI models, and the interface design, is owned by {COMPANY} or its licensors and is protected by copyright law. You may not reproduce, distribute, or create derivative works without our express written permission.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-[var(--text)] mb-3">7. User Content</h2>
          <p>By submitting text, voice recordings, or other content through the Service, you grant {COMPANY} a non-exclusive, worldwide, royalty-free licence to use this content solely for providing and improving the Service. We will never sell your personal content to third parties.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-[var(--text)] mb-3">8. AI-Generated Content</h2>
          <p>Our AI features (Chat, Speaking) generate responses that may contain errors. {COMPANY} does not guarantee the accuracy of AI-generated content. Always verify important information with qualified human instructors.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-[var(--text)] mb-3">9. Limitation of Liability</h2>
          <p>To the maximum extent permitted by law, {COMPANY} shall not be liable for any indirect, incidental, special, or consequential damages arising from your use of the Service, including but not limited to loss of data, loss of revenue, or loss of learning opportunities.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-[var(--text)] mb-3">10. Termination</h2>
          <p>We reserve the right to suspend or terminate your account if you violate these Terms. You may delete your account at any time from the Settings page. Upon termination, your right to use the Service ceases immediately.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-[var(--text)] mb-3">11. Changes to Terms</h2>
          <p>We may update these Terms at any time. We will notify you of significant changes via email or in-app notification. Continued use of the Service after changes constitutes acceptance of the new Terms.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-[var(--text)] mb-3">12. Governing Law</h2>
          <p>These Terms are governed by the laws of the Republic of Angola. Any disputes shall be resolved in the courts of Luanda, Angola, unless otherwise required by applicable consumer protection law in your country of residence.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-[var(--text)] mb-3">13. Contact</h2>
          <p>
            For questions about these Terms, contact us at{' '}
            <a href={`mailto:${EMAIL}`} className="text-purple-400 hover:underline">{EMAIL}</a>.
          </p>
        </section>
      </div>

      <div className="mt-10 pt-6 border-t border-[var(--border)] flex items-center justify-between">
        <p className="text-xs text-[var(--text-muted)]">© {new Date().getFullYear()} {COMPANY}. All rights reserved.</p>
        <Link to="/privacy" className="text-xs text-purple-400 hover:underline">Privacy Policy →</Link>
      </div>
    </div>
  )
}
