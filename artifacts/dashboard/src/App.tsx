import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import Sessions from "@/pages/Sessions";
import SessionWorkspace from "@/pages/SessionWorkspace";
import SessionTimeline from "@/pages/SessionTimeline";
import Reports from "@/pages/Reports";
import ReportDetail from "@/pages/ReportDetail";
import Settings from "@/pages/Settings";
import { AppLayout } from "@/components/layout/AppLayout";
import { useEffect } from "react";

const queryClient = new QueryClient();

function Router() {
  return (
    <AppLayout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/sessions" component={Sessions} />
        <Route path="/sessions/:id/timeline" component={SessionTimeline} />
        <Route path="/sessions/:id" component={SessionWorkspace} />
        <Route path="/reports" component={Reports} />
        <Route path="/reports/:id" component={ReportDetail} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </AppLayout>
  );
}

function App() {
  useEffect(() => {
    document.documentElement.classList.add('dark');
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;