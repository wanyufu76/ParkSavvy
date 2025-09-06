import { useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import NotFound from "@/pages/not-found";
import Landing from "@/pages/Landing";
import Home from "@/pages/Home";
import Favorites from "@/pages/Favorites";
import Upload from "@/pages/Upload";
import Contact from "@/pages/Contact";
import SharedVideos from "@/pages/SharedVideos";
import AuthPage from "@/pages/auth-page";
import AdminLogin from "@/pages/AdminLogin";
import AdminDashboard from "@/pages/AdminDashboard";
import Profile from "@/pages/Profile";

// ✅ 專門處理 /admin redirect
function AdminRedirect() {
  const [, navigate] = useLocation();
  useEffect(() => {
    navigate("/admin/dashboard");
  }, [navigate]);
  return null;
}

function Router() {
  const { isAuthenticated, isLoading } = useAuth();

  return (
    <Switch>
      {/* 管理員路由 - 獨立認證 */}
      <Route path="/admin/login" component={AdminLogin} />
      <Route path="/admin/dashboard" component={AdminDashboard} />
      <Route path="/admin" component={AdminRedirect} />

      {/* 認證路由 */}
      <Route path="/auth" component={AuthPage} />

      {isLoading ? (
        <Route path="*">
          <div className="flex items-center justify-center min-h-screen">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </Route>
      ) : !isAuthenticated ? (
        <>
          <Route path="/" component={Landing} />
          <Route path="/favorites" component={Landing} />
          <Route path="/upload" component={Landing} />
          <Route path="/contact" component={Landing} />
          <Route path="/profile" component={Landing} />
          <Route component={Landing} />
        </>
      ) : (
        <>
          <Route path="/" component={Home} />
          <Route path="/favorites" component={Favorites} />
          <Route path="/upload" component={Upload} />
          <Route path="/contact" component={Contact} />
          <Route path="/shared-videos" component={SharedVideos} />
          <Route path="/profile" component={Profile} />
          <Route component={NotFound} />
        </>
      )}
    </Switch>
  );
}

// ✅ 閒置後直接登出（不跳 Dialog）
function AppWithIdleLogout() {
  const [, navigate] = useLocation();

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | null = null;
    let hasLoggedOut = false;

    const checkAndLogout = async () => {
      if (hasLoggedOut) return;

      try {
        const res = await fetch("/api/check-session", { credentials: "include" });
        if (res.status === 401) {
          hasLoggedOut = true;
          return;
        }
      } catch {
        // assume session is gone
      }

      hasLoggedOut = true;
      await fetch("/api/logout", {
        method: "POST",
        credentials: "include",
      });

      window.location.href = "/"; // 強制跳轉回首頁
    };

    const resetTimer = () => {
      if (hasLoggedOut) return;
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(checkAndLogout, 10 * 60 * 1000); // 10 分鐘登出
    };

    const events = ["mousemove", "mousedown", "keypress", "touchstart"];
    events.forEach((e) => window.addEventListener(e, resetTimer));
    resetTimer();

    return () => {
      if (timeout) clearTimeout(timeout);
      events.forEach((e) => window.removeEventListener(e, resetTimer));
    };
  }, [navigate]);

  return <Router />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AppWithIdleLogout />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
