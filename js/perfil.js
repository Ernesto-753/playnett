// ===== Caso de uso 11 · Perfil y configuración =====
const contPerfil = document.getElementById("perfil");
const CONTRASENA_SEGURA = /^(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

// Reduce la foto a 256 px para que pese poco antes de guardarla en MongoDB
function reducirImagen(archivo) {
    return new Promise((resolver, rechazar) => {
        if (!/^image\/(png|jpeg|webp|gif)$/.test(archivo.type)) return rechazar(new Error("La foto debe ser PNG, JPG, WEBP o GIF"));
        if (archivo.size > 8 * 1024 * 1024) return rechazar(new Error("La foto pesa más de 8 MB"));
        const img = new Image();
        img.onload = () => {
            const lado = 256;
            const canvas = el("canvas", { width: lado, height: lado });
            const escala = Math.max(lado / img.width, lado / img.height);
            const w = img.width * escala, h = img.height * escala;
            canvas.getContext("2d").drawImage(img, (lado - w) / 2, (lado - h) / 2, w, h);
            URL.revokeObjectURL(img.src);
            resolver(canvas.toDataURL("image/jpeg", 0.85));
        };
        img.onerror = () => rechazar(new Error("No se pudo leer la imagen"));
        img.src = URL.createObjectURL(archivo);
    });
}

function seccion(titulo, ...contenido) {
    return el("section", { className: "perfil__seccion" }, el("h2", { className: "detalle__subtitulo", textContent: titulo }), ...contenido);
}

function campoPerfil(etiqueta, props) {
    const input = el("input", { className: "campo__input", ...props });
    const mensaje = el("p", { className: "campo__mensaje" });
    return { input, mensaje, nodo: el("label", { className: "campo" }, el("span", { className: "campo__label", textContent: etiqueta }), input, mensaje) };
}

function mensajeCampo(campo, texto, ok) {
    campo.mensaje.textContent = texto;
    campo.mensaje.className = `campo__mensaje ${texto ? (ok ? "campo__mensaje--ok" : "campo__mensaje--error") : ""}`;
}

async function cargarPerfil() {
    const u = usuarioActual;

    // ---------- Editar perfil: nombre de usuario y foto ----------
    let avatarNuevo; // undefined = sin cambios, null = quitar
    const vistaAvatar = el("div", { className: "perfil__avatar" });
    const pintarAvatar = (src) => vistaAvatar.replaceChildren(src ? el("img", { src, alt: "Foto de perfil" }) : el("span", { textContent: u.apodo[0].toUpperCase() }));
    pintarAvatar(u.avatar);

    const inputFoto = el("input", { type: "file", accept: "image/png,image/jpeg,image/webp,image/gif", hidden: true, onchange: async () => {
        try {
            avatarNuevo = await reducirImagen(inputFoto.files[0]);
            pintarAvatar(avatarNuevo);
        } catch (err) { avisar(err.message, "error"); }
        inputFoto.value = "";
    } });

    const apodo = campoPerfil("Nombre de usuario", { name: "apodo", value: u.apodo, minLength: 3, maxLength: 24, required: true, autocomplete: "username" });
    let esperaApodo;
    apodo.input.addEventListener("input", () => {
        clearTimeout(esperaApodo);
        const valor = apodo.input.value.trim();
        if (valor.length < 3) return mensajeCampo(apodo, "Mínimo 3 caracteres", false);
        if (valor.toLowerCase() === usuarioActual.apodo.toLowerCase()) return mensajeCampo(apodo, "", true);
        esperaApodo = setTimeout(async () => {
            const { apodo: libre } = await api(`/api/auth/disponible?apodo=${encodeURIComponent(valor)}`);
            mensajeCampo(apodo, libre ? "Disponible" : "Ese nombre ya está en uso", libre);
        }, 300);
    });

    const formPerfil = el("form", { className: "perfil__form", onsubmit: async (e) => {
        e.preventDefault();
        const cambios = {};
        if (apodo.input.value.trim() !== usuarioActual.apodo) cambios.apodo = apodo.input.value.trim();
        if (avatarNuevo !== undefined) cambios.avatar = avatarNuevo;
        if (!Object.keys(cambios).length) return avisar("No hay cambios que guardar");
        try {
            guardarUsuario(await api("/api/perfil", { method: "PATCH", body: JSON.stringify(cambios) }));
            avatarNuevo = undefined;
            mensajeCampo(apodo, "", true);
            avisar("Perfil actualizado", "exito");
        } catch (err) {
            avisar(err.message, "error");
        }
    } },
        el("div", { className: "perfil__foto" }, vistaAvatar,
            el("div", { className: "perfil__foto-botones" },
                el("button", { type: "button", className: "btn btn--secundario", textContent: "Cambiar foto", onclick: () => inputFoto.click() }),
                el("button", { type: "button", className: "btn btn--secundario", textContent: "Quitar foto", onclick: () => { avatarNuevo = null; pintarAvatar(null); } })),
            inputFoto),
        apodo.nodo,
        el("p", { className: "texto-tenue" }, `Correo: ${u.correo} `,
            u.verificado ? el("span", { className: "chip chip--ok", textContent: "✓ verificado" })
                : el("button", { type: "button", className: "enlace", textContent: "· Correo sin verificar: reenviar verificación", onclick: reenviarVerificacion })),
        el("button", { className: "btn btn--primary", textContent: "Guardar cambios" }));

    // ---------- Cambiar contraseña ----------
    const actual = campoPerfil("Contraseña actual", { type: "password", name: "actual", autocomplete: "current-password", placeholder: u.cuentaGoogle ? "Déjala vacía si entraste con Google y no tienes" : "" });
    const nueva = campoPerfil("Nueva contraseña", { type: "password", name: "nueva", autocomplete: "new-password", placeholder: "8+ caracteres, número y símbolo" });
    const confirmar = campoPerfil("Confirmar nueva contraseña", { type: "password", name: "confirmar", autocomplete: "new-password" });
    nueva.input.addEventListener("input", () => mensajeCampo(nueva, CONTRASENA_SEGURA.test(nueva.input.value) ? "Contraseña segura" : "Necesita 8+ caracteres, un número y un símbolo", CONTRASENA_SEGURA.test(nueva.input.value)));
    confirmar.input.addEventListener("input", () => mensajeCampo(confirmar, confirmar.input.value === nueva.input.value ? "Coinciden" : "No coinciden", confirmar.input.value === nueva.input.value));

    const formContrasena = el("form", { className: "perfil__form", onsubmit: async (e) => {
        e.preventDefault();
        [actual, nueva, confirmar].forEach((c) => mensajeCampo(c, ""));
        try {
            const datos = await api("/api/perfil/contrasena", { method: "PUT", body: JSON.stringify({ actual: actual.input.value, nueva: nueva.input.value, confirmar: confirmar.input.value }) });
            formContrasena.reset();
            avisar(datos.mensaje, "exito");
        } catch (err) {
            const campo = { actual, nueva, confirmar }[err.datos?.campo];
            if (campo) mensajeCampo(campo, err.message, false);
            else avisar(err.message, "error");
        }
    } }, actual.nodo, nueva.nodo, confirmar.nodo, el("button", { className: "btn btn--primary", textContent: "Cambiar contraseña" }));

    // ---------- Tema claro / oscuro ----------
    const interruptor = el("input", { type: "checkbox", role: "switch", checked: document.body.classList.contains("claro"),
        onchange: () => aplicarTema(interruptor.checked) });
    document.addEventListener("tema-cambiado", () => { if (interruptor.isConnected) interruptor.checked = document.body.classList.contains("claro"); });

    // ---------- Historial de compras ----------
    const historialCompras = el("div", {}, el("p", { className: "texto-tenue", textContent: "Cargando…" }));

    contPerfil.replaceChildren(
        el("h1", { className: "pagina__titulo", textContent: "Mi perfil" }),
        el("div", { className: "perfil" },
            el("div", {},
                seccion("Editar perfil", formPerfil),
                seccion("Cambiar contraseña", formContrasena)),
            el("div", {},
                seccion("Preferencias",
                    el("label", { className: "interruptor" }, interruptor, el("span", { className: "interruptor__pista" }), " Modo claro")),
                seccion("Historial de compras", historialCompras),
                seccion("Sesión", el("button", { type: "button", className: "btn btn--peligro", textContent: "Cerrar sesión", onclick: cerrarSesion }))))
    );

    try {
        const pedidos = await api("/api/compras");
        historialCompras.replaceChildren(pedidos.length
            ? el("table", { className: "tabla" },
                el("thead", {}, el("tr", {}, ...["Fecha", "Juego", "Pago", "Total"].map((t) => el("th", { textContent: t })))),
                el("tbody", {}, ...pedidos.map((p) => el("tr", {},
                    el("td", { textContent: formatoFecha.format(new Date(p.createdAt)) }),
                    el("td", {}, el("a", { href: `#juego/${p.videojuego}`, className: "enlace", textContent: p.titulo }),
                        el("br"), el("small", { className: "texto-tenue", textContent: `Código: ${p.codigoActivacion}` })),
                    el("td", { textContent: p.metodoPago.detalle }),
                    el("td", { textContent: formatoPrecio.format(p.total) })))))
            : el("p", { className: "texto-tenue", textContent: "Todavía no has comprado ningún juego." }));
    } catch {
        historialCompras.replaceChildren(el("p", { className: "texto-tenue", textContent: "No se pudo cargar el historial." }));
    }
}

async function reenviarVerificacion() {
    try {
        const datos = await api("/api/auth/verificacion", { method: "POST" });
        avisar(datos.mensaje, "exito", datos.enlaceDemo ? { enlace: datos.enlaceDemo, textoEnlace: "Abrir enlace (demo)", duracion: 15000 } : {});
    } catch (err) {
        avisar(err.message, "error");
    }
}
