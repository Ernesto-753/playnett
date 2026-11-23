import jwt from "jsonwebtoken";
import Usuario from "../models/Usuario.js";

export const COOKIE = "playnett_sesion";

export function secreto() {
    if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
    if (process.env.NODE_ENV === "production") {
        throw new Error("Falta JWT_SECRET en las variables de entorno");
    }
    return "secreto-solo-para-desarrollo";
}

const DIA = 24 * 60 * 60 * 1000;

// recordar = true  -> la cookie dura 30 días aunque se cierre el navegador
// recordar = false -> cookie de sesión: se borra al cerrar el navegador
export function crearSesion(res, usuario, recordar = false) {
    const token = jwt.sign({ id: usuario._id.toString() }, secreto(), { expiresIn: recordar ? "30d" : "1d" });
    res.cookie(COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        ...(recordar ? { maxAge: 30 * DIA } : {}),
    });
}

// Si hay sesión, deja el usuario en req.usuario; si no, sigue sin él
export async function sesionOpcional(req, res, next) {
    const token = req.cookies?.[COOKIE];
    if (!token) return next();
    try {
        const { id } = jwt.verify(token, secreto());
        req.usuario = await Usuario.findById(id);
        if (!req.usuario) res.clearCookie(COOKIE);
    } catch {
        res.clearCookie(COOKIE);
    }
    next();
}

export function requiereSesion(req, res, next) {
    if (!req.usuario) {
        return res.status(401).json({ error: "Inicia sesión para continuar" });
    }
    next();
}
