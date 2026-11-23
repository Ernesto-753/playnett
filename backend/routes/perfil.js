import { Router } from "express";
import Usuario from "../models/Usuario.js";
import { requiereSesion } from "../middleware/auth.js";
import { CONTRASENA_SEGURA } from "../config/tienda.js";

const router = Router();
router.use(requiereSesion);

const escaparRegex = (texto) => texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const AVATAR_VALIDO = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;
const MAX_AVATAR = 300 * 1024; // ~300 KB en base64

// PATCH /api/perfil -> cambiar nombre de usuario y/o foto de perfil
router.patch("/", async (req, res, next) => {
    try {
        const { apodo, avatar } = req.body ?? {};

        if (apodo !== undefined) {
            const limpio = String(apodo).trim();
            if (limpio.length < 3 || limpio.length > 24) {
                return res.status(400).json({ error: "El nombre de usuario debe tener entre 3 y 24 caracteres" });
            }
            const otro = await Usuario.findOne({
                apodo: { $regex: `^${escaparRegex(limpio)}$`, $options: "i" },
                _id: { $ne: req.usuario._id },
            });
            if (otro) return res.status(409).json({ error: "Ese nombre de usuario ya está en uso" });
            req.usuario.apodo = limpio;
        }

        if (avatar !== undefined) {
            if (avatar === null) {
                req.usuario.avatar = undefined;
            } else if (typeof avatar !== "string" || !AVATAR_VALIDO.test(avatar)) {
                return res.status(400).json({ error: "La foto debe ser una imagen PNG, JPG, WEBP o GIF" });
            } else if (avatar.length > MAX_AVATAR) {
                return res.status(413).json({ error: "La foto es demasiado grande" });
            } else {
                req.usuario.avatar = avatar;
            }
        }

        await req.usuario.save();
        res.json(req.usuario.toPublico());
    } catch (err) {
        next(err);
    }
});

// PUT /api/perfil/contrasena -> cambiar contraseña
router.put("/contrasena", async (req, res, next) => {
    try {
        const { actual, nueva, confirmar } = req.body ?? {};
        const usuario = await Usuario.findById(req.usuario._id).select("+contrasena");

        // Validar contraseña actual (las cuentas de Google sin contraseña pueden crear una)
        if (usuario.contrasena && !(await usuario.compararContrasena(actual ?? ""))) {
            return res.status(401).json({ error: "La contraseña actual no es correcta", campo: "actual" });
        }
        // Validar seguridad de la nueva contraseña
        if (!CONTRASENA_SEGURA.test(nueva ?? "")) {
            return res.status(400).json({ error: "La nueva contraseña necesita 8+ caracteres, un número y un símbolo", campo: "nueva" });
        }
        if (nueva !== confirmar) {
            return res.status(400).json({ error: "Las contraseñas no coinciden", campo: "confirmar" });
        }
        usuario.contrasena = nueva;
        await usuario.save();
        res.json({ mensaje: "Tu contraseña se actualizó" });
    } catch (err) {
        next(err);
    }
});

export default router;
