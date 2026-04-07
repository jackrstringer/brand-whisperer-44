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
import BrandSettings from "./pages/BrandSettings";
import BrandGuide from "./pages/BrandGuide";
import GlobalSettings from "./pages/GlobalSettings";
import CampaignsList from "./pages/CampaignsList";
import CampaignEditor from "./pages/CampaignEditor";
import CampaignQA from "./pages/CampaignQA";
import AppLayout from "./components/AppLayout";
import AdminLibrary from "./pages/AdminLibrary";
import BrandIntelligence from "./pages/BrandIntelligence";
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
      <Route path="/brands/:brandId/settings" element={<ProtectedLayout><BrandSettings /></ProtectedLayout>} />
      <Route path="/brands/:brandId/guide" element={<ProtectedLayout><BrandGuide /></ProtectedLayout>} />
      <Route path="/brands/:brandId/campaigns/:campaignId" element={<ProtectedRoute><CampaignEditor /></ProtectedRoute>} />
      <Route path="/brands/:brandId/campaigns/:campaignId/qa" element={<ProtectedRoute><CampaignQA /></ProtectedRoute>} />
      <Route path="/settings" element={<ProtectedLayout><GlobalSettings /></ProtectedLayout>} />
      <Route path="/admin/library" element={<ProtectedRoute><AdminLibrary /></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
  <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
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
