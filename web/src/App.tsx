import { Link, Route, Routes } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import GamesList from "./pages/GamesList";
import GameReview from "./pages/GameReview";
import Coach from "./pages/Coach";
import Profile from "./pages/Profile";
import Progression from "./pages/Progression";
import Practice from "./pages/Practice";
import Settings from "./pages/Settings";

export default function App() {
  return (
    <div className="app">
      <nav className="nav">
        <Link to="/" className="brand">
          ♟ Coach d'échecs
        </Link>
        <div className="nav-links">
          <Link to="/">Tableau de bord</Link>
          <Link to="/games">Parties</Link>
          <Link to="/profile">Profil</Link>
          <Link to="/progression">Progression</Link>
          <Link to="/practice">Entraînement</Link>
          <Link to="/coach">Coach</Link>
          <Link to="/settings" className="nav-settings" title="Paramètres">
            ⚙
          </Link>
        </div>
      </nav>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/games" element={<GamesList />} />
          <Route path="/games/:id" element={<GameReview />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/progression" element={<Progression />} />
          <Route path="/practice" element={<Practice />} />
          <Route path="/coach" element={<Coach />} />
          <Route path="/coach/:thread" element={<Coach />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
    </div>
  );
}
