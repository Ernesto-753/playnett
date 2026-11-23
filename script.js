// ===== Estado de la página =====
let usuarioActual = null;          // usuario con sesión (viene de MongoDB) o null
let favoritos = new Set();         // ids de los juegos favoritos del usuario
let biblioteca = new Set();        // ids de los juegos que el usuario ya tiene
const filtros = { q: "", categoria: "", precio: "", oferta: false, orden: "populares", pagina: 1 };
const POR_PAGINA = 6;

const formatoPrecio = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });
const formatoFecha = new Intl.DateTimeFormat("es-MX", { day: "numeric", month: "long", year: "numeric" });

const ICONO_CORAZON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 21.23l8.84-8.84a5.5 5.5 0 0 0 0-7.78z"/></svg>';

async function api(ruta, opciones = {}) {
    const respuesta = await fetch(ruta, {
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        ...opciones,
    });
    const datos = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) throw Object.assign(new Error(datos.error || "Error"), { status: respuesta.status, datos });
    return datos;
}

// Crea un elemento: el("p", { className: "x", textContent: "hola" }, hijo1, hijo2)
function el(etiqueta, propiedades = {}, ...hijos) {
    const nodo = document.createElement(etiqueta);
    for (const [clave, valor] of Object.entries(propiedades)) {
        if (clave === "dataset") Object.assign(nodo.dataset, valor);
        else if (clave.startsWith("on")) nodo.addEventListener(clave.slice(2), valor);
        else if (clave in nodo) nodo[clave] = valor;
        else nodo.setAttribute(clave, valor);
    }
    nodo.append(...hijos.filter((h) => h !== null && h !== undefined && h !== false));
    return nodo;
}

function textoPrecio(juego) {
    return juego.precioFinal === 0 ? "Gratis" : formatoPrecio.format(juego.precioFinal);
}

// ===== Avisos (toasts) =====
function avisar(mensaje, tipo = "info", { enlace, textoEnlace, duracion = 5000 } = {}) {
    const aviso = el("div", { className: `aviso aviso--${tipo}`, role: tipo === "error" ? "alert" : "status" },
        el("span", { textContent: mensaje }),
        enlace ? el("a", { href: enlace, className: "aviso__enlace", textContent: textoEnlace || "Ver" }) : null,
        el("button", { className: "aviso__cerrar", type: "button", "aria-label": "Cerrar aviso", textContent: "×", onclick: () => aviso.remove() })
    );
    document.getElementById("avisos").append(aviso);
    setTimeout(() => aviso.remove(), duracion);
}

// Verificar sesión iniciada: si no hay, se manda a iniciar sesión y se regresa después
function requiereSesion(volverA = location.hash || "#catalogo") {
    if (usuarioActual) return true;
    location.href = `components/iniciarSesion.html?volver=${encodeURIComponent(volverA)}`;
    return false;
}


// Practica 1 y 5 - Mostrar el usuario después de iniciar sesión
// (ahora la sesión la guarda el servidor en una cookie, ya no va en la URL)
const initSesion = document.getElementById("init_sesion");
const usuario = document.getElementById("usuario");
const nombreUsuario = document.getElementById("nombre_usuario");
const avatarHeader = document.getElementById("avatar_header");
const ICONO_USUARIO = avatarHeader.innerHTML;

function mostrarSesion() {
    if (usuarioActual) {
        initSesion.style.display = "none";
        usuario.style.display = "block";
        nombreUsuario.innerText = usuarioActual.apodo;
        if (usuarioActual.avatar) {
            avatarHeader.replaceChildren(el("img", { src: usuarioActual.avatar, alt: "" }));
        } else {
            avatarHeader.innerHTML = ICONO_USUARIO;
        }
    } else {
        usuario.style.display = "none";
        initSesion.style.display = "";
    }
}

function guardarUsuario(datos) {
    usuarioActual = datos;
    favoritos = new Set((datos?.favoritos ?? []).map(String));
    biblioteca = new Set((datos?.biblioteca ?? []).map(String));
    mostrarSesion();
    actualizarContadorFavoritos();
}

// Practica 2 y 7 - Cambiar color del tema (y recordarlo en este dispositivo)
const btnTema = document.getElementById("btn_tema");

function aplicarTema(claro) {
    if (claro) {
        document.body.classList.add("claro");
        btnTema.setAttribute("aria-label", "Cambiar a modo oscuro");
    } else {
        document.body.classList.remove("claro");
        btnTema.setAttribute("aria-label", "Cambiar a modo claro");
    }
    localStorage.setItem("playnett_tema", claro ? "claro" : "oscuro");
    document.dispatchEvent(new CustomEvent("tema-cambiado"));
}

btnTema.addEventListener("click", function(){
    if(document.body.classList.contains("claro")){
        aplicarTema(false);
    } else {
        aplicarTema(true);
    }
});
aplicarTema(localStorage.getItem("playnett_tema") === "claro");


// Practica 3 - Ocultar / mostrar el menú del usuario
const boton = document.getElementById("btnOcultar");
const texto = document.getElementById("texto");

boton.addEventListener("click", function(){
    if(texto.style.display === "none"){
        texto.style.display = "block";
    }else{
        texto.style.display = "none";
    }
});
// El menú se cierra al elegir una opción o al hacer clic fuera
texto.addEventListener("click", (e) => { if (e.target.closest("a")) texto.style.display = "none"; });
document.addEventListener("click", (e) => { if (!usuario.contains(e.target)) texto.style.display = "none"; });

// Cerrar sesión
async function cerrarSesion() {
    await api("/api/auth/logout", { method: "POST" });
    guardarUsuario(null);
    texto.style.display = "none";
    avisar("Cerraste sesión");
    if (location.hash === "#catalogo" || location.hash === "") enrutar();
    else location.hash = "#catalogo";
}
document.getElementById("cerrar_sesion").addEventListener("click", cerrarSesion);


// Practica 4 - Contador de favoritos (guardados en MongoDB)
const favCount = document.getElementById("fav_count");
const loveFav = document.getElementById("love-fav");

function actualizarContadorFavoritos() {
    const n = favoritos.size;
    favCount.textContent = n;
    if(n > 0){
        loveFav.classList.add("activo");
    } else {
        loveFav.classList.remove("activo");
    }
}

// Agrega o quita un favorito y actualiza todos los corazones de ese juego en la página
async function alternarFavorito(idJuego) {
    if (!requiereSesion()) return;
    const yaEsFavorito = favoritos.has(idJuego);
    try {
        const datos = await api(`/api/favoritos/${idJuego}`, { method: yaEsFavorito ? "DELETE" : "POST" });
        favoritos = new Set(datos.favoritos.map(String));
        document.querySelectorAll(`[data-fav="${idJuego}"]`).forEach((b) => {
            b.classList.toggle("select", favoritos.has(idJuego));
            b.setAttribute("aria-pressed", favoritos.has(idJuego));
        });
        actualizarContadorFavoritos();
        avisar(yaEsFavorito ? "Se quitó de favoritos" : "Se agregó a favoritos", "exito", yaEsFavorito ? {} : { enlace: "#favoritos", textoEnlace: "Ver favoritos" });
        document.dispatchEvent(new CustomEvent("favoritos-cambiados", { detail: { idJuego } }));
    } catch (err) {
        avisar(err.message, "error");
    }
}

function botonFavorito(idJuego, clase = "card__fav") {
    const btn = el("button", {
        className: clase,
        type: "button",
        "aria-label": "Agregar a favoritos",
        "aria-pressed": favoritos.has(idJuego),
        dataset: { fav: idJuego },
        onclick: (e) => { e.preventDefault(); alternarFavorito(idJuego); },
    });
    btn.innerHTML = ICONO_CORAZON;
    if (favoritos.has(idJuego)) btn.classList.add("select");
    return btn;
}


// ===== Tarjetas de videojuegos (catálogo, ofertas y favoritos) =====
function crearTarjeta(juego, { mostrarFinOferta = false, acciones = null } = {}) {
    const id = String(juego.id ?? juego._id);
    const card = el("article", { className: "card" });

    const img = el("img", { src: juego.portada, alt: juego.titulo, loading: "lazy" });
    if (juego.portadaAlterna) {
        img.dataset.portada = juego.portada;
        img.dataset.alterna = juego.portadaAlterna;
    }
    const media = el("a", { className: "card__media", href: `#juego/${id}`, "aria-label": `Ver ${juego.titulo}` }, img);
    if (juego.enOferta) media.append(el("span", { className: "badge", textContent: `−${juego.descuento} %` }));
    if (biblioteca.has(id)) media.append(el("span", { className: "badge badge--biblioteca", textContent: "En tu biblioteca" }));

    const precio = el("p", { className: "price", textContent: textoPrecio(juego) + " " });
    if (juego.enOferta && juego.precioFinal > 0) {
        precio.append(el("s", { className: "price__old", textContent: formatoPrecio.format(juego.precio) }));
    }

    const body = el("div", { className: "card__body" },
        el("div", { className: "card__meta" },
            el("span", { className: "card__genre", textContent: juego.categoria }),
            el("span", { className: "card__platforms", textContent: juego.plataformas.join(" · ") })
        ),
        el("h3", { className: "card__title" }, el("a", { href: `#juego/${id}`, textContent: juego.titulo })),
        mostrarFinOferta && juego.ofertaFin
            ? el("p", { className: "card__fin", textContent: `Termina el ${formatoFecha.format(new Date(juego.ofertaFin))}` })
            : null,
        el("div", { className: "card__footer" },
            precio,
            el("a", { href: `#juego/${id}`, className: "card__link", innerHTML: 'Ver juego <span aria-hidden="true">↗</span>' })
        ),
        acciones ? el("div", { className: "card__acciones" }, ...acciones) : null
    );

    card.append(el("div", { className: "card__media-wrap" }, media, botonFavorito(id)), body);
    return card;
}


// ===== Catálogo desde MongoDB (caso de uso 3) =====
const grid = document.getElementById("grid");
const sinResultados = document.getElementById("sin_resultados");

function crearBotonPagina(contenido, pagina, { activa = false, deshabilitada = false, etiqueta } = {}) {
    const a = document.createElement("a");
    a.href = "#catalogo";
    a.className = typeof contenido === "number" ? "pagination__page" : "pagination__arrow";
    if (activa) {
        a.classList.add("pagination__page--active");
        a.setAttribute("aria-current", "page");
    }
    if (etiqueta) a.setAttribute("aria-label", etiqueta);
    if (typeof contenido === "number") a.textContent = contenido;
    else a.innerHTML = contenido;
    if (deshabilitada) {
        a.setAttribute("aria-disabled", "true");
        a.style.opacity = "0.4";
    }
    a.addEventListener("click", (e) => {
        e.preventDefault();
        if (deshabilitada || activa) return;
        filtros.pagina = pagina;
        cargarCatalogo();
    });
    return a;
}

function pintarPaginacion({ pagina, paginas, total }, cantidad) {
    const desde = total === 0 ? 0 : (pagina - 1) * POR_PAGINA + 1;
    document.getElementById("mostrando").textContent =
        `Mostrando ${desde}–${desde + cantidad - (total === 0 ? 0 : 1)} de ${total} juegos`;

    const nav = document.getElementById("paginacion");
    nav.replaceChildren();
    nav.append(crearBotonPagina('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>',
        pagina - 1, { deshabilitada: pagina <= 1, etiqueta: "Página anterior" }));
    for (let i = 1; i <= paginas; i++) {
        nav.append(crearBotonPagina(i, i, { activa: i === pagina }));
    }
    nav.append(crearBotonPagina('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>',
        pagina + 1, { deshabilitada: pagina >= paginas, etiqueta: "Página siguiente" }));
}

async function cargarCatalogo() {
    const params = new URLSearchParams({ orden: filtros.orden, pagina: filtros.pagina, limite: POR_PAGINA });
    if (filtros.q) params.set("q", filtros.q);
    if (filtros.categoria) params.set("categoria", filtros.categoria);
    if (filtros.precio) params.set("precio", filtros.precio);
    if (filtros.oferta) params.set("oferta", "1");

    try {
        const datos = await api(`/api/videojuegos?${params}`);
        grid.replaceChildren(...datos.juegos.map((j) => crearTarjeta(j)));
        // Mostrar mensaje «Sin resultados»
        sinResultados.hidden = datos.juegos.length > 0;
        sinResultados.textContent = filtros.q ? `Sin resultados para «${filtros.q}»` : "Sin resultados";
        document.getElementById("total_resultados").textContent =
            `${datos.total} resultado${datos.total === 1 ? "" : "s"}`;
        document.getElementById("titulo_catalogo").textContent =
            filtros.q ? `Resultados para «${filtros.q}»` : filtros.categoria || "Todos los juegos";
        pintarPaginacion(datos, datos.juegos.length);
    } catch (err) {
        grid.replaceChildren();
        sinResultados.hidden = false;
        sinResultados.textContent = "No se pudo cargar el catálogo. ¿Está corriendo el servidor?";
    }
}

async function cargarCategorias() {
    try {
        const { total, categorias } = await api("/api/videojuegos/categorias");
        const conteo = Object.fromEntries(categorias.map((c) => [c.nombre, c.total]));
        document.querySelectorAll(".category").forEach((enlace) => {
            const nombre = enlace.dataset.categoria;
            enlace.querySelector(".category__count").textContent = nombre ? conteo[nombre] ?? 0 : total;
        });
    } catch {
        // si falla, los conteos se quedan vacíos
    }
}

// ===== Filtros y orden =====
document.querySelectorAll(".category").forEach((enlace) => {
    enlace.addEventListener("click", (e) => {
        e.preventDefault();
        document.querySelector(".category--active")?.classList.remove("category--active");
        enlace.classList.add("category--active");
        filtros.categoria = enlace.dataset.categoria;
        filtros.pagina = 1;
        cargarCatalogo();
    });
});

document.querySelectorAll('input[name="precio"]').forEach((radio) => {
    radio.addEventListener("change", () => {
        filtros.precio = radio.value;
        filtros.pagina = 1;
        cargarCatalogo();
    });
});

document.getElementById("solo_ofertas").addEventListener("change", (e) => {
    filtros.oferta = e.target.checked;
    filtros.pagina = 1;
    cargarCatalogo();
});

document.getElementById("ordenar").addEventListener("change", (e) => {
    filtros.orden = e.target.value;
    filtros.pagina = 1;
    cargarCatalogo();
});


// ===== Buscar videojuego (caso de uso 4) =====
const buscador = document.getElementById("buscar");
const cajaSugerencias = document.getElementById("sugerencias");
const CLAVE_HISTORIAL = "playnett_historial";
let esperaBusqueda;
let esperaSugerencias;

const historial = {
    leer: () => JSON.parse(localStorage.getItem(CLAVE_HISTORIAL) || "[]"),
    guardar(termino) {
        termino = termino.trim();
        if (termino.length < 2) return;
        const lista = this.leer().filter((t) => t.toLowerCase() !== termino.toLowerCase());
        localStorage.setItem(CLAVE_HISTORIAL, JSON.stringify([termino, ...lista].slice(0, 10)));
    },
    borrar: () => localStorage.removeItem(CLAVE_HISTORIAL),
};

const normalizar = (t) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

// Distancia de Levenshtein: cuántas letras hay que cambiar para pasar de un texto a otro
function distancia(a, b) {
    const fila = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
        let anterior = fila[0];
        fila[0] = i;
        for (let j = 1; j <= b.length; j++) {
            const temp = fila[j];
            fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, anterior + (a[i - 1] === b[j - 1] ? 0 : 1));
            anterior = temp;
        }
    }
    return fila[b.length];
}

// Buscar el nombre en el historial y, si no está, nombres parecidos (errores de dedo)
function buscarEnHistorial(termino) {
    const q = normalizar(termino.trim());
    const lista = historial.leer();
    if (!q) return { coinciden: lista.slice(0, 6), parecidos: [] };
    const coinciden = lista.filter((t) => normalizar(t).includes(q));
    const parecidos = lista.filter((t) => {
        if (coinciden.includes(t)) return false;
        const n = normalizar(t);
        const tolerancia = q.length <= 4 ? 1 : 2;
        return distancia(q, n.slice(0, q.length)) <= tolerancia || distancia(q, n) <= tolerancia;
    });
    return { coinciden, parecidos };
}

function cerrarSugerencias() {
    cajaSugerencias.hidden = true;
    buscador.setAttribute("aria-expanded", "false");
}

function ejecutarBusqueda(termino, { guardar = false } = {}) {
    filtros.q = termino.trim();
    filtros.pagina = 1;
    if (guardar) historial.guardar(filtros.q);
    if (!location.hash.startsWith("#catalogo") && location.hash !== "") location.hash = "#catalogo";
    cargarCatalogo();
}

async function mostrarSugerencias() {
    const termino = buscador.value;
    const { coinciden, parecidos } = buscarEnHistorial(termino);
    let juegos = [];
    if (termino.trim()) {
        try {
            juegos = (await api(`/api/videojuegos?q=${encodeURIComponent(termino.trim())}&limite=5`)).juegos;
        } catch { /* sin sugerencias del catálogo */ }
    }
    if (buscador.value !== termino) return; // el usuario siguió escribiendo

    const grupos = [];
    const opcionHistorial = (t, icono) => el("button", {
        type: "button", className: "sugerencia", role: "option",
        onclick: () => { buscador.value = t; ejecutarBusqueda(t, { guardar: true }); cerrarSugerencias(); },
    }, el("span", { className: "sugerencia__icono", textContent: icono, "aria-hidden": "true" }), el("span", { textContent: t }));

    if (coinciden.length) {
        grupos.push(el("p", { className: "sugerencias__titulo", textContent: "Búsquedas recientes" }), ...coinciden.map((t) => opcionHistorial(t, "↺")));
    }
    if (parecidos.length) {
        grupos.push(el("p", { className: "sugerencias__titulo", textContent: "¿Quisiste decir?" }), ...parecidos.map((t) => opcionHistorial(t, "≈")));
    }
    if (juegos.length) {
        grupos.push(el("p", { className: "sugerencias__titulo", textContent: "Juegos" }), ...juegos.map((j) => el("a", {
            href: `#juego/${j.id}`, className: "sugerencia", role: "option",
            onclick: () => { historial.guardar(j.titulo); cerrarSugerencias(); },
        }, el("img", { src: j.portada, alt: "", className: "sugerencia__img" }), el("span", { textContent: j.titulo }),
            el("span", { className: "sugerencia__precio", textContent: textoPrecio(j) }))));
    } else if (termino.trim()) {
        grupos.push(el("p", { className: "sugerencias__vacio", textContent: "Sin resultados" }));
    }
    if (historial.leer().length) {
        grupos.push(el("button", {
            type: "button", className: "sugerencias__borrar", textContent: "Borrar historial de búsqueda",
            onclick: () => { historial.borrar(); avisar("Historial de búsqueda borrado"); mostrarSugerencias(); },
        }));
    }

    cajaSugerencias.replaceChildren(...grupos);
    cajaSugerencias.hidden = grupos.length === 0;
    buscador.setAttribute("aria-expanded", String(!cajaSugerencias.hidden));
}

buscador.form.addEventListener("submit", (e) => {
    e.preventDefault();
    clearTimeout(esperaBusqueda);
    ejecutarBusqueda(buscador.value, { guardar: true });
    cerrarSugerencias();
});
buscador.addEventListener("input", () => {
    clearTimeout(esperaBusqueda);
    clearTimeout(esperaSugerencias);
    esperaSugerencias = setTimeout(mostrarSugerencias, 150);
    esperaBusqueda = setTimeout(() => ejecutarBusqueda(buscador.value), 300);
});
buscador.addEventListener("focus", mostrarSugerencias);
buscador.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrarSugerencias(); });
document.addEventListener("click", (e) => { if (!buscador.form.contains(e.target)) cerrarSugerencias(); });


// Practica 6 - Cambiar la imagen automáticamente (juegos con portada alterna, como Minecraft)
let mostrarPrimera = true;

setInterval(function () {
    mostrarPrimera = !mostrarPrimera;
    document.querySelectorAll("img[data-alterna]").forEach((imagen) => {
        imagen.src = mostrarPrimera ? imagen.dataset.portada : imagen.dataset.alterna;
    });
}, 3000);


// ===== Avisar cuando un favorito entre en oferta (caso de uso 6) =====
async function revisarAvisosDeOfertas() {
    if (!usuarioActual) return;
    try {
        const avisos = await api("/api/favoritos/avisos");
        for (const a of avisos) {
            avisar(`¡${a.titulo} de tus favoritos entró en oferta! −${a.descuento} %`, "oferta", {
                enlace: `#juego/${a.id}`, textoEnlace: "Ver oferta", duracion: 10000,
            });
        }
    } catch { /* no es crítico */ }
}


// ===== Inicio =====
async function iniciar() {
    try {
        guardarUsuario(await api("/api/auth/yo"));
    } catch {
        guardarUsuario(null);
    }
    enrutar(); // definido en js/router.js
    cargarCategorias();
    revisarAvisosDeOfertas();
}

// Se espera a que carguen todos los scripts (js/router.js define enrutar)
document.addEventListener("DOMContentLoaded", iniciar);
