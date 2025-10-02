const TMDB_KEY = import.meta?.env?.VITE_TMDB_KEY || process.env.REACT_APP_TMDB_KEY;
const TMDB_BASE = "https://api.themoviedb.org/3";
const IMG_BASE = "https://image.tmdb.org/t/p/"; // tailles: w185, w342, w500, original

export const imgUrl = (path, size = "w500") =>
    path ? `${IMG_BASE}${size}${path}` : null;

// Films populaires
export async function fetchPopular(page = 1) {
    const url = `${TMDB_BASE}/movie/popular?api_key=${TMDB_KEY}&language=fr-FR&page=${page}`;
    const res = await fetch(url);
    const data = await res.json();
    return (data.results || []).map(m => ({
        id: m.id,
        title: m.title,
        year: (m.release_date || "").slice(0, 4),
        poster: imgUrl(m.poster_path, "w500"),
    }));
}

// Recherche
export async function searchMovies(query, page = 1) {
    const url = `${TMDB_BASE}/search/movie?api_key=${TMDB_KEY}&language=fr-FR&query=${encodeURIComponent(query)}&page=${page}&include_adult=false`;
    const res = await fetch(url);
    const data = await res.json();
    return (data.results || []).map(m => ({
        id: m.id,
        title: m.title,
        year: (m.release_date || "").slice(0, 4),
        poster: imgUrl(m.poster_path, "w500"),
    }));
}

// Détails
export async function fetchDetails(id) {
    const url = `${TMDB_BASE}/movie/${id}?api_key=${TMDB_KEY}&language=fr-FR`;
    const res = await fetch(url);
    return await res.json();
}

