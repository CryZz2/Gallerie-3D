// src/App.jsx
import { useEffect, useState } from "react";
import ThreeScene from "./components/ThreeScene";
import { fetchPopular, searchMovies, fetchDetails } from "./api/tmdb";
import "./styles.css";

export default function App() {
  const [movies, setMovies] = useState([]);
  const [selected, setSelected] = useState(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    (async () => {
      const list = await fetchPopular(); // films populaires
      setMovies(list);
    })();
  }, []);

  const onSearch = async (e) => {
    e.preventDefault();
    const list = query ? await searchMovies(query) : await fetchPopular();
    setMovies(list);
    setSelected(null);
  };

  const onClickPoster = async (film) => {
    const details = await fetchDetails(film.id);
    setSelected(details);
  };

  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: 16, minHeight: "100vh" }}>
      <h1 style={{
        textAlign: "center",
        color: "var(--text)",
        letterSpacing: 1,
        marginBottom: 24,
        textShadow: "0 2px 8px #0006"
      }}>
        Explorateur des films populaires
      </h1>

      <form onSubmit={onSearch} className="form-search">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un film TMDb…"
        />
        <button type="submit" className="btn-accent">
          Rechercher
        </button>
      </form>

      <ThreeScene movies={movies} onClickPoster={onClickPoster} />

      {selected && (
        <div className="details">
          <h2>
            {selected.title}
            <span>({(selected.release_date || "").slice(0, 4)})</span>
          </h2>
          <p>{selected.overview}</p>
          <div className="meta">
            Note TMDb : <b>{selected.vote_average}</b> • Durée : {selected.runtime} min
          </div>
        </div>
      )}
    </div>
  )
}
