import { Link, Route, Routes } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import GamesList from "./pages/GamesList";
import GameReview from "./pages/GameReview";

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
        </div>
      </nav>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/games" element={<GamesList />} />
          <Route path="/games/:id" element={<GameReview />} />
        </Routes>
      </main>
    </div>
  );
}
