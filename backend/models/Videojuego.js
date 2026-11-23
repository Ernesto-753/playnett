import mongoose from "mongoose";

export const CATEGORIAS = ["Acción", "Aventura", "RPG", "Carreras", "Simulación", "Indie"];
export const PLATAFORMAS = ["PC", "Xbox", "PS5"];

const videojuegoSchema = new mongoose.Schema(
    {
        titulo: { type: String, required: true, trim: true },
        descripcion: { type: String, default: "" },
        categoria: { type: String, required: true, enum: CATEGORIAS },
        // En MongoDB las plataformas se guardan dentro del mismo documento (embebidas)
        plataformas: {
            type: [{ type: String, enum: PLATAFORMAS }],
            validate: (v) => v.length > 0,
        },
        precio: { type: Number, required: true, min: 0 }, // precio sin descuento, en MXN (IVA incluido)
        descuento: { type: Number, default: 0, min: 0, max: 100 }, // porcentaje
        ofertaInicio: { type: Date }, // si no hay fechas, la oferta está vigente siempre
        ofertaFin: { type: Date },
        portada: { type: String, required: true },
        portadaAlterna: { type: String }, // imagen que se alterna en la tarjeta (práctica 6)
        capturas: [{ type: String }],
        trailer: { type: String }, // URL de YouTube (embed). Si no hay, se enlaza a una búsqueda
        requisitos: {
            minimos: { type: String, default: "" },
            recomendados: { type: String, default: "" },
        },
        tamanoGB: { type: Number, default: 10, min: 0 }, // espacio que ocupa instalado
        popularidad: { type: Number, default: 0 },
    },
    {
        timestamps: true,
        toJSON: { virtuals: true },
    }
);

// Descuento que aplica ahora mismo (0 si la oferta no ha empezado o ya terminó)
export function descuentoVigente(juego, ahora = new Date()) {
    if (!juego.descuento) return 0;
    if (juego.ofertaInicio && new Date(juego.ofertaInicio) > ahora) return 0;
    if (juego.ofertaFin && new Date(juego.ofertaFin) <= ahora) return 0;
    return juego.descuento;
}

export function precioFinal(juego, ahora = new Date()) {
    return Math.floor(juego.precio * (1 - descuentoVigente(juego, ahora) / 100));
}

// Lo mismo pero como expresión de agregación, para filtrar y ordenar en MongoDB
export function expresionDescuentoVigente(ahora = new Date()) {
    return {
        $cond: [
            {
                $and: [
                    { $gt: ["$descuento", 0] },
                    { $or: [{ $not: ["$ofertaInicio"] }, { $lte: ["$ofertaInicio", ahora] }] },
                    { $or: [{ $not: ["$ofertaFin"] }, { $gt: ["$ofertaFin", ahora] }] },
                ],
            },
            "$descuento",
            0,
        ],
    };
}

videojuegoSchema.virtual("descuentoActual").get(function () {
    return descuentoVigente(this);
});

videojuegoSchema.virtual("precioFinal").get(function () {
    return precioFinal(this);
});

videojuegoSchema.virtual("enOferta").get(function () {
    return descuentoVigente(this) > 0;
});

export default mongoose.model("Videojuego", videojuegoSchema);
