import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, Navigate } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/useAuth";
import Login from "./pages/Login";
import BrandSetup from "./pages/BrandSetup";
import BrandOnboarding from "./pages/BrandOnboarding";
import CampaignsList from "./pages/CampaignsList";
import CampaignEditor from "./pages/CampaignEditor";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen bg-background flex items-center justify-center"><p className="text-muted-foreground">Loading...</p></div>;
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

function AppRoutes() {
  const { user, loading } = useAuth();

  return (
    <Routes>
      <Route path="/login" element={loading ? null : user ? <Navigate to="/brands/new" replace /> : <Login />} />
      <Route path="/" element={<Navigate to="/brands/new" replace />} />
      <Route path="/brands/new" element={<ProtectedRoute><BrandSetup /></ProtectedRoute>} />
      <Route path="/brands/:brandId" element={<ProtectedRoute><CampaignsList /></ProtectedRoute>} />
      <Route path="/brands/:brandId/onboarding" element={<ProtectedRoute><BrandOnboarding /></ProtectedRoute>} />
      <Route path="/brands/:brandId/campaigns/:campaignId" element={<ProtectedRoute><CampaignEditor /></ProtectedRoute>} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}

const App = () => (
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
);

export default App;
