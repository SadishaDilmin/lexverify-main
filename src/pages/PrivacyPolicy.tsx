import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import PublicNav from "@/components/PublicNav";

const PrivacyPolicy = () => {
  return (
    <div className="min-h-screen bg-background">
      <PublicNav />
      <div className="max-w-4xl mx-auto px-6 py-12 pt-24">
        <Button asChild variant="ghost" size="sm" className="mb-6 text-muted-foreground hover:text-foreground">
          <Link to="/">
            <ArrowLeft size={16} className="mr-2" /> Back
          </Link>
        </Button>

        <h1 className="text-3xl font-bold text-foreground mb-2">Privacy Policy</h1>
        <p className="text-sm text-muted-foreground mb-8">Last updated: 28 February 2026</p>

        <div className="prose prose-sm max-w-none text-foreground space-y-6">
          <section>
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">1. Introduction</h2>
            <p className="text-muted-foreground leading-relaxed">
              Olimey AI ("the Company", "we", "us", "our") is committed to protecting the privacy and security of personal data processed through the Olimey AI platform ("the Platform"). This Privacy Policy explains how we collect, use, store, and protect your information in accordance with the UK General Data Protection Regulation (UK GDPR), the Data Protection Act 2018, and all applicable data protection legislation.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">2. Data Controller</h2>
            <p className="text-muted-foreground leading-relaxed">
              Olimey AI is the data controller for personal data processed through the Platform. For data protection enquiries, please contact our Data Protection Officer at: <span className="text-accent">dpo@lexsentinel.co.uk</span>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">3. Information We Collect</h2>
            <p className="text-muted-foreground leading-relaxed">We collect and process the following categories of personal data:</p>
            <h3 className="text-base font-semibold text-foreground mt-4 mb-2">3.1 Account Information</h3>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1.5">
              <li>Full name, email address, position, and firm name provided during registration.</li>
              <li>Authentication credentials (passwords are stored in hashed form and are never accessible in plaintext).</li>
              <li>Role and permission assignments within the Platform.</li>
            </ul>
            <h3 className="text-base font-semibold text-foreground mt-4 mb-2">3.2 Professional Activity Data</h3>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1.5">
              <li>Case information including property addresses, case references, and transaction details.</li>
              <li>Documents uploaded for AI analysis, including property search results and EPCs.</li>
              <li>AI-generated reports, risk assessments, and draft correspondence.</li>
              <li>User modifications to AI-generated content.</li>
              <li>Feedback and quality assurance submissions.</li>
            </ul>
            <h3 className="text-base font-semibold text-foreground mt-4 mb-2">3.3 Technical and Usage Data</h3>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1.5">
              <li>Login timestamps, session identifiers, and IP addresses.</li>
              <li>AI disclaimer acknowledgement records with timestamps.</li>
              <li>Comprehensive audit trail data for all platform interactions.</li>
              <li>Browser type, device information, and operating system.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">4. Lawful Basis for Processing</h2>
            <p className="text-muted-foreground leading-relaxed">We process personal data on the following legal bases:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1.5 mt-2">
              <li><strong className="text-foreground">Contract:</strong> Processing necessary for the performance of our contract with you to provide the Platform services.</li>
              <li><strong className="text-foreground">Legitimate Interests:</strong> Processing necessary for our legitimate interests in operating, improving, and securing the Platform, provided these interests are not overridden by your rights.</li>
              <li><strong className="text-foreground">Legal Obligation:</strong> Processing necessary to comply with legal and regulatory requirements, including maintaining audit trails for professional indemnity and regulatory compliance purposes.</li>
              <li><strong className="text-foreground">Consent:</strong> Where you have provided explicit consent, such as accepting the AI Usage Disclaimer.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">5. How We Use Your Information</h2>
            <p className="text-muted-foreground leading-relaxed">Your personal data is used for the following purposes:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1.5 mt-2">
              <li>Providing and operating the Platform, including AI-powered document analysis and report generation.</li>
              <li>Authenticating users and managing account access.</li>
              <li>Maintaining comprehensive audit trails for regulatory compliance and professional indemnity defence.</li>
              <li>Improving the accuracy and reliability of AI outputs through anonymised and aggregated analysis.</li>
              <li>Communicating with you regarding your account, service updates, and security notifications.</li>
              <li>Fulfilling legal and regulatory obligations.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">6. AI Processing and Data Usage</h2>
            <p className="text-muted-foreground leading-relaxed">
              Documents uploaded to the Platform are processed by AI systems solely for the purpose of providing the analysis service. We confirm that:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1.5 mt-2">
              <li><strong className="text-foreground">No model training:</strong> Client data and uploaded documents are never used to train or fine-tune AI models.</li>
              <li><strong className="text-foreground">Transient processing:</strong> Document content is processed in real-time and is not retained by the AI model beyond the immediate analysis session.</li>
              <li><strong className="text-foreground">Result storage:</strong> AI-generated reports and risk assessments are stored within the Platform for your continued access, subject to data retention policies.</li>
              <li><strong className="text-foreground">No third-party sharing:</strong> Document content is not shared with any third party except the AI processing provider, which is bound by strict data processing agreements.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">7. Data Retention</h2>
            <p className="text-muted-foreground leading-relaxed">We retain personal data for the following periods:</p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1.5 mt-2">
              <li><strong className="text-foreground">Account data:</strong> Retained for the duration of your account and for six (6) years following account closure.</li>
              <li><strong className="text-foreground">Case data and documents:</strong> Retained for a minimum of six (6) years from case completion, in line with professional indemnity requirements and the Limitation Act 1980.</li>
              <li><strong className="text-foreground">Audit trail records:</strong> Retained for a minimum of fifteen (15) years to support regulatory compliance and long-tail professional indemnity claims.</li>
              <li><strong className="text-foreground">AI disclaimer acknowledgements:</strong> Retained indefinitely as part of the immutable audit trail.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">8. Data Security</h2>
            <p className="text-muted-foreground leading-relaxed">
              We implement appropriate technical and organisational measures to protect personal data, including:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1.5 mt-2">
              <li>Encryption of data in transit (TLS 1.2+) and at rest (AES-256).</li>
              <li>Role-based access controls and row-level security policies on all database tables.</li>
              <li>Private storage buckets for all uploaded documents.</li>
              <li>Immutable audit records that cannot be altered or deleted.</li>
              <li>Regular security assessments and penetration testing.</li>
              <li>Compliance with ISO 27001:2022 and SOC 2 Type II standards.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">9. Data Sharing and Third Parties</h2>
            <p className="text-muted-foreground leading-relaxed">
              We do not sell, rent, or trade your personal data. We may share data with:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1.5 mt-2">
              <li><strong className="text-foreground">Infrastructure providers:</strong> Cloud hosting and database services, bound by data processing agreements and operating within UK/EEA jurisdictions or under adequate safeguards.</li>
              <li><strong className="text-foreground">AI processing providers:</strong> For the sole purpose of document analysis, subject to strict data processing agreements prohibiting data retention or model training.</li>
              <li><strong className="text-foreground">Legal and regulatory authorities:</strong> Where required by law, court order, or regulatory obligation.</li>
              <li><strong className="text-foreground">Professional indemnity insurers:</strong> Where necessary in connection with a claim or potential claim, limited to relevant audit trail and case data.</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">10. Your Rights</h2>
            <p className="text-muted-foreground leading-relaxed">
              Under UK GDPR, you have the following rights regarding your personal data:
            </p>
            <ul className="list-disc pl-6 text-muted-foreground space-y-1.5 mt-2">
              <li><strong className="text-foreground">Right of Access:</strong> Request a copy of the personal data we hold about you.</li>
              <li><strong className="text-foreground">Right to Rectification:</strong> Request correction of inaccurate or incomplete data.</li>
              <li><strong className="text-foreground">Right to Erasure:</strong> Request deletion of your data, subject to legal retention obligations. Note: audit trail records are exempt from erasure requests due to legitimate legal obligations.</li>
              <li><strong className="text-foreground">Right to Restrict Processing:</strong> Request restriction of processing in certain circumstances.</li>
              <li><strong className="text-foreground">Right to Data Portability:</strong> Request your data in a structured, commonly used, machine-readable format.</li>
              <li><strong className="text-foreground">Right to Object:</strong> Object to processing based on legitimate interests.</li>
              <li><strong className="text-foreground">Right to Withdraw Consent:</strong> Where processing is based on consent, withdraw that consent at any time.</li>
            </ul>
            <p className="text-muted-foreground leading-relaxed mt-2">
              To exercise any of these rights, please contact: <span className="text-accent">dpo@lexsentinel.co.uk</span>. We will respond within one calendar month.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">11. International Transfers</h2>
            <p className="text-muted-foreground leading-relaxed">
              Where personal data is transferred outside the UK or EEA, we ensure appropriate safeguards are in place, including Standard Contractual Clauses (SCCs), adequacy decisions, or other approved transfer mechanisms under UK GDPR.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">12. Cookies and Tracking</h2>
            <p className="text-muted-foreground leading-relaxed">
              The Platform uses essential cookies required for authentication and session management. We do not use advertising cookies, tracking pixels, or third-party analytics that profile individual users. Essential cookies cannot be disabled as they are necessary for the Platform to function.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">13. Children's Privacy</h2>
            <p className="text-muted-foreground leading-relaxed">
              The Platform is designed for use by qualified legal professionals and is not intended for individuals under the age of 18. We do not knowingly collect personal data from children.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">14. Changes to This Policy</h2>
            <p className="text-muted-foreground leading-relaxed">
              We may update this Privacy Policy from time to time to reflect changes in our practices or legal requirements. Material changes will be communicated to registered users via email. The "Last updated" date at the top of this policy indicates when it was last revised.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-foreground mt-8 mb-3">15. Complaints</h2>
            <p className="text-muted-foreground leading-relaxed">
              If you are unsatisfied with our handling of your personal data, you have the right to lodge a complaint with the Information Commissioner's Office (ICO):
            </p>
            <ul className="list-none pl-0 text-muted-foreground space-y-1 mt-2">
              <li>Website: <span className="text-accent">ico.org.uk</span></li>
              <li>Telephone: 0303 123 1113</li>
            </ul>
          </section>

          <section className="border-t border-border pt-6 mt-8">
            <p className="text-muted-foreground text-sm">
              Olimey AI · Registered in England and Wales<br />
              Data Protection Officer: <span className="text-accent">dpo@lexsentinel.co.uk</span>
            </p>
          </section>
        </div>
      </div>
    </div>
  );
};

export default PrivacyPolicy;
