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
import ParkingAdmin from "@/pages/ParkingAdmin";
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
        // 載入中顯示空白頁面避免閃爍
        <Route path="*">
          <div className="flex items-center justify-center min-h-screen">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </Route>
      ) : !isAuthenticated ? (
        <>
          <Route path="/" component={Landing} />
          {/* 未認證用戶訪問受保護頁面時重定向到首頁 */}
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

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
