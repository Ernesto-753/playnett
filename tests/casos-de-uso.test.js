// Pruebas de la API organizadas por los 11 diagramas de casos de uso del Gamer.
// Usan una base de datos aparte (playnett_pruebas) que se borra al terminar.
// Uso: npm test
import { test, before, after, describe } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { conectarDB } from "../backend/db.js";
import { crearApp } from "../backend/app.js";
import { sembrar } from "../backend/seed.js";
import Videojuego from "../backend/models/Videojuego.js";

let servidor, base;
const juegos = {};

class Cliente {
    cookie = "";
    async pedir(metodo, ruta, cuerpo) {
        const r = await fetch(base + ruta, {
            method: metodo,
            redirect: "manual",
            headers: { "Content-Type": "application/json", ...(this.cookie ? { Cookie: this.cookie } : {}) },
            body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
        });
        const set = r.headers.get("set-cookie");
        if (set) {
            this.cookie = set.split(";")[0];
            this.ultimaCookie = set;
            if (this.cookie.endsWith("=")) this.cookie = "";
        }
        const datos = await r.json().catch(() => null);
        return { status: r.status, datos, headers: r.headers };
    }
    get = (ruta) => this.pedir("GET", ruta);
    post = (ruta, c = {}) => this.pedir("POST", ruta, c);
    put = (ruta, c = {}) => this.pedir("PUT", ruta, c);
    patch = (ruta, c = {}) => this.pedir("PATCH", ruta, c);
    del = (ruta) => this.pedir("DELETE", ruta);
}

let contador = 0;
function datosRegistro(extra = {}) {
    contador++;
    return {
        apodo: `Prueba${Date.now() % 100000}${contador}`,
        correo: `prueba${Date.now()}${contador}@test.mx`,
        fechaNacimiento: "2000-05-10",
        contrasena: "Segura123!",
        confirmarContrasena: "Segura123!",
        terminos: true,
        ...extra,
    };
}
async function gamerConSesion() {
    const c = new Cliente();
    const datos = datosRegistro();
    const r = await c.post("/api/auth/registro", datos);
    assert.equal(r.status, 201, JSON.stringify(r.datos));
    c.datos = datos;
    return c;
}
const TARJETA_OK = { tipo: "tarjeta", titular: "Ana Prueba", numero: "4242 4242 4242 4242", vencimiento: "12/40", cvv: "123" };

before(async () => {
    process.env.NODE_ENV = "test";
    await conectarDB("playnett_pruebas");
    await mongoose.connection.dropDatabase();
    await sembrar();
    for (const j of await Videojuego.find()) juegos[j.titulo] = j._id.toString();
    await new Promise((ok) => {
        servidor = crearApp().listen(0, ok);
    });
    base = `http://127.0.0.1:${servidor.address().port}`;
});

after(async () => {
    servidor?.close();
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
});

describe("1 · Registro", () => {
    test("registra con todos los datos, valida y envía correo de verificación", async () => {
        const c = new Cliente();
        const r = await c.post("/api/auth/registro", datosRegistro());
        assert.equal(r.status, 201);
        assert.equal(r.datos.verificado, false);
        assert.match(r.datos.mensaje, /verificación/);
        assert.ok(r.datos.enlaceDemo);
        // abrir el enlace del correo verifica la cuenta
        const v = await c.get(r.datos.enlaceDemo.replace(/^https?:\/\/[^/]+/, ""));
        assert.equal(v.status, 302);
        assert.match(v.headers.get("location"), /verificado=1/);
        assert.equal((await c.get("/api/auth/yo")).datos.verificado, true);
    });
    test("valida que el nombre de usuario esté disponible", async () => {
        const c = await gamerConSesion();
        const d = await new Cliente().get(`/api/auth/disponible?apodo=${c.datos.apodo.toUpperCase()}`);
        assert.equal(d.datos.apodo, false);
        const r = await new Cliente().post("/api/auth/registro", datosRegistro({ apodo: c.datos.apodo }));
        assert.equal(r.status, 409);
    });
    test("valida formato del correo", async () => {
        const r = await new Cliente().post("/api/auth/registro", datosRegistro({ correo: "no-es-correo" }));
        assert.equal(r.status, 400);
        assert.equal(r.datos.campo, "correo");
    });
    test("muestra error: correo ya registrado", async () => {
        const c = await gamerConSesion();
        assert.equal((await new Cliente().get(`/api/auth/disponible?correo=${c.datos.correo}`)).datos.correo, false);
        const r = await new Cliente().post("/api/auth/registro", datosRegistro({ correo: c.datos.correo }));
        assert.equal(r.status, 409);
        assert.match(r.datos.error, /correo ya está registrado/);
    });
    test("verifica edad mínima de 13 años", async () => {
        const hace12 = new Date(Date.now() - 12 * 365.25 * 864e5).toISOString().slice(0, 10);
        const r = await new Cliente().post("/api/auth/registro", datosRegistro({ fechaNacimiento: hace12 }));
        assert.equal(r.status, 400);
        assert.match(r.datos.error, /13 años/);
    });
    test("valida seguridad y confirmación de contraseña", async () => {
        const debil = await new Cliente().post("/api/auth/registro", datosRegistro({ contrasena: "abcdefgh", confirmarContrasena: "abcdefgh" }));
        assert.equal(debil.status, 400);
        const distinta = await new Cliente().post("/api/auth/registro", datosRegistro({ confirmarContrasena: "Otra1234!" }));
        assert.equal(distinta.datos.campo, "confirmarContrasena");
    });
    test("exige aceptar términos y condiciones", async () => {
        const r = await new Cliente().post("/api/auth/registro", datosRegistro({ terminos: false }));
        assert.equal(r.datos.campo, "terminos");
    });
    test("registro con Google responde aunque no esté configurado", async () => {
        const r = await new Cliente().post("/api/auth/google", { credential: "x" });
        assert.equal(r.status, 503);
    });
});

describe("2 · Inicio de sesión", () => {
    test("inicia sesión con correo y contraseña", async () => {
        const g = await gamerConSesion();
        const c = new Cliente();
        const r = await c.post("/api/auth/login", { correo: g.datos.correo, contrasena: g.datos.contrasena });
        assert.equal(r.status, 200);
        assert.equal((await c.get("/api/auth/yo")).datos.apodo, g.datos.apodo);
    });
    test("usuario no registrado -> error correo y contraseña incorrectos", async () => {
        const r = await new Cliente().post("/api/auth/login", { correo: "nadie@test.mx", contrasena: "Segura123!" });
        assert.equal(r.status, 401);
        assert.match(r.datos.error, /incorrectos/);
    });
    test("bloquea la cuenta tras 5 intentos fallidos", async () => {
        const g = await gamerConSesion();
        const c = new Cliente();
        for (let i = 1; i <= 4; i++) {
            const r = await c.post("/api/auth/login", { correo: g.datos.correo, contrasena: "Mala123!" });
            assert.equal(r.status, 401);
            assert.equal(r.datos.intentosRestantes, 5 - i);
        }
        assert.equal((await c.post("/api/auth/login", { correo: g.datos.correo, contrasena: "Mala123!" })).status, 423);
        // ni con la contraseña correcta entra mientras esté bloqueada
        assert.equal((await c.post("/api/auth/login", { correo: g.datos.correo, contrasena: g.datos.contrasena })).status, 423);
    });
    test("recordar sesión deja una cookie persistente; sin recordar, de sesión", async () => {
        const g = await gamerConSesion();
        const a = new Cliente();
        await a.post("/api/auth/login", { correo: g.datos.correo, contrasena: g.datos.contrasena, recordar: true });
        assert.match(a.ultimaCookie, /Max-Age=/);
        const b = new Cliente();
        await b.post("/api/auth/login", { correo: g.datos.correo, contrasena: g.datos.contrasena });
        assert.doesNotMatch(b.ultimaCookie, /Max-Age=/);
    });
    test("recuperar contraseña: envía enlace y permite crear una nueva (y desbloquea)", async () => {
        const g = await gamerConSesion();
        const c = new Cliente();
        const r = await c.post("/api/auth/recuperar", { correo: g.datos.correo });
        assert.equal(r.status, 200);
        const token = new URL(r.datos.enlaceDemo).searchParams.get("token");
        const debil = await c.post("/api/auth/restablecer", { token, contrasena: "corta", confirmarContrasena: "corta" });
        assert.equal(debil.status, 400);
        const ok = await c.post("/api/auth/restablecer", { token, contrasena: "Nueva456#", confirmarContrasena: "Nueva456#" });
        assert.equal(ok.status, 200);
        assert.equal((await c.post("/api/auth/login", { correo: g.datos.correo, contrasena: "Nueva456#" })).status, 200);
        // el enlace no se puede reutilizar
        assert.equal((await c.post("/api/auth/restablecer", { token, contrasena: "Otra789$", confirmarContrasena: "Otra789$" })).status, 400);
    });
});

describe("3 · Catálogo", () => {
    test("muestra tarjetas con portada, título, categoría, plataformas, precio y total", async () => {
        const r = await new Cliente().get("/api/videojuegos?limite=48");
        assert.equal(r.datos.total, 6);
        for (const j of r.datos.juegos) {
            for (const campo of ["portada", "titulo", "categoria", "plataformas", "precio", "precioFinal", "descuento"]) assert.ok(campo in j, campo);
        }
        const forza = r.datos.juegos.find((j) => j.titulo === "Forza Horizon 5");
        assert.equal(forza.precioFinal, 599);
        assert.equal(forza.enOferta, true);
    });
    test("filtra por categoría y muestra el número de juegos por categoría", async () => {
        const r = await new Cliente().get("/api/videojuegos?categoria=RPG");
        assert.deepEqual(r.datos.juegos.map((j) => j.titulo), ["Elden Ring"]);
        const cat = await new Cliente().get("/api/videojuegos/categorias");
        assert.equal(cat.datos.categorias.length, 6);
        assert.equal(cat.datos.total, 6);
    });
    test("filtra por rango de precio y solo ofertas", async () => {
        const gratis = await new Cliente().get("/api/videojuegos?precio=gratis");
        assert.deepEqual(gratis.datos.juegos.map((j) => j.titulo), ["Halo Infinite"]);
        const menos400 = await new Cliente().get("/api/videojuegos?precio=menos400&limite=48");
        assert.ok(menos400.datos.juegos.every((j) => j.precioFinal > 0 && j.precioFinal < 400));
        const ofertas = await new Cliente().get("/api/videojuegos?oferta=1&limite=48");
        assert.equal(ofertas.datos.total, 2);
    });
    test("ordena por populares, precio y recientes", async () => {
        const asc = (await new Cliente().get("/api/videojuegos?orden=precio_asc&limite=48")).datos.juegos.map((j) => j.precioFinal);
        assert.deepEqual(asc, [...asc].sort((a, b) => a - b));
        const pop = (await new Cliente().get("/api/videojuegos?orden=populares&limite=48")).datos.juegos.map((j) => j.popularidad);
        assert.deepEqual(pop, [...pop].sort((a, b) => b - a));
        assert.equal((await new Cliente().get("/api/videojuegos?orden=recientes")).status, 200);
    });
});

describe("4 · Buscar videojuego", () => {
    test("busca por nombre (sin importar mayúsculas)", async () => {
        const r = await new Cliente().get("/api/videojuegos?q=hollow");
        assert.deepEqual(r.datos.juegos.map((j) => j.titulo), ["Hollow Knight"]);
    });
    test("sin resultados regresa total 0", async () => {
        const r = await new Cliente().get("/api/videojuegos?q=zzzz");
        assert.equal(r.datos.total, 0);
    });
    test("combina búsqueda con filtros de categoría y precio", async () => {
        const r = await new Cliente().get("/api/videojuegos?q=e&categoria=RPG&precio=mas800");
        assert.deepEqual(r.datos.juegos.map((j) => j.titulo), ["Elden Ring"]);
        const r2 = await new Cliente().get("/api/videojuegos?q=elden&precio=gratis");
        assert.equal(r2.datos.total, 0);
    });
    test("caracteres especiales no rompen la búsqueda", async () => {
        assert.equal((await new Cliente().get("/api/videojuegos?q=" + encodeURIComponent("(.*"))).status, 200);
    });
});

describe("5 · Detalle del videojuego", () => {
    test("muestra portada, precio final, plataformas, descripción y requisitos", async () => {
        const r = await new Cliente().get(`/api/videojuegos/${juegos["Forza Horizon 5"]}`);
        assert.equal(r.datos.precioFinal, 599);
        assert.equal(r.datos.descuento, 50);
        assert.ok(r.datos.descripcion && r.datos.requisitos.minimos && r.datos.requisitos.recomendados);
        assert.ok(r.datos.capturas.length >= 1);
        assert.ok(r.datos.ofertaFin);
    });
    test("id inválido o inexistente -> 404", async () => {
        assert.equal((await new Cliente().get("/api/videojuegos/abc")).status, 404);
        assert.equal((await new Cliente().get("/api/videojuegos/000000000000000000000000")).status, 404);
    });
    test("ver reseñas de otros jugadores", async () => {
        const r = await new Cliente().get(`/api/videojuegos/${juegos["Forza Horizon 5"]}/resenas`);
        assert.equal(r.datos.total, 2);
        assert.equal(r.datos.promedio, 4.5);
    });
    test("agregar a favoritos verifica sesión iniciada", async () => {
        assert.equal((await new Cliente().post(`/api/favoritos/${juegos["Elden Ring"]}`)).status, 401);
    });
    test("obtener juego gratis lo agrega a la biblioteca (y no se puede comprar uno gratis)", async () => {
        const c = await gamerConSesion();
        const halo = juegos["Halo Infinite"];
        assert.equal((await c.post(`/api/biblioteca/${halo}`)).status, 201);
        assert.equal((await c.post(`/api/biblioteca/${halo}`)).status, 409);
        assert.equal((await c.get(`/api/videojuegos/${halo}`)).datos.enBiblioteca, true);
        assert.equal((await c.post(`/api/biblioteca/${juegos["Elden Ring"]}`)).status, 400);
        // ya en la biblioteca puede reseñarlo
        assert.equal((await c.post(`/api/videojuegos/${halo}/resenas`, { calificacion: 5, comentario: "Muy bueno" })).status, 201);
        assert.equal((await c.post(`/api/videojuegos/${juegos["Elden Ring"]}/resenas`, { calificacion: 5, comentario: "x123" })).status, 403);
    });
});

describe("6 · Favoritos", () => {
    test("sin sesión no se puede ver la lista", async () => {
        assert.equal((await new Cliente().get("/api/favoritos")).status, 401);
    });
    test("agregar, mostrar lista, contador y quitar", async () => {
        const c = await gamerConSesion();
        await c.post(`/api/favoritos/${juegos["Elden Ring"]}`);
        const r = await c.post(`/api/favoritos/${juegos["Elden Ring"]}`); // sin duplicados
        assert.equal(r.datos.favoritos.length, 1);
        await c.post(`/api/favoritos/${juegos["Minecraft"]}`);
        const lista = await c.get("/api/favoritos");
        assert.deepEqual(lista.datos.map((j) => j.titulo).sort(), ["Elden Ring", "Minecraft"]);
        assert.equal((await c.del(`/api/favoritos/${juegos["Minecraft"]}`)).datos.favoritos.length, 1);
    });
    test("avisa cuando un favorito entra en oferta (una sola vez)", async () => {
        const c = await gamerConSesion();
        const id = juegos["Hollow Knight"];
        await c.post(`/api/favoritos/${id}`);
        assert.deepEqual((await c.get("/api/favoritos/avisos")).datos, []);
        await Videojuego.updateOne({ _id: id }, { descuento: 30 });
        try {
            const avisos = (await c.get("/api/favoritos/avisos")).datos;
            assert.equal(avisos.length, 1);
            assert.equal(avisos[0].descuento, 30);
            assert.deepEqual((await c.get("/api/favoritos/avisos")).datos, []);
        } finally {
            await Videojuego.updateOne({ _id: id }, { descuento: 0 });
        }
    });
});

describe("7 · Ofertas", () => {
    test("muestra juegos con descuento, precio original, final y fecha de fin", async () => {
        const r = await new Cliente().get("/api/videojuegos?oferta=1&orden=descuento&limite=48");
        assert.ok(r.datos.juegos.length > 0);
        for (const j of r.datos.juegos) {
            assert.ok(j.descuento > 0 && j.precioFinal < j.precio && j.ofertaFin);
        }
    });
    test("filtra ofertas por categoría y ordena por mayor descuento", async () => {
        const r = await new Cliente().get("/api/videojuegos?oferta=1&categoria=Aventura");
        assert.deepEqual(r.datos.juegos.map((j) => j.titulo), ["Sea of Thieves"]);
        const id = juegos["Elden Ring"];
        await Videojuego.updateOne({ _id: id }, { descuento: 70 });
        try {
            const orden = (await new Cliente().get("/api/videojuegos?oferta=1&orden=descuento")).datos.juegos;
            assert.equal(orden[0].titulo, "Elden Ring");
        } finally {
            await Videojuego.updateOne({ _id: id }, { descuento: 0 });
        }
    });
    test("una oferta vencida ya no cuenta como oferta", async () => {
        const id = juegos["Minecraft"];
        await Videojuego.updateOne({ _id: id }, { descuento: 40, ofertaFin: new Date(Date.now() - 1000) });
        try {
            const r = await new Cliente().get(`/api/videojuegos/${id}`);
            assert.equal(r.datos.enOferta, false);
            assert.equal(r.datos.precioFinal, 599);
            const lista = await new Cliente().get("/api/videojuegos?oferta=1&limite=48");
            assert.ok(!lista.datos.juegos.some((j) => j.titulo === "Minecraft"));
        } finally {
            await Videojuego.updateOne({ _id: id }, { descuento: 0, $unset: { ofertaFin: 1 } });
        }
    });
});

describe("8 · Comprar videojuego", () => {
    test("verifica sesión iniciada", async () => {
        assert.equal((await new Cliente().post("/api/compras/resumen", { videojuego: juegos["Elden Ring"] })).status, 401);
    });
    test("resumen con descuento, IVA y código promocional", async () => {
        const c = await gamerConSesion();
        const r = await c.post("/api/compras/resumen", { videojuego: juegos["Forza Horizon 5"] });
        assert.equal(r.datos.total, 599);
        assert.equal(Math.round((r.datos.subtotal + r.datos.iva) * 100) / 100, 599);
        const promo = await c.post("/api/compras/resumen", { videojuego: juegos["Forza Horizon 5"], codigo: "playnett10" });
        assert.equal(promo.datos.total, 539.1);
        const malo = await c.post("/api/compras/resumen", { videojuego: juegos["Forza Horizon 5"], codigo: "NOEXISTE" });
        assert.equal(malo.status, 400);
    });
    test("pago rechazado no agrega el juego", async () => {
        const c = await gamerConSesion();
        const r = await c.post("/api/compras", { videojuego: juegos["Elden Ring"], metodoPago: { ...TARJETA_OK, numero: "4000 0000 0000 0002" } });
        assert.equal(r.status, 402);
        assert.equal(r.datos.rechazado, true);
        const mala = await c.post("/api/compras", { videojuego: juegos["Elden Ring"], metodoPago: { ...TARJETA_OK, numero: "1234 5678 9012 3456" } });
        assert.equal(mala.status, 402);
        assert.equal((await c.get("/api/auth/yo")).datos.biblioteca.length, 0);
    });
    test("pago con tarjeta: agrega a biblioteca, guarda pedido y no deja comprar dos veces", async () => {
        const c = await gamerConSesion();
        const r = await c.post("/api/compras", { videojuego: juegos["Elden Ring"], metodoPago: TARJETA_OK });
        assert.equal(r.status, 201);
        assert.equal(r.datos.pedido.metodoPago.detalle, "Visa •••• 4242");
        assert.match(r.datos.mensaje, /comprobante/);
        assert.ok(r.datos.pedido.codigoActivacion);
        assert.equal((await c.post("/api/compras/resumen", { videojuego: juegos["Elden Ring"] })).status, 409);
    });
    test("pago con PayPal", async () => {
        const c = await gamerConSesion();
        const ok = await c.post("/api/compras", { videojuego: juegos["Minecraft"], metodoPago: { tipo: "paypal", correo: "yo@paypal.com" } });
        assert.equal(ok.status, 201);
        const c2 = await gamerConSesion();
        const no = await c2.post("/api/compras", { videojuego: juegos["Minecraft"], metodoPago: { tipo: "paypal", correo: "rechazado@paypal.com" } });
        assert.equal(no.status, 402);
    });
});

describe("9 · Biblioteca — Instalar videojuego", () => {
    test("verifica espacio, muestra error de espacio insuficiente e instala", async () => {
        const c = await gamerConSesion();
        await c.post("/api/compras", { videojuego: juegos["Forza Horizon 5"], metodoPago: TARJETA_OK });
        const forza = juegos["Forza Horizon 5"];
        const bib = await c.get("/api/biblioteca");
        assert.equal(bib.datos.juegos.length, 1);
        assert.equal(bib.datos.unidades.length, 3);
        // 110 GB no caben en la USB
        const sinEspacio = await c.post(`/api/biblioteca/${forza}/verificar-espacio`, { ubicacion: "E" });
        assert.equal(sinEspacio.status, 409);
        assert.equal(sinEspacio.datos.espacioInsuficiente, true);
        assert.equal((await c.post(`/api/biblioteca/${forza}/verificar-espacio`, { ubicacion: "X" })).status, 400);
        assert.equal((await c.post(`/api/biblioteca/${forza}/verificar-espacio`, { ubicacion: "D" })).status, 200);
        const inst = await c.put(`/api/biblioteca/${forza}/instalacion`, { ubicacion: "D" });
        assert.equal(inst.status, 200);
        const d = inst.datos.unidades.find((u) => u.id === "D");
        assert.equal(d.usadoGB, 460);
        assert.equal((await c.put(`/api/biblioteca/${forza}/instalacion`, { ubicacion: "D" })).status, 409);
    });
    test("no se puede instalar un juego que no es tuyo", async () => {
        const c = await gamerConSesion();
        assert.equal((await c.put(`/api/biblioteca/${juegos["Elden Ring"]}/instalacion`, { ubicacion: "D" })).status, 404);
    });
});

describe("10 · Biblioteca — Desinstalar videojuego", () => {
    test("desinstala, libera espacio y conserva (o no) las partidas en la nube", async () => {
        const c = await gamerConSesion();
        const halo = juegos["Halo Infinite"];
        const hk = juegos["Hollow Knight"];
        await c.post(`/api/biblioteca/${halo}`);
        await c.post("/api/compras", { videojuego: hk, metodoPago: TARJETA_OK });
        await c.put(`/api/biblioteca/${halo}/instalacion`, { ubicacion: "C" });
        await c.put(`/api/biblioteca/${hk}/instalacion`, { ubicacion: "C" });

        const r = await c.del(`/api/biblioteca/${halo}/instalacion?conservarPartidas=1`);
        assert.equal(r.status, 200);
        assert.equal(r.datos.unidades.find((u) => u.id === "C").usadoGB, 179);
        await c.del(`/api/biblioteca/${hk}/instalacion`);
        const bib = (await c.get("/api/biblioteca")).datos.juegos;
        const h = bib.find((j) => j.id === halo);
        const k = bib.find((j) => j.id === hk);
        assert.equal(h.instalado, false);
        assert.equal(h.partidasEnNube, true);
        assert.equal(k.partidasEnNube, false);
        // sigue en la biblioteca y no se puede desinstalar dos veces
        assert.equal(bib.length, 2);
        assert.equal((await c.del(`/api/biblioteca/${halo}/instalacion`)).status, 404);
    });
});

describe("11 · Perfil y configuración", () => {
    test("verifica sesión iniciada", async () => {
        assert.equal((await new Cliente().patch("/api/perfil", { apodo: "Nuevo" })).status, 401);
    });
    test("cambia nombre de usuario (validando que esté libre) y foto de perfil", async () => {
        const c = await gamerConSesion();
        const otro = await gamerConSesion();
        assert.equal((await c.patch("/api/perfil", { apodo: otro.datos.apodo })).status, 409);
        const nuevo = `Cambio${Date.now() % 100000}`;
        assert.equal((await c.patch("/api/perfil", { apodo: nuevo })).datos.apodo, nuevo);
        const png = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
        assert.equal((await c.patch("/api/perfil", { avatar: png })).datos.avatar, png);
        assert.equal((await c.patch("/api/perfil", { avatar: "data:text/html;base64,AAAA" })).status, 400);
    });
    test("cambia contraseña validando la actual y la seguridad de la nueva", async () => {
        const c = await gamerConSesion();
        assert.equal((await c.put("/api/perfil/contrasena", { actual: "Mala123!", nueva: "Nueva456#", confirmar: "Nueva456#" })).status, 401);
        assert.equal((await c.put("/api/perfil/contrasena", { actual: c.datos.contrasena, nueva: "debil", confirmar: "debil" })).status, 400);
        assert.equal((await c.put("/api/perfil/contrasena", { actual: c.datos.contrasena, nueva: "Nueva456#", confirmar: "Nueva456#" })).status, 200);
        assert.equal((await new Cliente().post("/api/auth/login", { correo: c.datos.correo, contrasena: "Nueva456#" })).status, 200);
    });
    test("ver historial de compras", async () => {
        const c = await gamerConSesion();
        await c.post("/api/compras", { videojuego: juegos["Sea of Thieves"], metodoPago: TARJETA_OK });
        const h = await c.get("/api/compras");
        assert.equal(h.datos.length, 1);
        assert.equal(h.datos[0].titulo, "Sea of Thieves");
        assert.equal(h.datos[0].total, 399);
    });
    test("cerrar sesión", async () => {
        const c = await gamerConSesion();
        await c.post("/api/auth/logout");
        assert.equal((await c.get("/api/auth/yo")).datos, null);
    });
});
