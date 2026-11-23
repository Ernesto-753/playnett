// ===== Caso de uso 7 · Ofertas =====
const selectCategoriaOfertas = document.getElementById("ofertas_categoria");
const selectOrdenOfertas = document.getElementById("ofertas_orden");

async function cargarOfertas() {
    // Las categorías con el número de juegos en oferta
    try {
        const { total, categorias } = await api("/api/videojuegos/categorias?oferta=1");
        const elegida = selectCategoriaOfertas.value;
        selectCategoriaOfertas.replaceChildren(
            el("option", { value: "", textContent: `Todas (${total})` }),
            ...categorias.map((c) => el("option", { value: c.nombre, textContent: `${c.nombre} (${c.total})`, selected: c.nombre === elegida }))
        );
    } catch { /* se queda la lista anterior */ }

    const params = new URLSearchParams({ oferta: "1", orden: selectOrdenOfertas.value, limite: 48 });
    if (selectCategoriaOfertas.value) params.set("categoria", selectCategoriaOfertas.value);
    try {
        const datos = await api(`/api/videojuegos?${params}`);
        document.getElementById("grid_ofertas").replaceChildren(...datos.juegos.map((j) => crearTarjeta(j, { mostrarFinOferta: true })));
        document.getElementById("ofertas_vacio").hidden = datos.juegos.length > 0;
        document.getElementById("ofertas_total").textContent = `${datos.total} juego${datos.total === 1 ? "" : "s"} con descuento`;
    } catch (err) {
        avisar("No se pudieron cargar las ofertas", "error");
    }
}

selectCategoriaOfertas.addEventListener("change", cargarOfertas);
selectOrdenOfertas.addEventListener("change", cargarOfertas);
