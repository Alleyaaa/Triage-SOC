import { Sidebar } from "../Sidebar";

export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-[100dvh] bg-background text-foreground overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-auto bg-background">
        {children}
      </main>
    </div>
  );
}