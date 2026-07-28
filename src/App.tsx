import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import Login from "./pages/Login";
import BrandDashboard from "./pages/BrandDashboard";
import BrandSetup from "./pages/BrandSetup";
import BrandOnboarding from "./pages/BrandOnboarding";
import BrandCalendar from "./pages/BrandCalendar";
import BrandSegments from "./pages/BrandSegments";
import BrandProfile from "./pages/BrandProfile";
import BrandIntelligence from "./pages/BrandIntelligence";
import BrandIntegrations from "./pages/BrandIntegrations";
import BrandPreferences from "./pages/BrandPreferences";
import GlobalSettings from "./pages/GlobalSettings";
import CampaignsList from "./pages/CampaignsList";
import CampaignEditor from "./pages/CampaignEditor";
import CampaignQA from "./pages/CampaignQA";
import AppLayout from "./components/AppLayout";
import AdminLibrary from "./pages/AdminLibrary";
import IdeatePage from "./pages/IdeatePage";
import FlowsListPage from "./pages/FlowsListPage";
import FlowBuilderPage from "./pages/FlowBuilderPage";
import FlowSetupPage from "./pages/FlowSetupPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">Loading...</p></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">Loading...</p></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <AppLayout>{children}</AppLayout>;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={loading ? null : user ? <Navigate to="/dashboard" replace /> : <Login />} />
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/dashboard" element={<ProtectedLayout><BrandDashboard /></ProtectedLayout>} />
      <Route path="/brands/new" element={<ProtectedLayout><BrandSetup /></ProtectedLayout>} />
      <Route path="/brands/:brandId" element={<ProtectedLayout><CampaignsList /></ProtectedLayout>} />
      <Route path="/brands/:brandId/onboarding" element={<ProtectedLayout><BrandOnboarding /></ProtectedLayout>} />
      <Route path="/brands/:brandId/calendar" element={<ProtectedLayout><BrandCalendar /></ProtectedLayout>} />
      <Route path="/brands/:brandId/segments" element={<ProtectedLayout><BrandSegments /></ProtectedLayout>} />
      <Route path="/brands/:brandId/brand" element={<ProtectedLayout><BrandProfile /></ProtectedLayout>} />
      <Route path="/brands/:brandId/intelligence" element={<ProtectedLayout><BrandIntelligence /></ProtectedLayout>} />
      <Route path="/brands/:brandId/integrations" element={<ProtectedLayout><BrandIntegrations /></ProtectedLayout>} />
      <Route path="/brands/:brandId/preferences" element={<ProtectedLayout><BrandPreferences /></ProtectedLayout>} />
      <Route path="/brands/:brandId/ideate" element={<ProtectedLayout><IdeatePage /></ProtectedLayout>} />
      <Route path="/brands/:brandId/flows" element={<ProtectedLayout><FlowsListPage /></ProtectedLayout>} />
      <Route path="/brands/:brandId/flows/new/:flowType" element={<ProtectedLayout><FlowSetupPage /></ProtectedLayout>} />
      <Route path="/brands/:brandId/flows/:flowId" element={<ProtectedLayout><FlowBuilderPage /></ProtectedLayout>} />
      <Route path="/brands/:brandId/campaigns/:campaignId" element={<ProtectedRoute><CampaignEditor /></ProtectedRoute>} />
      <Route path="/brands/:brandId/campaigns/:campaignId/qa" element={<ProtectedRoute><CampaignQA /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedLayout><GlobalSettings /></ProtectedLayout>} />
      <Route path="/admin/library" element={<ProtectedRoute><AdminLibrary /></ProtectedRoute>} />
      {/* Redirect old routes */}
      <Route path="/brands/:brandId/settings" element={<Navigate to="../preferences" replace />} />
      <Route path="/brands/:brandId/guide" element={<Navigate to="../brand" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem storageKey="lucy-theme">
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AuthProvider>
            <AppRoutes />
          </AuthProvider>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
);

export default App;
