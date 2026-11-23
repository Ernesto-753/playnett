import { Router } from "express";
import mongoose from "mongoose";
import Videojuego, { descuentoVigente } from "../models/Videojuego.js";
import { requiereSesion } from "../middleware/auth.js";

const router = Router();
router.use(requiereSesion);

// Forma en la que se manda un juego a las tarjetas
export function juegoParaTarjeta(juego, usuario) {
    const datos = juego.toJSON();
    return {
        ...datos,
        id: juego._id,
        descuento: juego.descuentoActual,
        enBiblioteca: usuario ? usuario.tieneJuego(juego._id) : false,
    };
}

// GET /api/favoritos -> juegos favoritos del usuario (con populate)
router.get("/", async (req, res, next) => {
    try {
        await req.usuario.populate("favoritos");
        res.json(req.usuario.favoritos.filter(Boolean).map((j) => juegoParaTarjeta(j, req.usuario)));
    } catch (err) {
        next(err);
    }
});

// GET /api/favoritos/avisos -> favoritos que entraron en oferta desde la última vez que se revisó
router.get("/avisos", async (req, res, next) => {
    try {
        const juegos = await Videojuego.find({ _id: { $in: req.usuario.favoritos } });
        const avisos = [];
        for (const juego of juegos) {
            const id = juego._id.toString();
            const actual = descuentoVigente(juego);
            const visto = req.usuario.ofertasVistas.get(id) ?? 0;
            if (actual > visto) {
                avisos.push({ id, titulo: juego.titulo, descuento: actual, precioFinal: juego.precioFinal, ofertaFin: juego.ofertaFin });
            }
            // Se guarda lo visto; si la oferta terminó (0) se volverá a avisar en la siguiente
            if (actual !== visto) req.usuario.ofertasVistas.set(id, actual);
        }
        if (req.usuario.isModified("ofertasVistas")) await req.usuario.save();
        res.json(avisos);
    } catch (err) {
        next(err);
    }
});

// POST /api/favoritos/:id -> agregar
router.post("/:id", async (req, res, next) => {
    try {
        const { id } = req.params;
        const juego = mongoose.isValidObjectId(id) ? await Videojuego.findById(id) : null;
        if (!juego) return res.status(404).json({ error: "Videojuego no encontrado" });

        if (!req.usuario.favoritos.some((f) => f.equals(juego._id))) {
            req.usuario.favoritos.push(juego._id);
        }
        // La oferta que ya tiene al agregarlo no se avisa como nueva
        req.usuario.ofertasVistas.set(id, descuentoVigente(juego));
        await req.usuario.save();
        res.json({ favoritos: req.usuario.favoritos });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/favoritos/:id -> quitar
router.delete("/:id", async (req, res, next) => {
    try {
        const { id } = req.params;
        req.usuario.favoritos = req.usuario.favoritos.filter((f) => f.toString() !== id);
        req.usuario.ofertasVistas.delete(id);
        await req.usuario.save();
        res.json({ favoritos: req.usuario.favoritos });
    } catch (err) {
        next(err);
    }
});

export default router;
