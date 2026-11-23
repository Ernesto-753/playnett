// ===== Caso de uso 5 · Detalle del videojuego =====
const contDetalle = document.getElementById("detalle");

function estrellas(n) {
    return "★".repeat(Math.round(n)) + "☆".repeat(5 - Math.round(n));
}

// Convierte un enlace de YouTube (watch / youtu.be / embed) a la dirección para incrustarlo
function urlTrailer(url) {
    const m = String(url || "").match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([\w-]{11})/);
    return m ? `https://www.youtube-nocookie.com/embed/${m[1]}` : null;
}

// Regresa a la pantalla anterior (o al catálogo si se entró directo)
function botonVolver(destino = "#catalogo") {
    return el("a", { href: destino, className: "volver", textContent: "← Volver", onclick: (e) => {
        if (history.length > 1 && document.referrer.startsWith(location.origin)) { e.preventDefault(); history.back(); }
    } });
}

async function cargarDetalle(id) {
    contDetalle.replaceChildren(el("p", { className: "catalog__vacio", textContent: "Cargando…" }));
    let juego;
    try {
        juego = await api(`/api/videojuegos/${id}`);
    } catch {
        contDetalle.replaceChildren(el("p", { className: "catalog__vacio" }, "No encontramos ese videojuego. ",
            el("a", { href: "#catalogo", className: "enlace", textContent: "Volver al catálogo" })));
        return;
    }
    const idJuego = String(juego.id);
    if (juego.enBiblioteca) biblioteca.add(idJuego);
    document.title = `${juego.titulo} · Playnett`;

    // Precio final y descuento
    const precio = el("div", { className: "detalle__precio" },
        juego.enOferta ? el("span", { className: "badge badge--grande", textContent: `−${juego.descuento} %` }) : null,
        el("strong", { textContent: textoPrecio(juego) }),
        juego.enOferta && juego.precioFinal > 0 ? el("s", { className: "price__old", textContent: formatoPrecio.format(juego.precio) }) : null
    );

    // Comprar / Obtener gratis / Ya en biblioteca
    let accionPrincipal;
    if (biblioteca.has(idJuego)) {
        accionPrincipal = el("a", { href: "#biblioteca", className: "btn btn--primary btn--grande", textContent: "En tu biblioteca · Instalar" });
    } else if (juego.precioFinal === 0) {
        accionPrincipal = el("button", { type: "button", className: "btn btn--primary btn--grande", textContent: "Obtener gratis", onclick: () => obtenerGratis(idJuego, juego.titulo) });
    } else {
        accionPrincipal = el("a", { href: `#comprar/${idJuego}`, className: "btn btn--primary btn--grande", textContent: "Comprar" });
    }
    const btnFav = el("button", {
        type: "button", className: "btn btn--secundario btn--grande detalle__fav", dataset: { fav: idJuego },
        "aria-pressed": favoritos.has(idJuego),
        onclick: () => alternarFavorito(idJuego),
    });
    btnFav.innerHTML = ICONO_CORAZON + "<span>Favorito</span>";
    if (favoritos.has(idJuego)) btnFav.classList.add("select");

    // Capturas y tráiler
    const principal = el("img", { src: juego.capturas?.[0] || juego.portada, alt: `Captura de ${juego.titulo}`, className: "galeria__principal" });
    const miniaturas = (juego.capturas?.length ? juego.capturas : [juego.portada]).map((src, i) =>
        el("button", { type: "button", className: `galeria__mini${i === 0 ? " galeria__mini--activa" : ""}`, "aria-label": `Ver captura ${i + 1}`,
            onclick: (e) => {
                principal.src = src;
                contDetalle.querySelectorAll(".galeria__mini").forEach((m) => m.classList.remove("galeria__mini--activa"));
                e.currentTarget.classList.add("galeria__mini--activa");
            } }, el("img", { src, alt: "" })));
    const embed = urlTrailer(juego.trailer);
    const trailer = embed
        ? el("iframe", { className: "galeria__trailer", src: embed, title: `Tráiler de ${juego.titulo}`, allow: "encrypted-media; picture-in-picture", allowFullscreen: true, loading: "lazy" })
        : el("a", { className: "btn btn--secundario", target: "_blank", rel: "noopener",
            href: `https://www.youtube.com/results?search_query=${encodeURIComponent(juego.titulo + " tráiler oficial")}`,
            textContent: "▶ Ver tráiler en YouTube" });

    contDetalle.replaceChildren(
        botonVolver(),
        el("div", { className: "detalle" },
            el("div", { className: "detalle__galeria" },
                principal,
                el("div", { className: "galeria__minis" }, ...miniaturas),
                el("h2", { className: "detalle__subtitulo", textContent: "Tráiler" }),
                trailer
            ),
            el("aside", { className: "detalle__compra" },
                el("img", { src: juego.portada, alt: `Portada de ${juego.titulo}`, className: "detalle__portada" }),
                el("p", { className: "card__genre", textContent: juego.categoria }),
                el("h1", { className: "detalle__titulo", textContent: juego.titulo }),
                el("p", { className: "detalle__plataformas" }, "Plataformas: ",
                    ...juego.plataformas.map((p) => el("span", { className: "chip", textContent: p }))),
                precio,
                juego.enOferta && juego.ofertaFin ? el("p", { className: "card__fin", textContent: `La oferta termina el ${formatoFecha.format(new Date(juego.ofertaFin))}` }) : null,
                el("div", { className: "detalle__acciones" }, accionPrincipal, btnFav)
            )
        ),
        el("section", { className: "detalle__seccion" },
            el("h2", { className: "detalle__subtitulo", textContent: "Descripción" }),
            el("p", { textContent: juego.descripcion || "Sin descripción." })
        ),
        el("section", { className: "detalle__seccion" },
            el("h2", { className: "detalle__subtitulo", textContent: "Requisitos del sistema" }),
            el("div", { className: "requisitos" },
                el("div", {}, el("h3", { textContent: "Mínimos" }), el("p", { textContent: juego.requisitos?.minimos || "No especificados" })),
                el("div", {}, el("h3", { textContent: "Recomendados" }), el("p", { textContent: juego.requisitos?.recomendados || "No especificados" }))
            )
        ),
        el("section", { className: "detalle__seccion", id: "resenas" })
    );
    cargarResenas(idJuego);
}

// Obtener juego gratis -> agregar juego a la biblioteca
async function obtenerGratis(idJuego, titulo) {
    if (!requiereSesion()) return;
    try {
        const datos = await api(`/api/biblioteca/${idJuego}`, { method: "POST" });
        biblioteca = new Set(datos.biblioteca.map(String));
        avisar(`${titulo} se agregó a tu biblioteca`, "exito", { enlace: "#biblioteca", textoEnlace: "Ir a la biblioteca" });
        enrutar();
    } catch (err) {
        avisar(err.message, "error");
    }
}

// Ver reseñas de otros jugadores
async function cargarResenas(idJuego) {
    const seccion = document.getElementById("resenas");
    let datos;
    try {
        datos = await api(`/api/videojuegos/${idJuego}/resenas`);
    } catch {
        return;
    }
    const lista = datos.resenas.map((r) => el("article", { className: "resena" },
        el("div", { className: "resena__cabecera" },
            el("span", { className: "resena__avatar" }, r.avatar ? el("img", { src: r.avatar, alt: "" }) : r.apodo[0].toUpperCase()),
            el("strong", { textContent: r.apodo + (r.mia ? " (tú)" : "") }),
            el("span", { className: "resena__estrellas", "aria-label": `${r.calificacion} de 5 estrellas`, textContent: estrellas(r.calificacion) }),
            el("span", { className: "resena__fecha", textContent: formatoFecha.format(new Date(r.fecha)) })
        ),
        el("p", { textContent: r.comentario })
    ));

    // Si el juego está en la biblioteca, el usuario puede dejar (o editar) su reseña
    let formulario = null;
    if (usuarioActual && biblioteca.has(idJuego)) {
        const mia = datos.resenas.find((r) => r.mia);
        const select = el("select", { className: "sort__select", name: "calificacion", "aria-label": "Calificación" },
            ...[5, 4, 3, 2, 1].map((n) => el("option", { value: n, textContent: estrellas(n), selected: mia?.calificacion === n })));
        const comentario = el("textarea", { className: "campo__input", name: "comentario", rows: 2, maxLength: 600, placeholder: "¿Qué te pareció?", value: mia?.comentario || "" });
        formulario = el("form", { className: "resena__form", onsubmit: async (e) => {
            e.preventDefault();
            try {
                await api(`/api/videojuegos/${idJuego}/resenas`, { method: "POST", body: JSON.stringify({ calificacion: Number(select.value), comentario: comentario.value }) });
                avisar("¡Gracias por tu reseña!", "exito");
                cargarResenas(idJuego);
            } catch (err) { avisar(err.message, "error"); }
        } }, select, comentario, el("button", { className: "btn btn--primary", textContent: mia ? "Actualizar reseña" : "Publicar reseña" }));
    }

    seccion.replaceChildren(...[
        el("h2", { className: "detalle__subtitulo" }, "Reseñas de jugadores ",
            datos.total ? el("span", { className: "catalog__results", textContent: `${estrellas(datos.promedio)} ${datos.promedio} · ${datos.total} reseña${datos.total === 1 ? "" : "s"}` }) : null),
        formulario,
        ...(lista.length ? lista : [el("p", { className: "texto-tenue", textContent: "Todavía no hay reseñas de este juego." })]),
    ].filter(Boolean));
}
