// ===== Casos de uso 9 y 10 · Biblioteca: instalar y desinstalar videojuegos =====
// Una página web no puede instalar programas, así que la descarga se SIMULA en el navegador.
// El servidor sí guarda qué juegos están instalados, en qué unidad, y valida el espacio.

const modal = document.getElementById("modal");
const descargas = new Map(); // id -> { progreso, pausado, fase, ubicacion, tamanoGB, titulo, timer }
let datosBiblioteca = { juegos: [], unidades: [] };

function abrirModal(...contenido) {
    modal.replaceChildren(...contenido);
    modal.showModal();
}
function cerrarModal() {
    modal.close();
}
modal.addEventListener("click", (e) => { if (e.target === modal) cerrarModal(); });

async function cargarBiblioteca() {
    try {
        datosBiblioteca = await api("/api/biblioteca");
    } catch (err) {
        if (err.status === 401) return requiereSesion("#biblioteca");
        avisar(err.message, "error");
        return;
    }
    biblioteca = new Set(datosBiblioteca.juegos.map((j) => String(j.id)));
    pintarBiblioteca();
}

function pintarUnidades() {
    document.getElementById("unidades").replaceChildren(...datosBiblioteca.unidades.map((u) => {
        const pct = Math.round((u.usadoGB / u.capacidadGB) * 100);
        return el("div", { className: "unidad" },
            el("div", { className: "unidad__cabecera" }, el("strong", { textContent: u.nombre }), el("span", { textContent: `${u.libreGB} GB libres de ${u.capacidadGB} GB` })),
            el("div", { className: "barra", role: "progressbar", "aria-valuenow": pct, "aria-valuemin": 0, "aria-valuemax": 100, "aria-label": `Espacio usado en ${u.nombre}` },
                el("div", { className: `barra__relleno${pct > 90 ? " barra__relleno--lleno" : ""}`, style: `width:${pct}%` })));
    }));
}

function nombreUnidad(id) {
    return datosBiblioteca.unidades.find((u) => u.id === id)?.nombre ?? id;
}

function pintarBiblioteca() {
    const { juegos } = datosBiblioteca;
    pintarUnidades();
    document.getElementById("biblioteca_vacia").hidden = juegos.length > 0;
    document.getElementById("biblioteca_total").textContent =
        `${juegos.length} juego${juegos.length === 1 ? "" : "s"} · ${juegos.filter((j) => j.instalado).length} instalado${juegos.filter((j) => j.instalado).length === 1 ? "" : "s"}`;
    document.getElementById("lista_biblioteca").replaceChildren(...juegos.map(filaJuego));
}

function filaJuego(juego) {
    const id = String(juego.id);
    const descarga = descargas.get(id);
    let estado;
    let acciones;

    if (descarga) {
        // Mostrar progreso de descarga + pausar / reanudar
        const pct = Math.floor(descarga.progreso);
        const texto = descarga.fase === "verificando"
            ? "Verificando integridad de los archivos…"
            : descarga.pausado
                ? `En pausa · ${pct} %`
                : `Descargando · ${pct} % · ${(descarga.tamanoGB * descarga.progreso / 100).toFixed(1)} de ${descarga.tamanoGB} GB`;
        estado = el("div", { className: "biblioteca__progreso" },
            el("span", { className: "biblioteca__estado", textContent: texto, id: `estado_${id}` }),
            el("div", { className: "barra", role: "progressbar", "aria-valuenow": pct, "aria-valuemin": 0, "aria-valuemax": 100, "aria-label": `Descarga de ${juego.titulo}` },
                el("div", { className: `barra__relleno${descarga.fase === "verificando" ? " barra__relleno--verificando" : ""}`, id: `barra_${id}`, style: `width:${pct}%` })));
        acciones = descarga.fase === "verificando" ? [] : [
            el("button", { type: "button", className: "btn btn--secundario", textContent: descarga.pausado ? "Reanudar" : "Pausar", onclick: () => alternarPausa(id) }),
            el("button", { type: "button", className: "btn btn--secundario", textContent: "Cancelar", onclick: () => cancelarDescarga(id) }),
        ];
    } else if (juego.instalado) {
        estado = el("span", { className: "biblioteca__estado biblioteca__estado--ok", textContent: `Instalado en ${nombreUnidad(juego.ubicacion)} · ${juego.tamanoGB} GB` });
        acciones = [
            el("button", { type: "button", className: "btn btn--primary", textContent: "Jugar", onclick: () => avisar(`Iniciando ${juego.titulo}…`) }),
            el("button", { type: "button", className: "btn btn--secundario", textContent: "Desinstalar", onclick: () => pedirDesinstalacion(juego) }),
        ];
    } else {
        estado = el("span", { className: "biblioteca__estado", textContent: `No instalado · ${juego.tamanoGB} GB` });
        acciones = [el("button", { type: "button", className: "btn btn--primary", textContent: "Instalar", onclick: () => pedirInstalacion(juego) })];
    }

    return el("article", { className: "biblioteca__juego", id: `juego_${id}` },
        el("a", { href: `#juego/${id}` }, el("img", { src: juego.portada, alt: "", className: "biblioteca__portada" })),
        el("div", { className: "biblioteca__info" },
            el("a", { href: `#juego/${id}`, className: "biblioteca__titulo", textContent: juego.titulo }),
            el("p", { className: "texto-tenue", textContent: `${juego.origen === "gratis" ? "Obtenido gratis" : "Comprado"} el ${formatoFecha.format(new Date(juego.adquirido))}${juego.partidasEnNube ? " · ☁ Partidas en la nube" : ""}` }),
            estado),
        el("div", { className: "biblioteca__acciones" }, ...acciones));
}

function repintarJuego(id) {
    const juego = datosBiblioteca.juegos.find((j) => String(j.id) === id);
    const actual = document.getElementById(`juego_${id}`);
    if (juego && actual) actual.replaceWith(filaJuego(juego));
}

// ---------- Instalar: seleccionar ubicación y verificar espacio ----------
function pedirInstalacion(juego) {
    const id = String(juego.id);
    const error = el("p", { className: "campo__mensaje campo__mensaje--error", role: "alert" });
    const mejor = datosBiblioteca.unidades.find((u) => u.libreGB >= juego.tamanoGB) ?? datosBiblioteca.unidades[0];
    const opciones = datosBiblioteca.unidades.map((u) => el("label", { className: "metodo" },
        el("input", { type: "radio", name: "ubicacion", value: u.id, checked: u.id === mejor.id }),
        el("span", {}, el("strong", { textContent: u.nombre }), el("br"),
            el("small", { className: "texto-tenue", textContent: `${u.ruta} · ${u.libreGB} GB libres` }))));

    const form = el("form", { method: "dialog", className: "modal__contenido", onsubmit: async (e) => {
        e.preventDefault();
        const ubicacion = new FormData(form).get("ubicacion");
        try {
            await api(`/api/biblioteca/${id}/verificar-espacio`, { method: "POST", body: JSON.stringify({ ubicacion }) });
            cerrarModal();
            iniciarDescarga(juego, ubicacion);
        } catch (err) {
            // Mostrar error: espacio insuficiente
            error.textContent = err.message;
        }
    } },
        el("h2", { className: "modal__titulo", textContent: `Instalar ${juego.titulo}` }),
        el("p", { className: "texto-tenue", textContent: `Espacio necesario: ${juego.tamanoGB} GB. Elige dónde instalarlo:` }),
        el("div", { className: "metodos metodos--columna" }, ...opciones),
        error,
        el("div", { className: "modal__botones" },
            el("button", { type: "button", className: "btn btn--secundario", textContent: "Cancelar", onclick: cerrarModal }),
            el("button", { type: "submit", className: "btn btn--primary", textContent: "Instalar" })));
    abrirModal(form);
}

// ---------- Descargar archivos (simulado) ----------
function iniciarDescarga(juego, ubicacion) {
    const id = String(juego.id);
    if ("Notification" in window && Notification.permission === "default") Notification.requestPermission();
    const duracionSeg = Math.min(14, Math.max(5, juego.tamanoGB / 8)); // lo que tarda la demo
    const descarga = { progreso: 0, pausado: false, fase: "descargando", ubicacion, tamanoGB: juego.tamanoGB, titulo: juego.titulo };
    descargas.set(id, descarga);
    descarga.timer = setInterval(() => {
        if (descarga.pausado) return;
        descarga.progreso = Math.min(100, descarga.progreso + 100 / (duracionSeg * 5) * (0.6 + Math.random() * 0.8));
        actualizarProgreso(id);
        if (descarga.progreso >= 100) {
            clearInterval(descarga.timer);
            verificarIntegridad(id);
        }
    }, 200);
    repintarJuego(id);
}

function actualizarProgreso(id) {
    const d = descargas.get(id);
    const barra = document.getElementById(`barra_${id}`);
    const estado = document.getElementById(`estado_${id}`);
    if (!barra || !estado) return;
    const pct = Math.floor(d.progreso);
    barra.style.width = `${pct}%`;
    barra.parentElement.setAttribute("aria-valuenow", pct);
    estado.textContent = `Descargando · ${pct} % · ${(d.tamanoGB * d.progreso / 100).toFixed(1)} de ${d.tamanoGB} GB`;
}

function alternarPausa(id) {
    const d = descargas.get(id);
    d.pausado = !d.pausado;
    repintarJuego(id);
}

function cancelarDescarga(id) {
    clearInterval(descargas.get(id).timer);
    descargas.delete(id);
    avisar("Descarga cancelada");
    repintarJuego(id);
}

// ---------- Verificar integridad y notificar instalación completada ----------
async function verificarIntegridad(id) {
    const d = descargas.get(id);
    d.fase = "verificando";
    repintarJuego(id);
    await new Promise((ok) => setTimeout(ok, 1500));
    try {
        const datos = await api(`/api/biblioteca/${id}/instalacion`, { method: "PUT", body: JSON.stringify({ ubicacion: d.ubicacion }) });
        descargas.delete(id);
        const juego = datosBiblioteca.juegos.find((j) => String(j.id) === id);
        if (juego) Object.assign(juego, { instalado: true, ubicacion: d.ubicacion, partidasEnNube: true });
        datosBiblioteca.unidades = datos.unidades;
        avisar(`✓ ${datos.mensaje}`, "exito", { duracion: 8000 });
        if ("Notification" in window && Notification.permission === "granted") {
            new Notification("Instalación completada", { body: datos.mensaje, icon: "img/icon.svg" });
        }
    } catch (err) {
        descargas.delete(id);
        avisar(err.message, "error");
    }
    if (location.hash === "#biblioteca") pintarBiblioteca();
}

// ---------- Desinstalar: confirmar / cancelar ----------
function pedirDesinstalacion(juego) {
    const id = String(juego.id);
    const conservar = el("input", { type: "checkbox", name: "conservar", checked: true });
    const form = el("form", { className: "modal__contenido", onsubmit: async (e) => {
        e.preventDefault();
        cerrarModal();
        try {
            const datos = await api(`/api/biblioteca/${id}/instalacion?conservarPartidas=${conservar.checked ? 1 : 0}`, { method: "DELETE" });
            Object.assign(juego, { instalado: false, ubicacion: null, partidasEnNube: juego.partidasEnNube && conservar.checked });
            datosBiblioteca.unidades = datos.unidades;
            avisar(datos.mensaje, "exito");
            pintarBiblioteca();
        } catch (err) {
            avisar(err.message, "error");
        }
    } },
        el("h2", { className: "modal__titulo", textContent: `¿Desinstalar ${juego.titulo}?` }),
        el("p", { textContent: `Se eliminarán los archivos del juego y se liberarán ${juego.tamanoGB} GB en ${nombreUnidad(juego.ubicacion)}. Seguirá en tu biblioteca para instalarlo después.` }),
        el("label", { className: "option" }, conservar, " Conservar partidas guardadas en la nube"),
        el("div", { className: "modal__botones" },
            el("button", { type: "button", className: "btn btn--secundario", textContent: "Cancelar", onclick: () => { cerrarModal(); avisar("Desinstalación cancelada"); } }),
            el("button", { type: "submit", className: "btn btn--peligro", textContent: "Desinstalar" })));
    abrirModal(form);
}
