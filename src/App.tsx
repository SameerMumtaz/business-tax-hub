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
import PersonalIncomePage from "./pages/PersonalIncomePage";
import PersonalExpensesPage from "./pages/PersonalExpensesPage";
import PersonalDeductionsPage from "./pages/PersonalDeductionsPage";
import PersonalTaxCenterPage from "./pages/PersonalTaxCenterPage";
import Personal1040Page from "./pages/Personal1040Page";
import PersonalProfilePage from "./pages/PersonalProfilePage";
import PersonalImportPage from "./pages/PersonalImportPage";
import PersonalBudgetPage from "./pages/PersonalBudgetPage";
import JobSchedulerPage from "./pages/JobSchedulerPage";
import TimesheetsPage from "./pages/TimesheetsPage";
import TeamPage from "./pages/TeamPage";
import CrewDashboardPage from "./pages/CrewDashboardPage";
import CrewMapPage from "./pages/CrewMapPage";
import VehiclesPage from "./pages/VehiclesPage";
import QuotesPage from "./pages/QuotesPage";
import PublicQuotePage from "./pages/PublicQuotePage";
import PublicInvoicePage from "./pages/PublicInvoicePage";
import PublicBookingPage from "./pages/PublicBookingPage";
import BookingSettingsPage from "./pages/BookingSettingsPage";
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

            {/* Business routes (admin) */}
            <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
            <Route path="/import" element={<ProtectedRoute><ImportPage /></ProtectedRoute>} />
            <Route path="/categorization" element={<ProtectedRoute><CategorizationRulesPage /></ProtectedRoute>} />
            <Route path="/sales" element={<ProtectedRoute><SalesPage /></ProtectedRoute>} />
            <Route path="/quotes" element={<ProtectedRoute><QuotesPage /></ProtectedRoute>} />
            <Route path="/invoices" element={<ProtectedRoute><InvoicesPage /></ProtectedRoute>} />
            <Route path="/clients" element={<ProtectedRoute><ClientsPage /></ProtectedRoute>} />
            <Route path="/expenses" element={<ProtectedRoute><ExpensesPage /></ProtectedRoute>} />
            <Route path="/profit-loss" element={<ProtectedRoute><ProfitLossPage /></ProtectedRoute>} />
            <Route path="/tax-center" element={<ProtectedRoute><TaxCenterPage /></ProtectedRoute>} />
            <Route path="/1099" element={<ProtectedRoute><Report1099Page /></ProtectedRoute>} />
            <Route path="/aging" element={<ProtectedRoute><AgingReportPage /></ProtectedRoute>} />
            <Route path="/reconciliation" element={<ProtectedRoute><ReconciliationPage /></ProtectedRoute>} />
            <Route path="/vehicles" element={<ProtectedRoute><VehiclesPage /></ProtectedRoute>} />
            <Route path="/booking-settings" element={<ProtectedRoute><BookingSettingsPage /></ProtectedRoute>} />
            <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />

            {/* Shared business routes (admin + manager) */}
            <Route path="/jobs" element={<ProtectedRoute><JobSchedulerPage /></ProtectedRoute>} />
            <Route path="/timesheets" element={<ProtectedRoute><TimesheetsPage /></ProtectedRoute>} />
            <Route path="/team" element={<ProtectedRoute><TeamPage /></ProtectedRoute>} />
            <Route path="/crew-map" element={<ProtectedRoute><CrewMapPage /></ProtectedRoute>} />

            {/* Crew routes */}
            <Route path="/crew" element={<ProtectedRoute><CrewDashboardPage /></ProtectedRoute>} />

            {/* Personal/Individual routes */}
            <Route path="/personal" element={<ProtectedRoute><PersonalDashboardPage /></ProtectedRoute>} />
            <Route path="/personal/income" element={<ProtectedRoute><PersonalIncomePage /></ProtectedRoute>} />
            <Route path="/personal/expenses" element={<ProtectedRoute><PersonalExpensesPage /></ProtectedRoute>} />
            <Route path="/personal/import" element={<ProtectedRoute><PersonalImportPage /></ProtectedRoute>} />
            <Route path="/personal/budget" element={<ProtectedRoute><PersonalBudgetPage /></ProtectedRoute>} />
            <Route path="/personal/deductions" element={<ProtectedRoute><PersonalDeductionsPage /></ProtectedRoute>} />
            <Route path="/personal/tax-center" element={<ProtectedRoute><PersonalTaxCenterPage /></ProtectedRoute>} />
            <Route path="/personal/1040" element={<ProtectedRoute><Personal1040Page /></ProtectedRoute>} />
            <Route path="/personal/profile" element={<ProtectedRoute><PersonalProfilePage /></ProtectedRoute>} />

            <Route path="/q/:token" element={<PublicQuotePage />} />
            <Route path="/invoice/view/:token" element={<PublicInvoicePage />} />
            <Route path="/book/:slug" element={<PublicBookingPage />} />
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
