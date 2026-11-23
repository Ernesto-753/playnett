import { Router } from "express";
import mongoose from "mongoose";
import Videojuego, { precioFinal } from "../models/Videojuego.js";
import { requiereSesion } from "../middleware/auth.js";
import { UNIDADES } from "../config/tienda.js";

const router = Router();
router.use(requiereSesion);

// Espacio de cada unidad según los juegos que el usuario tiene instalados ahí
async function calcularUnidades(usuario) {
    const instalados = usuario.biblioteca.filter((j) => j.instalado);
    const juegos = await Videojuego.find({ _id: { $in: instalados.map((j) => j.videojuego) } }, "tamanoGB");
    const tamano = Object.fromEntries(juegos.map((j) => [j._id.toString(), j.tamanoGB]));
    return UNIDADES.map((u) => {
        const deJuegos = instalados
            .filter((j) => j.ubicacion === u.id)
            .reduce((suma, j) => suma + (tamano[j.videojuego.toString()] || 0), 0);
        const usadoGB = Math.round((u.ocupadoGB + deJuegos) * 10) / 10;
        return { id: u.id, nombre: u.nombre, ruta: u.ruta, capacidadGB: u.capacidadGB, usadoGB, libreGB: Math.round((u.capacidadGB - usadoGB) * 10) / 10 };
    });
}

function entradaDe(usuario, id) {
    return usuario.biblioteca.find((j) => j.videojuego.toString() === id);
}

// GET /api/biblioteca -> juegos del usuario + unidades de disco
router.get("/", async (req, res, next) => {
    try {
        await req.usuario.populate("biblioteca.videojuego");
        const juegos = req.usuario.biblioteca
            .filter((j) => j.videojuego)
            .map((j) => ({
                id: j.videojuego._id,
                titulo: j.videojuego.titulo,
                portada: j.videojuego.portada,
                categoria: j.videojuego.categoria,
                tamanoGB: j.videojuego.tamanoGB,
                adquirido: j.adquirido,
                origen: j.origen,
                instalado: j.instalado,
                ubicacion: j.ubicacion ?? null,
                partidasEnNube: j.partidasEnNube,
            }));
        req.usuario.depopulate("biblioteca.videojuego");
        res.json({ juegos, unidades: await calcularUnidades(req.usuario) });
    } catch (err) {
        next(err);
    }
});

// POST /api/biblioteca/:id -> obtener juego gratis
router.post("/:id", async (req, res, next) => {
    try {
        const { id } = req.params;
        const juego = mongoose.isValidObjectId(id) ? await Videojuego.findById(id) : null;
        if (!juego) return res.status(404).json({ error: "Videojuego no encontrado" });
        if (precioFinal(juego) !== 0) return res.status(400).json({ error: "Este juego no es gratis" });
        if (req.usuario.tieneJuego(juego._id)) return res.status(409).json({ error: "Este juego ya está en tu biblioteca" });

        req.usuario.biblioteca.push({ videojuego: juego._id, origen: "gratis" });
        await req.usuario.save();
        res.status(201).json({ mensaje: `${juego.titulo} se agregó a tu biblioteca`, biblioteca: req.usuario.toPublico().biblioteca });
    } catch (err) {
        next(err);
    }
});

// Valida la ubicación y el espacio antes de instalar
async function validarInstalacion(req, res) {
    const entrada = entradaDe(req.usuario, req.params.id);
    if (!entrada) {
        res.status(404).json({ error: "Ese juego no está en tu biblioteca" });
        return null;
    }
    if (entrada.instalado) {
        res.status(409).json({ error: "El juego ya está instalado" });
        return null;
    }
    const unidades = await calcularUnidades(req.usuario);
    const unidad = unidades.find((u) => u.id === req.body?.ubicacion);
    if (!unidad) {
        res.status(400).json({ error: "Selecciona una ubicación de instalación" });
        return null;
    }
    const juego = await Videojuego.findById(entrada.videojuego, "titulo tamanoGB");
    if (juego.tamanoGB > unidad.libreGB) {
        res.status(409).json({
            error: `Espacio insuficiente en ${unidad.nombre}: se necesitan ${juego.tamanoGB} GB y hay ${unidad.libreGB} GB libres`,
            espacioInsuficiente: true,
        });
        return null;
    }
    return { entrada, unidad, juego };
}

// POST /api/biblioteca/:id/verificar-espacio
router.post("/:id/verificar-espacio", async (req, res, next) => {
    try {
        const valida = await validarInstalacion(req, res);
        if (!valida) return;
        res.json({ ok: true, tamanoGB: valida.juego.tamanoGB, libreGB: valida.unidad.libreGB });
    } catch (err) {
        next(err);
    }
});

// PUT /api/biblioteca/:id/instalacion -> la descarga y la verificación terminaron
router.put("/:id/instalacion", async (req, res, next) => {
    try {
        const valida = await validarInstalacion(req, res);
        if (!valida) return;
        valida.entrada.instalado = true;
        valida.entrada.ubicacion = valida.unidad.id;
        valida.entrada.partidasEnNube = true;
        await req.usuario.save();
        res.json({ mensaje: `${valida.juego.titulo} se instaló correctamente`, unidades: await calcularUnidades(req.usuario) });
    } catch (err) {
        next(err);
    }
});

// DELETE /api/biblioteca/:id/instalacion?conservarPartidas=1 -> desinstalar
router.delete("/:id/instalacion", async (req, res, next) => {
    try {
        const entrada = entradaDe(req.usuario, req.params.id);
        if (!entrada || !entrada.instalado) {
            return res.status(404).json({ error: "Ese juego no está instalado" });
        }
        const juego = await Videojuego.findById(entrada.videojuego, "titulo tamanoGB");
        entrada.instalado = false;
        entrada.ubicacion = undefined;
        // Conservar partidas guardadas en la nube (opcional)
        if (req.query.conservarPartidas !== "1") entrada.partidasEnNube = false;
        await req.usuario.save();
        res.json({
            mensaje: `${juego.titulo} se desinstaló. Se liberaron ${juego.tamanoGB} GB`,
            unidades: await calcularUnidades(req.usuario),
        });
    } catch (err) {
        next(err);
    }
});

export default router;
