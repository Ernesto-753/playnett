import mongoose from "mongoose";

const resenaSchema = new mongoose.Schema(
    {
        videojuego: { type: mongoose.Schema.Types.ObjectId, ref: "Videojuego", required: true },
        usuario: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario", required: true },
        calificacion: { type: Number, required: true, min: 1, max: 5 },
        comentario: { type: String, required: true, trim: true, maxlength: 600 },
    },
    { timestamps: true }
);

// Una reseña por usuario y juego
resenaSchema.index({ videojuego: 1, usuario: 1 }, { unique: true });

export default mongoose.model("Resena", resenaSchema);
