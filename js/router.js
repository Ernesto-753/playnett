// ===== Navegación entre pantallas =====
// Cada pantalla de los diagramas de casos de uso es una "vista" de index.html.
// La dirección después del # dice cuál se muestra: #catalogo, #ofertas, #juego/ID, #comprar/ID...

const RUTAS = {
    catalogo: { titulo: "Catálogo", cargar: () => cargarCatalogo() },
    ofertas: { titulo: "Ofertas", cargar: () => cargarOfertas() },
    juego: { titulo: "Detalle", cargar: (id) => cargarDetalle(id) },
    favoritos: { titulo: "Favoritos", sesion: true, cargar: () => cargarFavoritos() },
    comprar: { titulo: "Comprar", sesion: true, cargar: (id) => cargarCompra(id) },
    biblioteca: { titulo: "Biblioteca", sesion: true, cargar: () => cargarBiblioteca() },
    perfil: { titulo: "Mi perfil", sesion: true, cargar: () => cargarPerfil() },
};

let vistaActual = null;

function enrutar() {
    const [nombre = "catalogo", parametro] = location.hash.slice(1).split("/");
    const ruta = RUTAS[nombre] ? nombre : "catalogo";

    // Verificar sesión iniciada -> redirigir a Iniciar sesión
    if (RUTAS[ruta].sesion && !requiereSesion(location.hash)) return;

    document.querySelectorAll(".vista").forEach((v) => (v.hidden = v.dataset.vista !== ruta));
    document.querySelectorAll(".nav__link, .favoritos").forEach((a) => {
        a.classList.toggle("nav__link--active", a.classList.contains("nav__link") && a.dataset.ruta === ruta);
    });
    document.title = `${RUTAS[ruta].titulo} · Playnett`;
    if (vistaActual !== location.hash) window.scrollTo(0, 0);
    vistaActual = location.hash;
    RUTAS[ruta].cargar(parametro);
}

window.addEventListener("hashchange", enrutar);
