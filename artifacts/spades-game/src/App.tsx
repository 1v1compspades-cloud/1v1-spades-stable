import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SocketProvider } from "@/hooks/useSocket";
import { MusicPlayer } from "@/components/MusicPlayer";
import NotFound from "@/pages/not-found";
import Lobby from "@/pages/Lobby";
import Room from "@/pages/Room";
import Tournament from "@/pages/Tournament";
import HostDashboard from "@/pages/HostDashboard";

const queryClient = new QueryClient();

function Router() {
  return (
    <Switch>
      <Route path="/" component={Lobby} />
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
