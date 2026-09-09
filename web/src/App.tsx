import { useEffect } from "react";
import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import Layout from "./components/Layout";
import { Spinner } from "./components/ui";
import { useSession } from "./lib/session";
import Dashboard from "./pages/Dashboard";
import GameReview from "./pages/GameReview";
import Games from "./pages/Games";
import Login from "./pages/Login";
import Profile from "./pages/Profile";
import Progression from "./pages/Progression";
import Register from "./pages/Register";
import Settings from "./pages/Settings";
import Training from "./pages/Training";
import Import from "./pages/Import";
import { ToastProvider } from "./lib/toast";

function Splash() {
  return (
    <div className="flex min-h-dvh items-center justify-center">
      <Spinner className="h-6 w-6 text-muted" />
    </div>
  );
}

function RequireAuth() {
  const { user } = useSession();
  const location = useLocation();
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  return <Outlet />;
}

function Public() {
  const { user } = useSession();
  if (user) return <Navigate to="/dashboard" replace />;
  return <Outlet />;
}

export default function App() {
  const { bootstrapped, bootstrap } = useSession();

  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);

  if (!bootstrapped) return <Splash />;

  return (
    <ToastProvider>
      <Routes>
        <Route element={<Public />}>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Route>

        <Route element={<RequireAuth />}>
          <Route element={<Layout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/games" element={<Games />} />
            <Route path="/games/:id" element={<GameReview />} />
            <Route path="/progression" element={<Progression />} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/training" element={<Training />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/import" element={<Import />} />
            <Route path="/local/:id" element={<GameReview />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ToastProvider>
  );
}