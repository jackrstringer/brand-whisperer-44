import { AppSidebar } from "@/components/AppSidebar";
import { useLocation } from "react-router-dom";

// Routes that need full-width (no max-width container)
const FULL_WIDTH_ROUTES = ["/ideate", "/flows/"];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const isFullWidth = FULL_WIDTH_ROUTES.some(r => location.pathname.includes(r));

  return (
    <div className="min-h-screen flex w-full">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0 bg-background">
        {isFullWidth ? (
          <main className="flex-1 overflow-hidden relative">
            {children}
          </main>
        ) : (
          <main className="flex-1 overflow-auto">
            <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 48px" }}>
              {children}
            </div>
          </main>
        )}
      </div>
    </div>
  );
}
