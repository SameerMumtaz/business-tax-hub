import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import { DateRangeProvider } from "@/contexts/DateRangeContext";
import ProtectedRoute, { ProfileGateProvider } from "@/components/ProtectedRoute";
import AuthPage from "./pages/AuthPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import AccountTypePage from "./pages/AccountTypePage";
import DashboardPage from "./pages/DashboardPage";
import SalesPage from "./pages/SalesPage";
import ExpensesPage from "./pages/ExpensesPage";
import ProfitLossPage from "./pages/ProfitLossPage";
import Report1099Page from "./pages/Report1099Page";
import TaxCenterPage from "./pages/TaxCenterPage";
import ImportPage from "./pages/ImportPage";
import CategorizationRulesPage from "./pages/CategorizationRulesPage";
import ProfilePage from "./pages/ProfilePage";
import InvoicesPage from "./pages/InvoicesPage";
import ClientsPage from "./pages/ClientsPage";
import AgingReportPage from "./pages/AgingReportPage";
import ReconciliationPage from "./pages/ReconciliationPage";
import PersonalDashboardPage from "./pages/PersonalDashboardPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <ProfileGateProvider>
      <DateRangeProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/account-type" element={<ProtectedRoute><AccountTypePage /></ProtectedRoute>} />

            {/* Business routes */}
            <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
            <Route path="/import" element={<ProtectedRoute><ImportPage /></ProtectedRoute>} />
            <Route path="/categorization" element={<ProtectedRoute><CategorizationRulesPage /></ProtectedRoute>} />
            <Route path="/sales" element={<ProtectedRoute><SalesPage /></ProtectedRoute>} />
            <Route path="/invoices" element={<ProtectedRoute><InvoicesPage /></ProtectedRoute>} />
            <Route path="/clients" element={<ProtectedRoute><ClientsPage /></ProtectedRoute>} />
            <Route path="/expenses" element={<ProtectedRoute><ExpensesPage /></ProtectedRoute>} />
            <Route path="/profit-loss" element={<ProtectedRoute><ProfitLossPage /></ProtectedRoute>} />
            <Route path="/tax-center" element={<ProtectedRoute><TaxCenterPage /></ProtectedRoute>} />
            <Route path="/1099" element={<ProtectedRoute><Report1099Page /></ProtectedRoute>} />
            <Route path="/aging" element={<ProtectedRoute><AgingReportPage /></ProtectedRoute>} />
            <Route path="/reconciliation" element={<ProtectedRoute><ReconciliationPage /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />

            {/* Personal/Individual routes */}
            <Route path="/personal" element={<ProtectedRoute><PersonalDashboardPage /></ProtectedRoute>} />

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
      </DateRangeProvider>
      </ProfileGateProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
