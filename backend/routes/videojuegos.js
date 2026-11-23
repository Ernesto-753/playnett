import { Router } from "express";
import mongoose from "mongoose";
import Videojuego, { CATEGORIAS, expresionDescuentoVigente } from "../models/Videojuego.js";
import Resena from "../models/Resena.js";
import { requiereSesion } from "../middleware/auth.js";

const router = Router();

const RANGOS_PRECIO = {
    gratis: { $eq: 0 },
    menos400: { $gt: 0, $lt: 400 },
    "400a800": { $gte: 400, $lte: 800 },
    mas800: { $gt: 800 },
};

const ORDENES = {
    populares: { popularidad: -1 },
    precio_asc: { precioFinal: 1 },
    precio_desc: { precioFinal: -1 },
    recientes: { createdAt: -1 },
    descuento: { descuentoActual: -1, popularidad: -1 },
};

const escaparRegex = (texto) => texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// GET /api/videojuegos?q=&categoria=&precio=&oferta=1&orden=&pagina=1&limite=6
router.get("/", async (req, res, next) => {
    try {
        const { q, categoria, precio, oferta, orden } = req.query;
        const pagina = Math.max(1, parseInt(req.query.pagina) || 1);
        const limite = Math.min(48, Math.max(1, parseInt(req.query.limite) || 6));

        const filtro = {};
        if (q && typeof q === "string" && q.trim()) {
            filtro.titulo = { $regex: escaparRegex(q.trim()), $options: "i" };
        }
        if (CATEGORIAS.includes(categoria)) filtro.categoria = categoria;

        // Pipeline de agregación: calcula el descuento vigente (según las fechas de la oferta)
        // y el precio final en la base de datos para poder filtrar y ordenar por ellos.
        const pipeline = [
            { $match: filtro },
            { $addFields: { descuentoActual: expresionDescuentoVigente() } },
            {
                $addFields: {
                    precioFinal: {
                        $floor: { $multiply: ["$precio", { $subtract: [1, { $divide: ["$descuentoActual", 100] }] }] },
                    },
                },
            },
        ];
        if (oferta === "1") pipeline.push({ $match: { descuentoActual: { $gt: 0 } } });
        if (RANGOS_PRECIO[precio]) pipeline.push({ $match: { precioFinal: RANGOS_PRECIO[precio] } });

        pipeline.push({
            $facet: {
                juegos: [
                    { $sort: { ...(ORDENES[orden] || ORDENES.populares), _id: 1 } },
                    { $skip: (pagina - 1) * limite },
                    { $limit: limite },
                    {
                        $project: {
                            titulo: 1, categoria: 1, plataformas: 1, precio: 1, portada: 1, portadaAlterna: 1,
                            ofertaFin: 1, descuentoActual: 1, precioFinal: 1, popularidad: 1, createdAt: 1,
                            id: "$_id",
                            descuento: "$descuentoActual",
                            enOferta: { $gt: ["$descuentoActual", 0] },
                        },
                    },
                ],
                total: [{ $count: "n" }],
            },
        });

        const [resultado] = await Videojuego.aggregate(pipeline);
        const total = resultado.total[0]?.n || 0;

        res.json({
            juegos: resultado.juegos,
            total,
            pagina,
            paginas: Math.max(1, Math.ceil(total / limite)),
        });
    } catch (err) {
        next(err);
    }
});

// GET /api/videojuegos/categorias?oferta=1 -> cuántos juegos hay en cada categoría
router.get("/categorias", async (req, res, next) => {
    try {
        const pipeline = [];
        if (req.query.oferta === "1") {
            pipeline.push(
                { $addFields: { descuentoActual: expresionDescuentoVigente() } },
                { $match: { descuentoActual: { $gt: 0 } } }
            );
        }
        pipeline.push({ $group: { _id: "$categoria", total: { $sum: 1 } } });
        const conteo = await Videojuego.aggregate(pipeline);
        const porCategoria = Object.fromEntries(conteo.map((c) => [c._id, c.total]));
        res.json({
            total: conteo.reduce((suma, c) => suma + c.total, 0),
            categorias: CATEGORIAS.map((nombre) => ({ nombre, total: porCategoria[nombre] || 0 })),
        });
    } catch (err) {
        next(err);
    }
});

async function buscarJuego(req, res) {
    const { id } = req.params;
    const juego = mongoose.isValidObjectId(id) ? await Videojuego.findById(id) : null;
    if (!juego) res.status(404).json({ error: "Videojuego no encontrado" });
    return juego;
}

// GET /api/videojuegos/:id -> detalle (con el estado del usuario si hay sesión)
router.get("/:id", async (req, res, next) => {
    try {
        const juego = await buscarJuego(req, res);
        if (!juego) return;
        const datos = juego.toJSON();
        datos.descuento = juego.descuentoActual; // el descuento que se muestra es el vigente
        if (req.usuario) {
            datos.esFavorito = req.usuario.favoritos.some((f) => f.equals(juego._id));
            datos.enBiblioteca = req.usuario.tieneJuego(juego._id);
        }
        res.json(datos);
    } catch (err) {
        next(err);
    }
});

// GET /api/videojuegos/:id/resenas -> reseñas de otros jugadores
router.get("/:id/resenas", async (req, res, next) => {
    try {
        const juego = await buscarJuego(req, res);
        if (!juego) return;
        const resenas = await Resena.find({ videojuego: juego._id })
            .sort({ createdAt: -1 })
            .populate("usuario", "apodo avatar");
        const total = resenas.length;
        const promedio = total ? resenas.reduce((s, r) => s + r.calificacion, 0) / total : 0;
        res.json({
            total,
            promedio: Math.round(promedio * 10) / 10,
            resenas: resenas.map((r) => ({
                id: r._id,
                apodo: r.usuario?.apodo ?? "Usuario eliminado",
                avatar: r.usuario?.avatar ?? null,
                calificacion: r.calificacion,
                comentario: r.comentario,
                fecha: r.createdAt,
                mia: Boolean(req.usuario && r.usuario?._id.equals(req.usuario._id)),
            })),
        });
    } catch (err) {
        next(err);
    }
});

// POST /api/videojuegos/:id/resenas -> escribir / actualizar mi reseña (solo juegos de mi biblioteca)
router.post("/:id/resenas", requiereSesion, async (req, res, next) => {
    try {
        const juego = await buscarJuego(req, res);
        if (!juego) return;
        if (!req.usuario.tieneJuego(juego._id)) {
            return res.status(403).json({ error: "Solo puedes reseñar juegos que están en tu biblioteca" });
        }
        const calificacion = Number(req.body?.calificacion);
        const comentario = String(req.body?.comentario ?? "").trim();
        if (!Number.isInteger(calificacion) || calificacion < 1 || calificacion > 5) {
            return res.status(400).json({ error: "La calificación va de 1 a 5 estrellas" });
        }
        if (comentario.length < 3) {
            return res.status(400).json({ error: "Escribe un comentario" });
        }
        const resena = await Resena.findOneAndUpdate(
            { videojuego: juego._id, usuario: req.usuario._id },
            { calificacion, comentario },
            { upsert: true, returnDocument: "after", runValidators: true }
        );
        res.status(201).json({ id: resena._id });
    } catch (err) {
        next(err);
    }
});

export default router;
