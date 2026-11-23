// ===== Caso de uso 8 · Comprar videojuego =====
const contCompra = document.getElementById("compra");

function filaResumen(etiqueta, valor, clase = "") {
    return el("div", { className: `resumen__fila ${clase}` }, el("span", { textContent: etiqueta }), el("span", { textContent: valor }));
}

async function cargarCompra(id) {
    contCompra.replaceChildren(el("p", { className: "catalog__vacio", textContent: "Cargando…" }));
    let codigoAplicado = "";
    let resumen;

    // Verificar sesión iniciada (router) y que el juego no esté en la biblioteca (servidor)
    try {
        resumen = await api("/api/compras/resumen", { method: "POST", body: JSON.stringify({ videojuego: id }) });
    } catch (err) {
        contCompra.replaceChildren(botonVolver(`#juego/${id}`), el("div", { className: "compra__aviso" },
            el("h1", { className: "pagina__titulo", textContent: err.datos?.enBiblioteca ? "Ya tienes este juego" : "No se puede comprar" }),
            el("p", { textContent: err.message }),
            err.datos?.enBiblioteca ? el("a", { href: "#biblioteca", className: "btn btn--primary", textContent: "Ir a mi biblioteca" }) : null));
        return;
    }

    // ---- Resumen de compra: total con descuento e impuestos ----
    const cajaResumen = el("div", { className: "resumen__filas" });
    function pintarResumen() {
        cajaResumen.replaceChildren(...[
            filaResumen("Precio", formatoPrecio.format(resumen.precio)),
            resumen.descuento ? filaResumen(`Oferta (−${resumen.descuento} %)`, "−" + formatoPrecio.format(resumen.precio - resumen.precioConOferta), "resumen__fila--descuento") : null,
            resumen.codigoPromo ? filaResumen(`Código ${resumen.codigoPromo} (−${resumen.descuentoPromo} %)`, "−" + formatoPrecio.format(resumen.ahorroPromo), "resumen__fila--descuento") : null,
            filaResumen("Subtotal (sin IVA)", formatoPrecio.format(resumen.subtotal)),
            filaResumen("IVA (16 %)", formatoPrecio.format(resumen.iva)),
            filaResumen("Total", formatoPrecio.format(resumen.total), "resumen__fila--total"),
        ].filter(Boolean));
        btnPagar.textContent = `Confirmar pago · ${formatoPrecio.format(resumen.total)}`;
    }

    // ---- Aplicar código promocional ----
    const inputCodigo = el("input", { className: "campo__input", id: "codigo_promo", placeholder: "Ej. PLAYNETT10", autocomplete: "off" });
    const msgCodigo = el("p", { className: "campo__mensaje" });
    const formCodigo = el("form", { className: "promo", onsubmit: async (e) => {
        e.preventDefault();
        const codigo = inputCodigo.value.trim();
        try {
            resumen = await api("/api/compras/resumen", { method: "POST", body: JSON.stringify({ videojuego: id, codigo }) });
            codigoAplicado = resumen.codigoPromo || "";
            msgCodigo.className = "campo__mensaje campo__mensaje--ok";
            msgCodigo.textContent = codigoAplicado ? `Código aplicado: −${resumen.descuentoPromo} %` : "";
            pintarResumen();
        } catch (err) {
            msgCodigo.className = "campo__mensaje campo__mensaje--error";
            msgCodigo.textContent = err.message;
        }
    } }, el("label", { htmlFor: "codigo_promo", className: "campo__label", textContent: "Código promocional" }),
        el("div", { className: "promo__fila" }, inputCodigo, el("button", { className: "btn btn--secundario", textContent: "Aplicar" })),
        msgCodigo);

    // ---- Seleccionar método de pago ----
    const campo = (etiqueta, props) => el("label", { className: "campo" }, el("span", { className: "campo__label", textContent: etiqueta }), el("input", { className: "campo__input", required: true, ...props }));
    const numero = campo("Número de tarjeta", { name: "numero", inputMode: "numeric", autocomplete: "cc-number", placeholder: "4242 4242 4242 4242", maxLength: 23 });
    numero.querySelector("input").addEventListener("input", (e) => {
        e.target.value = e.target.value.replace(/\D/g, "").slice(0, 19).replace(/(\d{4})(?=\d)/g, "$1 ");
    });
    const vencimiento = campo("Vencimiento", { name: "vencimiento", placeholder: "MM/AA", autocomplete: "cc-exp", maxLength: 5 });
    vencimiento.querySelector("input").addEventListener("input", (e) => {
        const d = e.target.value.replace(/\D/g, "").slice(0, 4);
        e.target.value = d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
    });
    const datosTarjeta = el("div", { className: "pago__datos" },
        campo("Nombre del titular", { name: "titular", autocomplete: "cc-name", placeholder: "Como aparece en la tarjeta" }),
        numero,
        el("div", { className: "pago__fila" }, vencimiento, campo("CVV", { name: "cvv", inputMode: "numeric", autocomplete: "cc-csc", placeholder: "123", maxLength: 4, type: "password" })));
    const datosPaypal = el("div", { className: "pago__datos", hidden: true },
        campo("Correo de tu cuenta PayPal", { name: "correo", type: "email", autocomplete: "email", placeholder: "tucorreo@ejemplo.com", required: false }),
        el("p", { className: "texto-tenue", textContent: "Se te pedirá confirmar el pago en PayPal." }));

    const opcionMetodo = (valor, texto, marcado) => el("label", { className: "metodo" },
        el("input", { type: "radio", name: "metodo", value: valor, checked: marcado, onchange: () => {
            datosTarjeta.hidden = valor !== "tarjeta";
            datosPaypal.hidden = valor !== "paypal";
            datosTarjeta.querySelectorAll("input").forEach((i) => (i.required = valor === "tarjeta"));
            datosPaypal.querySelector("input").required = valor === "paypal";
        } }), el("span", { textContent: texto }));

    const errorPago = el("p", { className: "campo__mensaje campo__mensaje--error", role: "alert" });
    const btnPagar = el("button", { className: "btn btn--primary btn--grande btn--ancho", type: "submit" });

    // ---- Confirmar pago -> validar con el banco ----
    const formPago = el("form", { className: "pago", onsubmit: async (e) => {
        e.preventDefault();
        errorPago.textContent = "";
        const f = new FormData(formPago);
        const tipo = f.get("metodo");
        const metodoPago = tipo === "tarjeta"
            ? { tipo, titular: f.get("titular"), numero: f.get("numero"), vencimiento: f.get("vencimiento"), cvv: f.get("cvv") }
            : { tipo, correo: f.get("correo") };
        btnPagar.disabled = true;
        const textoAnterior = btnPagar.textContent;
        btnPagar.textContent = "Validando pago con el banco…";
        try {
            const datos = await api("/api/compras", { method: "POST", body: JSON.stringify({ videojuego: id, codigo: codigoAplicado, metodoPago }) });
            biblioteca.add(String(id));
            if (usuarioActual) usuarioActual.biblioteca = [...biblioteca];
            mostrarCompraExitosa(datos);
        } catch (err) {
            // Mostrar error: pago rechazado
            errorPago.textContent = err.datos?.rechazado ? `Pago rechazado: ${err.message.replace(/^Pago rechazado( por [^:]+)?:?\s*/i, "") || "intenta con otro método"}` : err.message;
            btnPagar.disabled = false;
            btnPagar.textContent = textoAnterior;
        }
    } },
        el("h2", { className: "detalle__subtitulo", textContent: "Método de pago" }),
        el("div", { className: "metodos" }, opcionMetodo("tarjeta", "💳 Tarjeta de crédito / débito", true), opcionMetodo("paypal", "🅿️ PayPal", false)),
        datosTarjeta, datosPaypal, errorPago, btnPagar,
        el("p", { className: "texto-tenue pago__demo" }, "Pago de demostración, no se cobra nada. Tarjeta aprobada: 4242 4242 4242 4242 · rechazada: 4000 0000 0000 0002 · PayPal rechazado: rechazado@paypal.com"));

    pintarResumen();
    contCompra.replaceChildren(
        botonVolver(`#juego/${id}`),
        el("h1", { className: "pagina__titulo", textContent: "Finalizar compra" }),
        el("div", { className: "compra" },
            formPago,
            el("aside", { className: "resumen" },
                el("h2", { className: "detalle__subtitulo", textContent: "Resumen de compra" }),
                el("div", { className: "resumen__juego" },
                    el("img", { src: resumen.juego.portada, alt: "" }),
                    el("div", {}, el("p", { className: "card__genre", textContent: resumen.juego.categoria }), el("strong", { textContent: resumen.juego.titulo }))),
                cajaResumen,
                formCodigo,
                el("p", { className: "texto-tenue", textContent: "Precios en MXN con IVA incluido." })
            )
        )
    );
}

function mostrarCompraExitosa({ pedido, mensaje }) {
    contCompra.replaceChildren(el("div", { className: "compra__aviso compra__aviso--exito" },
        el("div", { className: "compra__check", textContent: "✓" }),
        el("h1", { className: "pagina__titulo", textContent: "¡Compra realizada!" }),
        el("p", { textContent: `${pedido.titulo} ya está en tu biblioteca.` }),
        el("p", { className: "texto-tenue", textContent: mensaje }),
        el("div", { className: "resumen__filas compra__datos" },
            filaResumen("Pedido", pedido._id),
            filaResumen("Pagado con", pedido.metodoPago.detalle),
            filaResumen("Total", formatoPrecio.format(pedido.total), "resumen__fila--total"),
            filaResumen("Código de activación", pedido.codigoActivacion)),
        el("div", { className: "detalle__acciones" },
            el("a", { href: "#biblioteca", className: "btn btn--primary", textContent: "Ir a mi biblioteca" }),
            el("a", { href: "#catalogo", className: "btn btn--secundario", textContent: "Seguir comprando" }))
    ));
    avisar("Compra realizada con éxito", "exito");
}
