// ===== Caso de uso 6 · Favoritos =====
async function cargarFavoritos() {
    const contenedor = document.getElementById("grid_favoritos");
    const vacio = document.getElementById("favoritos_vacio");
    let juegos;
    try {
        juegos = await api("/api/favoritos");
    } catch (err) {
        if (err.status === 401) return requiereSesion("#favoritos");
        avisar(err.message, "error");
        return;
    }
    favoritos = new Set(juegos.map((j) => String(j.id)));
    actualizarContadorFavoritos();

    contenedor.replaceChildren(...juegos.map((juego) => {
        const id = String(juego.id);
        // Ir a comprar desde favoritos
        let comprar;
        if (biblioteca.has(id)) comprar = el("a", { href: "#biblioteca", className: "btn btn--secundario", textContent: "En tu biblioteca" });
        else if (juego.precioFinal === 0) comprar = el("button", { type: "button", className: "btn btn--primary", textContent: "Obtener gratis", onclick: () => obtenerGratis(id, juego.titulo) });
        else comprar = el("a", { href: `#comprar/${id}`, className: "btn btn--primary", textContent: "Comprar" });
        const quitar = el("button", { type: "button", className: "btn btn--secundario", textContent: "Quitar", onclick: () => alternarFavorito(id) });
        return crearTarjeta(juego, { mostrarFinOferta: true, acciones: [comprar, quitar] });
    }));
    vacio.hidden = juegos.length > 0;
    document.getElementById("fav_total").textContent = `${juegos.length} juego${juegos.length === 1 ? "" : "s"}`;
}

// Si se quita un favorito estando en la lista, se vuelve a pintar
document.addEventListener("favoritos-cambiados", () => {
    if (location.hash === "#favoritos") cargarFavoritos();
});
