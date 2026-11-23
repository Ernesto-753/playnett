import { Router } from "express";
import Usuario from "../models/Usuario.js";
import { COOKIE, crearSesion, requiereSesion } from "../middleware/auth.js";
import { nuevoToken, hashToken } from "../tokens.js";
import { enviarCorreo, modoDemo, urlBase } from "../correo.js";
import {
    CONTRASENA_SEGURA,
    CORREO_VALIDO,
    EDAD_MINIMA,
    MAX_INTENTOS,
    MINUTOS_BLOQUEO,
} from "../config/tienda.js";

const router = Router();

const escaparRegex = (texto) => texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const normalizarCorreo = (correo) => String(correo ?? "").toLowerCase().trim();

export function calcularEdad(fecha, hoy = new Date()) {
    const nacimiento = new Date(fecha);
    if (Number.isNaN(nacimiento.getTime())) return NaN;
    let edad = hoy.getUTCFullYear() - nacimiento.getUTCFullYear();
    const mes = hoy.getUTCMonth() - nacimiento.getUTCMonth();
    if (mes < 0 || (mes === 0 && hoy.getUTCDate() < nacimiento.getUTCDate())) edad--;
    return edad;
}

// El apodo se compara sin importar mayúsculas
function buscarPorApodo(apodo) {
    return Usuario.findOne({ apodo: { $regex: `^${escaparRegex(String(apodo).trim())}$`, $options: "i" } });
}

async function enviarVerificacion(req, usuario) {
    const { token, hash } = nuevoToken();
    usuario.tokenVerificacion = hash;
    await usuario.save();
    const enlace = `${urlBase(req)}/api/auth/verificar?token=${token}`;
    await enviarCorreo({
        para: usuario.correo,
        asunto: "Verifica tu correo en Playnett",
        texto: `Hola ${usuario.apodo}, confirma tu correo abriendo este enlace:\n${enlace}`,
    });
    return enlace;
}

// GET /api/auth/config -> datos públicos para el formulario (Google)
router.get("/config", (req, res) => {
    res.json({ googleClientId: process.env.GOOGLE_CLIENT_ID || null });
});

// GET /api/auth/disponible?apodo=&correo= -> valida mientras el usuario escribe
router.get("/disponible", async (req, res, next) => {
    try {
        const respuesta = {};
        if (typeof req.query.apodo === "string" && req.query.apodo.trim()) {
            const otro = await buscarPorApodo(req.query.apodo);
            respuesta.apodo = !otro || otro._id.equals(req.usuario?._id);
        }
        if (typeof req.query.correo === "string" && req.query.correo.trim()) {
            respuesta.correo = !(await Usuario.exists({ correo: normalizarCorreo(req.query.correo) }));
        }
        res.json(respuesta);
    } catch (err) {
        next(err);
    }
});

// POST /api/auth/registro
router.post("/registro", async (req, res, next) => {
    try {
        const { apodo, correo, fechaNacimiento, contrasena, confirmarContrasena, terminos } = req.body ?? {};

        if (!apodo || !correo || !fechaNacimiento || !contrasena) {
            return res.status(400).json({ error: "Faltan datos obligatorios" });
        }
        const apodoLimpio = String(apodo).trim();
        if (apodoLimpio.length < 3 || apodoLimpio.length > 24) {
            return res.status(400).json({ error: "El nombre de usuario debe tener entre 3 y 24 caracteres", campo: "apodo" });
        }
        if (!CORREO_VALIDO.test(normalizarCorreo(correo))) {
            return res.status(400).json({ error: "El correo no tiene un formato válido", campo: "correo" });
        }
        const edad = calcularEdad(fechaNacimiento);
        if (Number.isNaN(edad) || edad > 120 || edad < 0) {
            return res.status(400).json({ error: "La fecha de nacimiento no es válida", campo: "fechaNacimiento" });
        }
        if (edad < EDAD_MINIMA) {
            return res.status(400).json({ error: `Debes tener ${EDAD_MINIMA} años o más`, campo: "fechaNacimiento" });
        }
        if (!CONTRASENA_SEGURA.test(contrasena)) {
            return res.status(400).json({ error: "La contraseña necesita 8+ caracteres, un número y un símbolo", campo: "contrasena" });
        }
        if (contrasena !== confirmarContrasena) {
            return res.status(400).json({ error: "Las contraseñas no coinciden", campo: "confirmarContrasena" });
        }
        if (terminos !== true) {
            return res.status(400).json({ error: "Debes aceptar los términos y condiciones", campo: "terminos" });
        }

        if (await Usuario.exists({ correo: normalizarCorreo(correo) })) {
            return res.status(409).json({ error: "Este correo ya está registrado", campo: "correo" });
        }
        if (await buscarPorApodo(apodoLimpio)) {
            return res.status(409).json({ error: "Ese nombre de usuario ya está en uso", campo: "apodo" });
        }

        const usuario = await Usuario.create({
            apodo: apodoLimpio,
            correo,
            fechaNacimiento,
            contrasena,
        });
        const enlace = await enviarVerificacion(req, usuario);
        crearSesion(res, usuario, false);
        res.status(201).json({
            ...usuario.toPublico(),
            mensaje: `Te enviamos un correo de verificación a ${usuario.correo}`,
            ...(modoDemo ? { enlaceDemo: enlace } : {}),
        });
    } catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ error: "Ese correo o nombre de usuario ya está registrado" });
        }
        next(err);
    }
});

// GET /api/auth/verificar?token= -> enlace que llega por correo
router.get("/verificar", async (req, res, next) => {
    try {
        const usuario = req.query.token
            ? await Usuario.findOne({ tokenVerificacion: hashToken(req.query.token) })
            : null;
        if (!usuario) return res.redirect("/components/iniciarSesion.html?verificado=0");
        usuario.verificado = true;
        usuario.tokenVerificacion = undefined;
        await usuario.save();
        res.redirect("/components/iniciarSesion.html?verificado=1");
    } catch (err) {
        next(err);
    }
});

// POST /api/auth/verificacion -> reenviar el correo de verificación
router.post("/verificacion", requiereSesion, async (req, res, next) => {
    try {
        if (req.usuario.verificado) return res.json({ mensaje: "Tu correo ya está verificado" });
        const enlace = await enviarVerificacion(req, req.usuario);
        res.json({
            mensaje: `Te enviamos un correo de verificación a ${req.usuario.correo}`,
            ...(modoDemo ? { enlaceDemo: enlace } : {}),
        });
    } catch (err) {
        next(err);
    }
});

// POST /api/auth/login
router.post("/login", async (req, res, next) => {
    try {
        const { correo, contrasena, recordar } = req.body ?? {};
        if (!correo || !contrasena) {
            return res.status(400).json({ error: "Ingresa tu correo y contraseña" });
        }

        // Validar que el usuario esté registrado
        const usuario = await Usuario.findOne({ correo: normalizarCorreo(correo) }).select(
            "+contrasena +intentosFallidos +bloqueadoHasta"
        );
        if (!usuario) {
            return res.status(401).json({ error: "Correo o contraseña incorrectos" });
        }

        if (usuario.bloqueadoHasta && usuario.bloqueadoHasta > new Date()) {
            const minutos = Math.ceil((usuario.bloqueadoHasta - Date.now()) / 60000);
            return res.status(423).json({
                error: `Cuenta bloqueada por demasiados intentos. Intenta de nuevo en ${minutos} min o recupera tu contraseña.`,
                bloqueada: true,
            });
        }

        // Validar contraseña
        if (!(await usuario.compararContrasena(contrasena))) {
            usuario.intentosFallidos = (usuario.intentosFallidos || 0) + 1;
            if (usuario.intentosFallidos >= MAX_INTENTOS) {
                usuario.intentosFallidos = 0;
                usuario.bloqueadoHasta = new Date(Date.now() + MINUTOS_BLOQUEO * 60000);
                await usuario.save();
                return res.status(423).json({
                    error: `Cuenta bloqueada por ${MINUTOS_BLOQUEO} minutos tras ${MAX_INTENTOS} intentos fallidos.`,
                    bloqueada: true,
                });
            }
            await usuario.save();
            const restantes = MAX_INTENTOS - usuario.intentosFallidos;
            return res.status(401).json({
                error: `Correo o contraseña incorrectos. Te quedan ${restantes} intento${restantes === 1 ? "" : "s"}.`,
                intentosRestantes: restantes,
            });
        }

        usuario.intentosFallidos = 0;
        usuario.bloqueadoHasta = undefined;
        await usuario.save();

        crearSesion(res, usuario, recordar === true);
        res.json(usuario.toPublico());
    } catch (err) {
        next(err);
    }
});

// POST /api/auth/google -> registrarse / iniciar sesión con Google
router.post("/google", async (req, res, next) => {
    try {
        const clientId = process.env.GOOGLE_CLIENT_ID;
        if (!clientId) {
            return res.status(503).json({ error: "El inicio con Google no está configurado (falta GOOGLE_CLIENT_ID)" });
        }
        const { credential } = req.body ?? {};
        if (!credential) return res.status(400).json({ error: "Falta la credencial de Google" });

        // Google valida la firma del token y regresa sus datos
        const respuesta = await fetch(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
        const datos = await respuesta.json().catch(() => ({}));
        if (!respuesta.ok || datos.aud !== clientId || datos.email_verified !== "true") {
            return res.status(401).json({ error: "No se pudo validar la cuenta de Google" });
        }

        let usuario = await Usuario.findOne({ $or: [{ googleId: datos.sub }, { correo: normalizarCorreo(datos.email) }] });
        if (!usuario) {
            const base = (datos.given_name || datos.email.split("@")[0]).replace(/[^\p{L}\p{N}_]/gu, "").slice(0, 16) || "Gamer";
            let apodo = base.length >= 3 ? base : `${base}Gamer`;
            while (await buscarPorApodo(apodo)) apodo = `${base}${Math.floor(Math.random() * 10000)}`;
            usuario = await Usuario.create({
                apodo,
                nombre: datos.name,
                correo: datos.email,
                googleId: datos.sub,
                verificado: true,
                avatar: datos.picture,
            });
        } else if (!usuario.googleId) {
            usuario.googleId = datos.sub;
            usuario.verificado = true;
            await usuario.save();
        }

        crearSesion(res, usuario, true);
        res.json(usuario.toPublico());
    } catch (err) {
        next(err);
    }
});

// POST /api/auth/recuperar -> envía el enlace para restablecer la contraseña
router.post("/recuperar", async (req, res, next) => {
    try {
        const correo = normalizarCorreo(req.body?.correo);
        if (!CORREO_VALIDO.test(correo)) {
            return res.status(400).json({ error: "Ingresa un correo válido" });
        }
        const respuesta = { mensaje: "Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña." };

        const usuario = await Usuario.findOne({ correo });
        if (usuario) {
            const { token, hash } = nuevoToken();
            usuario.tokenRecuperacion = hash;
            usuario.recuperacionExpira = new Date(Date.now() + 60 * 60000); // 1 hora
            await usuario.save();
            const enlace = `${urlBase(req)}/components/iniciarSesion.html?token=${token}`;
            await enviarCorreo({
                para: usuario.correo,
                asunto: "Restablece tu contraseña de Playnett",
                texto: `Hola ${usuario.apodo}, crea una nueva contraseña aquí (vence en 1 hora):\n${enlace}`,
            });
            if (modoDemo) respuesta.enlaceDemo = enlace;
        }
        res.json(respuesta);
    } catch (err) {
        next(err);
    }
});

// POST /api/auth/restablecer -> crear nueva contraseña con el token del correo
router.post("/restablecer", async (req, res, next) => {
    try {
        const { token, contrasena, confirmarContrasena } = req.body ?? {};
        if (!token) return res.status(400).json({ error: "Enlace inválido" });
        if (!CONTRASENA_SEGURA.test(contrasena ?? "")) {
            return res.status(400).json({ error: "La contraseña necesita 8+ caracteres, un número y un símbolo" });
        }
        if (contrasena !== confirmarContrasena) {
            return res.status(400).json({ error: "Las contraseñas no coinciden" });
        }
        const usuario = await Usuario.findOne({
            tokenRecuperacion: hashToken(token),
            recuperacionExpira: { $gt: new Date() },
        });
        if (!usuario) return res.status(400).json({ error: "El enlace es inválido o ya venció. Pide uno nuevo." });

        usuario.contrasena = contrasena;
        usuario.tokenRecuperacion = undefined;
        usuario.recuperacionExpira = undefined;
        usuario.intentosFallidos = 0;
        usuario.bloqueadoHasta = undefined;
        await usuario.save();
        res.json({ mensaje: "Tu contraseña se actualizó. Ya puedes iniciar sesión." });
    } catch (err) {
        next(err);
    }
});

// POST /api/auth/logout
router.post("/logout", (req, res) => {
    res.clearCookie(COOKIE);
    res.json({ ok: true });
});

// GET /api/auth/yo -> usuario de la sesión actual (o null)
router.get("/yo", (req, res) => {
    res.json(req.usuario ? req.usuario.toPublico() : null);
});

export default router;
