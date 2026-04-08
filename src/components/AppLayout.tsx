import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0" style={{ background: "var(--surface)" }}>
          <header className="h-10 flex items-center border-b border-border shrink-0 px-2" style={{ background: "var(--white)" }}>
            <SidebarTrigger />
          </header>
          <main className="flex-1 overflow-auto">
            <div className="max-w-[1100px] mx-auto px-12 py-10">
              {children}
            </div>
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
