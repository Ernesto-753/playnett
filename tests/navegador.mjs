// Prueba en el navegador de los 11 diagramas de casos de uso del Gamer.
// Abre Chromium, recorre cada pantalla como lo haría un usuario y verifica lo que pide cada diagrama.
// Levanta su propio servidor con una base de datos temporal (playnett_navegador) que se borra al final.
// Uso: npx playwright install chromium   (solo la primera vez)
//      npm run test:navegador
import { chromium } from "playwright";
import mongoose from "mongoose";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { conectarDB } from "../backend/db.js";
import { crearApp } from "../backend/app.js";
import { sembrar } from "../backend/seed.js";

const PROYECTO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SHOTS = process.env.SHOTS; // carpeta opcional para guardar capturas
process.env.NODE_ENV = "test";
await conectarDB("playnett_navegador");
await mongoose.connection.dropDatabase();
await sembrar();
const servidor = await new Promise((ok) => { const s = crearApp().listen(0, () => ok(s)); });
const BASE = `http://localhost:${servidor.address().port}`;
const ponerDescuento = (titulo, descuento) => mongoose.connection.db.collection("videojuegos").updateOne({ titulo }, { $set: { descuento } });
const resultados = [];
let actual = "";
async function caso(nombre, fn) { actual = nombre; console.log(`\n=== ${nombre}`); try { await fn(); } catch (e) { fallo(`EXCEPCIÓN: ${e.message.split("\n")[0]}`); } }
function ok(cond, desc) { resultados.push({ caso: actual, desc, ok: !!cond }); console.log(`${cond ? "  ✔" : "  ✘"} ${desc}`); }
function fallo(desc) { ok(false, desc); }

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();
const erroresConsola = [];
page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource: the server responded with a status of (401|409|402|400|423|404)/.test(m.text())) erroresConsola.push(m.text()); });
page.on("pageerror", (e) => erroresConsola.push("pageerror: " + e.message));
const sleep = (ms) => page.waitForTimeout(ms);
const textosRotos = [];
const shot = async (n) => {
    const t = await page.evaluate(() => document.body.innerText);
    if (/\b(null|undefined|NaN)\b/.test(t)) textosRotos.push(n);
    if (SHOTS) await page.screenshot({ path: `${SHOTS}/${n}.png`, fullPage: true });
};

const sfx = Date.now() % 1000000;
const user = { apodo: `E2E${sfx}`, correo: `e2e${sfx}@test.mx`, pass: "Segura123!" };

await caso("1 · Registro", async () => {
    await page.goto(`${BASE}/components/iniciarSesion.html`);
    await page.click("#cambiarModo");
    ok(await page.isVisible("#apellido") && await page.isVisible("#fechaNacimiento") && await page.isVisible("#confirmarContrasena") && await page.isVisible("#terminos"), "formulario pide usuario, correo, fecha, contraseña, confirmación y términos");
    await page.fill("#apellido", "NettPlayer");
    await sleep(700);
    ok((await page.textContent("#msg_apodo")).includes("en uso"), "valida que el nombre de usuario esté disponible");
    await page.fill("#correo", "malcorreo");
    ok((await page.textContent("#msg_correo")).includes("formato"), "valida formato del correo");
    await page.fill("#correo", "nettplayer@ejemplo.playnett.mx");
    await sleep(700);
    ok((await page.textContent("#msg_correo")).includes("ya está registrado"), "muestra error: correo ya registrado");
    const hace10 = new Date(Date.now() - 10 * 365 * 864e5).toISOString().slice(0, 10);
    await page.fill("#fechaNacimiento", hace10); await page.dispatchEvent("#fechaNacimiento", "change");
    ok((await page.textContent("#msg_fecha")).includes("13"), "verifica edad mínima (13 años)");
    await page.fill("#contrasena", "abc");
    ok((await page.textContent("#msg_contrasena")).includes("8+"), "valida seguridad de la contraseña");
    await page.fill("#apellido", user.apodo); await page.fill("#correo", user.correo);
    await page.fill("#fechaNacimiento", "2000-01-15");
    await page.fill("#contrasena", user.pass); await page.fill("#confirmarContrasena", "Otra123!");
    ok((await page.textContent("#msg_confirmar")).includes("no coinciden"), "confirmar contraseña detecta diferencia");
    await page.fill("#confirmarContrasena", user.pass);
    await page.click("#enviar");
    ok((await page.textContent("#error")).includes("términos"), "exige aceptar términos y condiciones");
    ok(await page.isVisible("#googleNoConfigurado") || await page.isVisible("#botonGoogle iframe"), "opción registrarse con Google visible");
    await page.check("#terminos");
    await page.click("#enviar");
    await page.waitForSelector("#aviso:not([hidden])");
    const avisoTxt = await page.textContent("#aviso");
    ok(avisoTxt.includes("verificación"), "envía correo de verificación");
    await shot("01-registro");
    const enlace = await page.getAttribute("#aviso a", "href");
    await page.goto(enlace);
    ok((await page.textContent("#aviso")).includes("verificado"), "el enlace del correo verifica la cuenta");
});

await caso("2 · Inicio de sesión", async () => {
    await page.goto(`${BASE}/`);
    await page.waitForSelector("#usuario", { state: "visible" });
    await page.click("#btnOcultar"); await page.click("#cerrar_sesion");
    await page.waitForSelector("#init_sesion", { state: "visible" });
    await page.click("#init_sesion");
    ok(await page.isVisible("#recordar") && await page.isVisible("#olvide") && await page.isVisible("#cambiarModo"), "recordar sesión, recuperar contraseña e ir a registro visibles");
    await page.fill("#correo", user.correo); await page.fill("#contrasena", "Mala123!"); await page.click("#enviar");
    await page.waitForFunction(() => document.querySelector("#error").textContent.length > 0);
    ok((await page.textContent("#error")).includes("incorrectos"), "muestra error: correo y contraseña incorrectos");
    // recuperar contraseña
    await page.click("#olvide");
    await page.fill("#correo", user.correo); await page.click("#enviar");
    await page.waitForSelector("#aviso a");
    const enlace = await page.getAttribute("#aviso a", "href");
    ok(enlace.includes("token="), "envía enlace de restablecimiento al correo");
    await page.goto(enlace);
    ok(await page.isVisible("#confirmarContrasena") && !(await page.isVisible("#correo")), "pantalla para crear nueva contraseña");
    user.pass = "Nueva456#";
    await page.fill("#contrasena", user.pass); await page.fill("#confirmarContrasena", user.pass); await page.click("#enviar");
    await page.waitForFunction(() => document.querySelector("#aviso").textContent.includes("actualizó"));
    ok(true, "crear nueva contraseña");
    await page.fill("#correo", user.correo); await page.fill("#contrasena", user.pass); await page.check("#recordar");
    await page.click("#enviar");
    await page.waitForURL(/index\.html/);
    await page.waitForSelector("#usuario", { state: "visible" });
    ok((await page.textContent("#nombre_usuario")) === user.apodo, "inicia sesión y muestra el usuario");
    const cookie = (await ctx.cookies()).find((c) => c.name === "playnett_sesion");
    ok(cookie && cookie.expires > 0, "recordar sesión deja cookie persistente");
});

await caso("3 · Catálogo", async () => {
    await page.goto(`${BASE}/#catalogo`);
    await page.waitForSelector("#grid .card");
    ok(await page.locator("#grid .card").count() === 6, "muestra tarjetas de videojuegos");
    const c = page.locator("#grid .card").first();
    ok(await c.locator("img").count() && await c.locator(".card__title").textContent() && await c.locator(".card__genre").textContent() && await c.locator(".card__platforms").textContent() && await c.locator(".price").textContent(), "tarjeta con portada, título, categoría, plataformas y precio");
    ok((await page.textContent("#total_resultados")).includes("6"), "muestra total de resultados");
    ok((await page.locator(".category[data-categoria='RPG'] .category__count").textContent()) === "1", "número de juegos por categoría");
    await page.click(".category[data-categoria='RPG']"); await sleep(600);
    ok(await page.locator("#grid .card").count() === 1, "filtrar por categoría");
    await page.click(".category[data-categoria='']"); await sleep(400);
    await page.check("input[name=precio][value=gratis]"); await sleep(600);
    ok((await page.locator("#grid .card__title").allTextContents()).join() === "Halo Infinite", "filtrar por precio (gratis)");
    await page.check("input[name=precio][value='']");
    await page.check("#solo_ofertas"); await sleep(600);
    ok(await page.locator("#grid .card").count() === 2 && await page.locator("#grid .badge").count() >= 2, "filtrar solo ofertas (con descuento)");
    await page.uncheck("#solo_ofertas");
    await page.selectOption("#ordenar", "precio_asc"); await sleep(600);
    ok((await page.locator("#grid .card__title").first().textContent()) === "Halo Infinite", "ordenar por precio");
    await page.click("#btn_tema");
    ok(await page.evaluate(() => document.body.classList.contains("claro")), "cambiar tema claro/oscuro");
    await page.click("#btn_tema");
    await page.locator("#grid .card__link").first().click();
    await page.waitForSelector(".detalle__titulo");
    ok(true, "ver detalle del videojuego desde el catálogo");
});

await caso("4 · Buscar videojuego", async () => {
    await page.goto(`${BASE}/#catalogo`);
    await page.evaluate(() => localStorage.removeItem("playnett_historial"));
    await page.fill("#buscar", "elden"); await page.press("#buscar", "Enter"); await sleep(700);
    ok((await page.locator("#grid .card__title").allTextContents()).join() === "Elden Ring", "mostrar resultados de búsqueda");
    await page.fill("#buscar", ""); await page.click("#buscar"); await sleep(400);
    ok((await page.textContent("#sugerencias")).includes("elden"), "guarda y muestra el historial");
    await page.fill("#buscar", "eldne"); await sleep(800);
    ok((await page.textContent("#sugerencias")).includes("¿Quisiste decir?"), "busca nombres parecidos en el historial");
    await page.fill("#buscar", "for"); await sleep(800);
    ok((await page.locator("#sugerencias a.sugerencia").count()) >= 1, "muestra sugerencias mientras se escribe");
    await shot("04-sugerencias");
    await page.fill("#buscar", "zzzz"); await sleep(800);
    ok(await page.isVisible("#sin_resultados") && (await page.textContent("#sin_resultados")).includes("Sin resultados"), "mensaje «Sin resultados»");
    await page.fill("#buscar", "a"); await sleep(600);
    await page.click(".category[data-categoria='Aventura']"); await sleep(600);
    ok((await page.locator("#grid .card__title").allTextContents()).join() === "Sea of Thieves", "combina búsqueda con filtro de categoría");
    await page.click(".category[data-categoria='']");
    await page.fill("#buscar", ""); await page.click("#buscar"); await sleep(300);
    await page.click(".sugerencias__borrar"); await sleep(300);
    ok(await page.evaluate(() => !localStorage.getItem("playnett_historial")), "borrar historial de búsqueda");
    await page.fill("#buscar", "hollow"); await sleep(800);
    await page.locator("#sugerencias a.sugerencia").first().click();
    await page.waitForSelector(".detalle__titulo");
    ok((await page.textContent(".detalle__titulo")) === "Hollow Knight", "abrir detalle desde la búsqueda");
});

let idForza, idHalo, idElden;
await caso("5 · Detalle del videojuego", async () => {
    const juegos = await (await page.request.get(`${BASE}/api/videojuegos?limite=48`)).json();
    const id = (t) => juegos.juegos.find((j) => j.titulo === t).id;
    idForza = id("Forza Horizon 5"); idHalo = id("Halo Infinite"); idElden = id("Elden Ring");
    await page.goto(`${BASE}/#juego/${idForza}`);
    await page.waitForSelector(".detalle__titulo");
    ok(await page.isVisible(".detalle__portada") && (await page.textContent(".detalle__titulo")) === "Forza Horizon 5" && (await page.textContent(".detalle__compra .card__genre")) === "Carreras", "portada, título y categoría");
    ok((await page.textContent(".detalle__precio")).includes("599") && (await page.textContent(".detalle__precio")).includes("−50"), "precio final y descuento");
    ok(await page.locator(".detalle__plataformas .chip").count() === 2, "plataformas disponibles");
    ok((await page.textContent("main[data-vista=juego]")).includes("Requisitos del sistema") && (await page.textContent(".requisitos")).includes("GTX"), "descripción y requisitos");
    ok(await page.locator(".galeria__mini").count() >= 1 && (await page.locator(".galeria__trailer, a:has-text('tráiler')").count()) >= 1, "capturas y tráiler");
    await page.waitForSelector(".resena");
    ok(await page.locator(".resena").count() === 2, "reseñas de otros jugadores");
    await page.click(".detalle__fav"); await sleep(700);
    ok((await page.textContent("#fav_count")) === "1", "agregar a favoritos (con sesión)");
    ok(await page.locator(".detalle__acciones a:has-text('Comprar')").count() === 1, "botón comprar");
    await shot("05-detalle");
    await page.goto(`${BASE}/#juego/${idHalo}`);
    await page.waitForSelector(".detalle__titulo");
    await page.click("button:has-text('Obtener gratis')"); await sleep(1000);
    ok(await page.locator(".detalle__acciones a:has-text('En tu biblioteca')").count() === 1, "obtener gratis -> agregar a la biblioteca");
});

await caso("6 · Favoritos", async () => {
    await page.goto(`${BASE}/#favoritos`);
    await page.waitForSelector("#grid_favoritos .card");
    ok(await page.locator("#grid_favoritos .card").count() === 1, "mostrar lista de favoritos");
    ok(await page.locator("#grid_favoritos a:has-text('Comprar')").count() === 1, "ir a comprar desde favoritos");
    // agregar otro desde el catálogo
    await page.goto(`${BASE}/#catalogo`); await page.reload(); await page.waitForSelector("#grid .card");
    await page.locator(`[data-fav="${idElden}"]`).click(); await sleep(700);
    ok((await page.textContent("#fav_count")) === "2", "actualizar contador de favoritos");
    await page.goto(`${BASE}/#favoritos`); await page.waitForSelector("#grid_favoritos .card");
    await page.locator("#grid_favoritos .card", { hasText: "Elden Ring" }).locator("button:has-text('Quitar')").click(); await sleep(900);
    ok(await page.locator("#grid_favoritos .card").count() === 1 && (await page.textContent("#fav_count")) === "1", "quitar juego de favoritos");
    // aviso de oferta: se agrega Elden a favoritos y luego entra en oferta
    await page.request.post(`${BASE}/api/favoritos/${idElden}`);
    await ponerDescuento("Elden Ring", 40);
    await page.goto(`${BASE}/#catalogo`); await page.reload();
    await page.waitForSelector(".aviso--oferta", { timeout: 6000 }).catch(() => {});
    ok((await page.locator(".aviso--oferta").count()) === 1 && (await page.textContent(".aviso--oferta")).includes("Elden Ring"), "avisa cuando un favorito entra en oferta");
    await shot("06-aviso-oferta");
    await ponerDescuento("Elden Ring", 0);
    // sin sesión redirige
    const anon = await browser.newPage();
    await anon.goto(`${BASE}/#favoritos`);
    await anon.waitForURL(/iniciarSesion/);
    ok(anon.url().includes("volver="), "sin sesión: redirige a Iniciar sesión");
    await anon.close();
});

await caso("7 · Ofertas", async () => {
    await page.goto(`${BASE}/#ofertas`);
    await page.waitForSelector("#grid_ofertas .card");
    ok(await page.locator("#grid_ofertas .card").count() === 2, "mostrar juegos con descuento");
    const c = page.locator("#grid_ofertas .card").first();
    ok((await c.locator(".badge").textContent()).includes("%") && await c.locator(".price__old").count() === 1, "porcentaje y precio original tachado + final");
    ok((await c.locator(".card__fin").textContent()).includes("Termina"), "fecha de fin de la oferta");
    await page.selectOption("#ofertas_categoria", "Aventura"); await sleep(700);
    ok((await page.locator("#grid_ofertas .card__title").allTextContents()).join() === "Sea of Thieves", "filtrar ofertas por categoría");
    ok(await page.locator("#ofertas_orden option[value=descuento]").count() === 1, "ordenar por mayor descuento");
    await page.selectOption("#ofertas_categoria", "");  await sleep(500);
    ok(await page.locator("#grid_ofertas .card__fav").count() === 2, "agregar oferta a favoritos (corazón)");
    await shot("07-ofertas");
});

await caso("8 · Comprar videojuego", async () => {
    await page.goto(`${BASE}/#comprar/${idElden}`); await page.waitForSelector(".resumen__fila--total");
    await shot("08-sin-oferta");
    ok(!(await page.textContent(".resumen")).includes("Oferta"), "resumen sin oferta no muestra fila de descuento");
    await page.goto(`${BASE}/#comprar/${idForza}`);
    await page.waitForSelector(".resumen__fila--total");
    ok((await page.textContent(".resumen")).includes("IVA") && (await page.textContent(".resumen__fila--total")).includes("599"), "resumen de compra con total, descuento e IVA");
    await page.fill("#codigo_promo", "NOVALE"); await page.click(".promo button"); await sleep(600);
    ok((await page.textContent(".promo .campo__mensaje")).includes("no es válido"), "código promocional inválido");
    await page.fill("#codigo_promo", "PLAYNETT10"); await page.click(".promo button"); await sleep(600);
    ok((await page.textContent(".resumen__fila--total")).includes("539.10"), "aplicar código promocional");
    await page.fill("input[name=titular]", "Ana Prueba");
    await page.fill("input[name=numero]", "4000000000000002");
    await page.fill("input[name=vencimiento]", "1240");
    await page.fill("input[name=cvv]", "123");
    await page.click(".pago button[type=submit]");
    await page.waitForFunction(() => document.querySelector(".pago [role=alert]").textContent.length > 0);
    ok((await page.textContent(".pago [role=alert]")).includes("rechazado"), "mostrar error: pago rechazado");
    await shot("08-rechazado");
    await page.check("input[name=metodo][value=paypal]");
    ok(await page.isVisible("input[name=correo]"), "pagar con PayPal (formulario)");
    await page.check("input[name=metodo][value=tarjeta]");
    await page.fill("input[name=numero]", "4242424242424242");
    await page.click(".pago button[type=submit]");
    await page.waitForSelector(".compra__aviso--exito");
    ok((await page.textContent(".compra__aviso")).includes("comprobante"), "confirmar pago -> agrega a biblioteca y envía comprobante");
    await shot("08-exito");
    await page.reload(); await page.waitForSelector(".compra__aviso h1");
    ok((await page.textContent(".compra__aviso")).includes("Ya tienes"), "verificar que el juego no esté en la biblioteca");
});

await caso("9 · Biblioteca — Instalar", async () => {
    await page.goto(`${BASE}/#biblioteca`);
    await page.waitForSelector(".biblioteca__juego");
    ok(await page.locator(".biblioteca__juego").count() === 2 && await page.locator(".unidad").count() === 3, "biblioteca y unidades de disco");
    const forza = page.locator(".biblioteca__juego", { hasText: "Forza" });
    await forza.locator("button:has-text('Instalar')").click();
    await page.waitForSelector("#modal[open]");
    await page.check("#modal input[value=E]");
    await page.click("#modal button[type=submit]"); await sleep(700);
    ok((await page.textContent("#modal [role=alert]")).includes("Espacio insuficiente"), "mostrar error: espacio insuficiente");
    await shot("09-sin-espacio");
    await page.check("#modal input[value=D]");
    await page.click("#modal button[type=submit]"); await sleep(1500);
    ok((await forza.textContent()).includes("Descargando"), "descargar archivos + progreso");
    await forza.locator("button:has-text('Pausar')").click();
    const p1 = await forza.locator(".barra").getAttribute("aria-valuenow"); await sleep(1200);
    const p2 = await forza.locator(".barra").getAttribute("aria-valuenow");
    ok(p1 === p2 && (await forza.textContent()).includes("En pausa"), "pausar descarga");
    await forza.locator("button:has-text('Reanudar')").click();
    await page.waitForFunction(() => document.body.textContent.includes("Verificando integridad"), null, { timeout: 30000 });
    ok(true, "verificar integridad de los archivos");
    await page.waitForSelector(".aviso--exito:has-text('instaló')", { timeout: 15000 });
    ok((await forza.textContent()).includes("Instalado en Disco de juegos"), "notificar instalación completada");
    await shot("09-instalado");
});

await caso("10 · Biblioteca — Desinstalar", async () => {
    const forza = page.locator(".biblioteca__juego", { hasText: "Forza" });
    const libreAntes = await page.locator(".unidad", { hasText: "(D:)" }).textContent();
    await forza.locator("button:has-text('Desinstalar')").click();
    await page.waitForSelector("#modal[open]");
    ok(await page.isChecked("#modal input[name=conservar]"), "conservar partidas en la nube (opción)");
    await page.click("#modal button:has-text('Cancelar')"); await sleep(300);
    ok((await forza.textContent()).includes("Instalado"), "cancelar desinstalación");
    await forza.locator("button:has-text('Desinstalar')").click();
    await page.click("#modal button[type=submit]"); await sleep(1000);
    ok((await forza.textContent()).includes("No instalado") && (await forza.textContent()).includes("Partidas en la nube"), "confirmar, eliminar archivos y actualizar estado (partidas conservadas)");
    const libreDespues = await page.locator(".unidad", { hasText: "(D:)" }).textContent();
    ok(libreAntes !== libreDespues && libreDespues.includes("650 GB libres"), "liberar espacio en disco");
});

await caso("11 · Perfil y configuración", async () => {
    await page.goto(`${BASE}/#perfil`);
    await page.waitForSelector(".perfil");
    const nuevo = `E2Ex${sfx}`;
    await page.fill(".perfil input[name=apodo]", "LunaGamer"); await sleep(700);
    ok((await page.textContent(".perfil")).includes("ya está en uso"), "valida nombre de usuario ocupado");
    await page.fill(".perfil input[name=apodo]", nuevo);
    await page.setInputFiles(".perfil input[type=file]", `${PROYECTO}/img/HollowKnight.jpg`); await sleep(600);
    await page.click(".perfil button:has-text('Guardar cambios')"); await sleep(1000);
    ok((await page.textContent("#nombre_usuario")) === nuevo && await page.locator("#avatar_header img").count() === 1, "cambiar nombre de usuario y foto de perfil");
    await page.fill("input[name=actual]", "Mala123!"); await page.fill("input[name=nueva]", "Otra789$"); await page.fill("input[name=confirmar]", "Otra789$");
    await page.click("button:has-text('Cambiar contraseña')"); await sleep(800);
    ok((await page.textContent(".perfil")).includes("actual no es correcta"), "validar contraseña actual");
    await page.fill("input[name=actual]", user.pass); await page.fill("input[name=nueva]", "debil"); 
    ok((await page.textContent(".perfil")).includes("Necesita 8+"), "validar seguridad de la nueva contraseña");
    await page.fill("input[name=nueva]", "Otra789$"); await page.fill("input[name=confirmar]", "Otra789$");
    await page.click("button:has-text('Cambiar contraseña')"); await sleep(800);
    ok((await page.locator(".aviso--exito").last().textContent()).includes("contraseña"), "cambiar contraseña");
    ok((await page.textContent(".tabla")).includes("Forza Horizon 5"), "ver historial de compras");
    await page.click(".interruptor");
    ok(await page.evaluate(() => document.body.classList.contains("claro")), "cambiar tema claro / oscuro");
    await shot("11-perfil");
    await page.click(".interruptor");
    await page.click(".perfil button:has-text('Cerrar sesión')"); await sleep(800);
    ok(await page.isVisible("#init_sesion"), "cerrar sesión");
});

await caso("General", async () => {
    ok(textosRotos.length === 0, `sin textos null/undefined en pantalla ${textosRotos.join(",")}`);
    ok(erroresConsola.length === 0, `sin errores de JavaScript en consola ${erroresConsola.length ? JSON.stringify(erroresConsola.slice(0, 5)) : ""}`);
});

await browser.close();
servidor.close();
await mongoose.connection.dropDatabase();
await mongoose.disconnect();
const fallas = resultados.filter((r) => !r.ok);
console.log(`\nRESULTADO: ${resultados.length - fallas.length}/${resultados.length} verificaciones correctas`);
for (const f of fallas) console.log(`  FALLA [${f.caso}] ${f.desc}`);
process.exitCode = fallas.length ? 1 : 0;
