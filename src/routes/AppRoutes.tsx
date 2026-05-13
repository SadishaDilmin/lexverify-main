/**
 * M5 Fix: Route definitions extracted from App.tsx.
 * App.tsx now only handles providers; all route config lives here.
 */
import { lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import ProtectedRoute from "@/components/ProtectedRoute";
import AdminRoute from "@/components/AdminRoute";

// ── Public pages ──────────────────────────────────────────────────────
const Index = lazy(() => import("@/pages/Index"));
const Login = lazy(() => import("@/pages/Login"));
const Signup = lazy(() => import("@/pages/Signup"));
const ForgotPassword = lazy(() => import("@/pages/ForgotPassword"));
const ResetPassword = lazy(() => import("@/pages/ResetPassword"));
const RequestAccess = lazy(() => import("@/pages/RequestAccess"));
const TermsAndConditions = lazy(() => import("@/pages/TermsAndConditions"));
const PrivacyPolicy = lazy(() => import("@/pages/PrivacyPolicy"));

const Insights = lazy(() => import("@/pages/Insights"));
const ArticlePage = lazy(() => import("@/pages/ArticlePage"));
const AboutUs = lazy(() => import("@/pages/AboutUs"));
const Pricing = lazy(() => import("@/pages/Pricing"));
const FreeTrial = lazy(() => import("@/pages/FreeTrial"));
const Glossary = lazy(() => import("@/pages/Glossary"));
const NotFound = lazy(() => import("@/pages/NotFound"));
const ClientPortal = lazy(() => import("@/pages/ClientPortal"));

// ── Protected pages ───────────────────────────────────────────────────
const Dashboard = lazy(() => import("@/pages/Dashboard"));
const CaseNew = lazy(() => import("@/pages/CaseNew"));
const CaseWorkspace = lazy(() => import("@/pages/CaseWorkspace"));
const AgentChat = lazy(() => import("@/pages/AgentChat"));
// Only Olimey AI pages are active
const BuyCredits = lazy(() => import("@/pages/BuyCredits"));
const PaymentSuccess = lazy(() => import("@/pages/PaymentSuccess"));
const TransactionHistory = lazy(() => import("@/pages/TransactionHistory"));
const Settings = lazy(() => import("@/pages/Settings"));
const OversightQueue = lazy(() => import("@/pages/OversightQueue"));

// ── Admin pages ───────────────────────────────────────────────────────
const AdminUsers = lazy(() => import("@/pages/AdminUsers"));
const AuditLog = lazy(() => import("@/pages/AuditLog"));
const AdminFeedback = lazy(() => import("@/pages/AdminFeedback"));

const AdminFreeTrials = lazy(() => import("@/pages/AdminFreeTrials"));
const AdminKnowledgeBase = lazy(() => import("@/pages/AdminKnowledgeBase"));
const AdminRetrievalLogs = lazy(() => import("@/pages/AdminRetrievalLogs"));
const AdminEvidenceAudit = lazy(() => import("@/pages/AdminEvidenceAudit"));
const AdminReferrals = lazy(() => import("@/pages/AdminReferrals"));
const AdminGlossary = lazy(() => import("@/pages/AdminGlossary"));
const AdminCMSIntegrations = lazy(() => import("@/pages/AdminCMSIntegrations"));
const AdminApprovedDomains = lazy(() => import("@/pages/AdminApprovedDomains"));
const AdminAIChatLogs = lazy(() => import("@/pages/AdminAIChatLogs"));
const AdminArticleAudio = lazy(() => import("@/pages/AdminArticleAudio"));
const AdminDocumentChecklists = lazy(() => import("@/pages/AdminDocumentChecklists"));
const AdminBenchmarkVault = lazy(() => import("@/pages/AdminBenchmarkVault"));
const AdminPromptManagement = lazy(() => import("@/pages/AdminPromptManagement"));
const AdminSyntheticGenerator = lazy(() => import("@/pages/AdminSyntheticGenerator"));
const AdminBenchmarkDashboard = lazy(() => import("@/pages/AdminBenchmarkDashboard"));
const AdminAIHelpGuide = lazy(() => import("@/pages/AdminAIHelpGuide"));
const AdminBenchmarkGuide = lazy(() => import("@/pages/AdminBenchmarkGuide"));
const AdminNotifications = lazy(() => import("@/pages/AdminNotifications"));
const AdminStressTest = lazy(() => import("@/pages/AdminStressTest"));
const AdminSelfHealing = lazy(() => import("@/pages/AdminSelfHealing"));
const AdminStabilityManifest = lazy(() => import("@/pages/AdminStabilityManifest"));
const AdminIntegrations = lazy(() => import("@/pages/AdminIntegrations"));
const AdminComplianceDashboard = lazy(() => import("@/pages/AdminComplianceDashboard"));
const AdminRetrospectiveAudit = lazy(() => import("@/pages/AdminRetrospectiveAudit"));
const AdminSoWValidation = lazy(() => import("@/pages/AdminSoWValidation"));
// AdminPromptExport removed (LexTitle-only)
const AdminPromptExportWV = lazy(() => import("@/pages/AdminPromptExportWV"));
const AdminClaudeKnowledgePack = lazy(() => import("@/pages/AdminClaudeKnowledgePack"));
const AdminSoWFlowTest = lazy(() => import("@/pages/AdminSoWFlowTest"));
const AdminProfileSmokeTest = lazy(() => import("@/pages/AdminProfileSmokeTest"));

export default function AppRoutes() {
  return (
    <Routes>
      {/* Public */}
      <Route path="/" element={<Index />} />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="/request-access" element={<RequestAccess />} />
      <Route path="/terms" element={<TermsAndConditions />} />
      <Route path="/privacy" element={<PrivacyPolicy />} />

      <Route path="/insights" element={<Insights />} />
      <Route path="/insights/:slug" element={<ArticlePage />} />
      <Route path="/pricing" element={<Pricing />} />
      <Route path="/about" element={<AboutUs />} />
      <Route path="/glossary" element={<Glossary />} />
      <Route path="/free-trial" element={<Navigate to="/signup" replace />} />
      <Route path="/request-trial" element={<FreeTrial />} />
      <Route path="/portal/:token" element={<ClientPortal />} />


      {/* Protected */}
      <Route path="/agent-chat" element={<Navigate to="/agent/source-of-wealth" replace />} />
      <Route path="/agent/:agentId" element={<ProtectedRoute><AgentChat /></ProtectedRoute>} />
      {/* Legacy redirects for retired routes */}
      <Route path="/draft-review/*" element={<Navigate to="/dashboard" replace />} />
      <Route path="/exchange-guard/*" element={<Navigate to="/dashboard" replace />} />
      <Route path="/buy-credits" element={<ProtectedRoute><BuyCredits /></ProtectedRoute>} />
      <Route path="/payment-success" element={<ProtectedRoute><PaymentSuccess /></ProtectedRoute>} />
      <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
      <Route path="/dashboard/oversight-queue" element={<ProtectedRoute><OversightQueue /></ProtectedRoute>} />
      <Route path="/case/new" element={<ProtectedRoute><CaseNew /></ProtectedRoute>} />
      <Route path="/case/:id" element={<ProtectedRoute><CaseWorkspace /></ProtectedRoute>} />
      <Route path="/transactions" element={<ProtectedRoute><TransactionHistory /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedRoute><Settings /></ProtectedRoute>} />

      {/* Admin */}
      <Route path="/admin/users" element={<AdminRoute><AdminUsers /></AdminRoute>} />
      <Route path="/audit-log" element={<AdminRoute><AuditLog /></AdminRoute>} />
      <Route path="/admin/feedback" element={<AdminRoute><AdminFeedback /></AdminRoute>} />

      <Route path="/admin/free-trials" element={<AdminRoute><AdminFreeTrials /></AdminRoute>} />
      <Route path="/admin/knowledge-base" element={<AdminRoute><AdminKnowledgeBase /></AdminRoute>} />
      <Route path="/admin/retrieval-logs" element={<AdminRoute><AdminRetrievalLogs /></AdminRoute>} />
      <Route path="/admin/evidence-audit" element={<AdminRoute><AdminEvidenceAudit /></AdminRoute>} />
      <Route path="/admin/referrals" element={<AdminRoute><AdminReferrals /></AdminRoute>} />
      <Route path="/admin/glossary" element={<AdminRoute><AdminGlossary /></AdminRoute>} />
      <Route path="/admin/cms-integrations" element={<AdminRoute><AdminCMSIntegrations /></AdminRoute>} />
      <Route path="/admin/approved-domains" element={<AdminRoute><AdminApprovedDomains /></AdminRoute>} />
      <Route path="/admin/ai-chat-logs" element={<AdminRoute><AdminAIChatLogs /></AdminRoute>} />
      <Route path="/admin/article-audio" element={<AdminRoute><AdminArticleAudio /></AdminRoute>} />
      <Route path="/admin/document-checklists" element={<AdminRoute><AdminDocumentChecklists /></AdminRoute>} />
      <Route path="/admin/benchmark-vault" element={<AdminRoute><AdminBenchmarkVault /></AdminRoute>} />
      <Route path="/admin/prompt-management" element={<AdminRoute><AdminPromptManagement /></AdminRoute>} />
      <Route path="/admin/synthetic-generator" element={<AdminRoute><AdminSyntheticGenerator /></AdminRoute>} />
      <Route path="/admin/benchmark-dashboard" element={<AdminRoute><AdminBenchmarkDashboard /></AdminRoute>} />
      <Route path="/admin/ai-help-guide" element={<AdminRoute><AdminAIHelpGuide /></AdminRoute>} />
      <Route path="/admin/benchmark-guide" element={<AdminRoute><AdminBenchmarkGuide /></AdminRoute>} />
      <Route path="/admin/notifications" element={<AdminRoute><AdminNotifications /></AdminRoute>} />
      <Route path="/admin/stress-test" element={<AdminRoute><AdminStressTest /></AdminRoute>} />
      <Route path="/admin/self-healing" element={<AdminRoute><AdminSelfHealing /></AdminRoute>} />
      <Route path="/admin/stability-manifest" element={<AdminRoute><AdminStabilityManifest /></AdminRoute>} />
      <Route path="/admin/integrations" element={<AdminRoute><AdminIntegrations /></AdminRoute>} />
      <Route path="/admin/compliance-dashboard" element={<AdminRoute><AdminComplianceDashboard /></AdminRoute>} />
      <Route path="/admin/retrospective-audit" element={<AdminRoute><AdminRetrospectiveAudit /></AdminRoute>} />
      <Route path="/admin/sow-validation" element={<AdminRoute><AdminSoWValidation /></AdminRoute>} />
      {/* AdminPromptExport (LexTitle-only) removed — use AdminPromptExportWV for Olimey AI */}
      <Route path="/admin/prompt-export" element={<Navigate to="/admin/prompt-export-wv" replace />} />
      <Route path="/admin/prompt-export-wv" element={<AdminRoute><AdminPromptExportWV /></AdminRoute>} />
      <Route path="/admin/claude-knowledge-pack" element={<AdminRoute><AdminClaudeKnowledgePack /></AdminRoute>} />
      <Route path="/admin/sow-flow-test" element={<AdminRoute><AdminSoWFlowTest /></AdminRoute>} />
      <Route path="/admin/profile-smoke-test" element={<AdminRoute><AdminProfileSmokeTest /></AdminRoute>} />

      {/* Catch-all */}
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
