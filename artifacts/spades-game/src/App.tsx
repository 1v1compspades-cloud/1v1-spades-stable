import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SocketProvider } from "@/hooks/useSocket";
import { MusicPlayer } from "@/components/MusicPlayer";
import { InAppBrowserBanner } from "@/components/InAppBrowserBanner";
import NotFound from "@/pages/not-found";
import Lobby from "@/pages/Lobby";
import Room from "@/pages/Room";
import Tournament from "@/pages/Tournament";
import HostDashboard from "@/pages/HostDashboard";
import Rules from "@/pages/info/Rules";
import FairPlay from "@/pages/info/FairPlay";
import Privacy from "@/pages/info/Privacy";
import Terms from "@/pages/info/Terms";
import Support from "@/pages/info/Support";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Lobby} />
      <Route path="/rules" component={Rules} />
      <Route path="/fair-play" component={FairPlay} />
      <Route path="/privacy" component={Privacy} />
      <Route path="/terms" component={Terms} />
      <Route path="/support" component={Support} />
      <Route path="/room/:roomCode" component={Room} />
      <Route path="/tournament/:code/host" component={HostDashboard} />
      <Route path="/tournament/:code" component={Tournament} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <SocketProvider>
          <InAppBrowserBanner />
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <Router />
          </WouterRouter>
          <MusicPlayer />
          <Toaster />
        </SocketProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
