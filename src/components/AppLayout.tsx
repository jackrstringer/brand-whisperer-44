import { AppSidebar } from "@/components/AppSidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex w-full">
      <AppSidebar />
      <div className="flex-1 flex flex-col min-w-0" style={{ background: "#FAFAFA" }}>
        <main className="flex-1 overflow-auto">
          <div style={{ maxWidth: 1100, margin: "0 auto", padding: "40px 48px" }}>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
