import { useState } from "react";
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
  const [menuOpen, setMenuOpen] = useState(false);
  const close = () => setMenuOpen(false);
  return (
    <div className="app">
      <nav className="nav">
        <Link to="/" className="brand" onClick={close}>
          ♟ Coach d'échecs
        </Link>
        <button
          className={`nav-toggle${menuOpen ? " open" : ""}`}
          aria-label="Menu"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          {menuOpen ? "✕" : "☰"}
        </button>
        <div className={`nav-links${menuOpen ? " open" : ""}`}>
          <Link to="/" onClick={close}>Tableau de bord</Link>
          <Link to="/games" onClick={close}>Parties</Link>
          <Link to="/profile" onClick={close}>Profil</Link>
          <Link to="/progression" onClick={close}>Progression</Link>
          <Link to="/practice" onClick={close}>Entraînement</Link>
          <Link to="/coach" onClick={close}>Coach</Link>
          <Link to="/settings" className="nav-settings" title="Paramètres" onClick={close}>
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
