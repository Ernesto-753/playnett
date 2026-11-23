import mongoose from "mongoose";
import bcrypt from "bcryptjs";

// Un juego dentro de la biblioteca del usuario (embebido en el usuario)
const juegoBibliotecaSchema = new mongoose.Schema(
    {
        videojuego: { type: mongoose.Schema.Types.ObjectId, ref: "Videojuego", required: true },
        adquirido: { type: Date, default: Date.now },
        origen: { type: String, enum: ["compra", "gratis"], required: true },
        instalado: { type: Boolean, default: false },
        ubicacion: { type: String }, // id de la unidad donde está instalado
        partidasEnNube: { type: Boolean, default: false },
    },
    { _id: false }
);

const usuarioSchema = new mongoose.Schema(
    {
        nombre: { type: String, trim: true },
        apodo: { type: String, required: true, trim: true, minlength: 3, maxlength: 24, unique: true },
        fechaNacimiento: { type: Date },
        edad: { type: Number, min: 13 }, // cuentas antiguas (antes se pedía la edad)
        correo: { type: String, required: true, trim: true, lowercase: true, unique: true },
        contrasena: { type: String, select: false }, // se guarda cifrada; vacía en cuentas de Google
        googleId: { type: String, index: true, sparse: true },
        avatar: { type: String }, // imagen en data URL (pequeña)
        rol: { type: String, enum: ["gamer", "admin"], default: "gamer" },

        // Verificación de correo y recuperación de contraseña (se guarda el hash del token)
        verificado: { type: Boolean, default: false },
        tokenVerificacion: { type: String, select: false },
        tokenRecuperacion: { type: String, select: false },
        recuperacionExpira: { type: Date, select: false },

        // Bloqueo tras 5 intentos fallidos
        intentosFallidos: { type: Number, default: 0, select: false },
        bloqueadoHasta: { type: Date, select: false },

        // Referencias a los videojuegos favoritos
        favoritos: [{ type: mongoose.Schema.Types.ObjectId, ref: "Videojuego" }],
        // Último descuento que el usuario ya vio de cada favorito (para avisar de ofertas nuevas)
        ofertasVistas: { type: Map, of: Number, default: {} },

        biblioteca: [juegoBibliotecaSchema],
    },
    { timestamps: true }
);

usuarioSchema.pre("save", async function () {
    if (this.isModified("contrasena") && this.contrasena) {
        this.contrasena = await bcrypt.hash(this.contrasena, 10);
    }
});

usuarioSchema.methods.compararContrasena = function (contrasena) {
    if (!this.contrasena) return false;
    return bcrypt.compare(contrasena, this.contrasena);
};

usuarioSchema.methods.tieneJuego = function (idJuego) {
    return this.biblioteca.some((j) => j.videojuego.toString() === idJuego.toString());
};

usuarioSchema.methods.toPublico = function () {
    return {
        id: this._id,
        nombre: this.nombre,
        apodo: this.apodo,
        correo: this.correo,
        rol: this.rol,
        avatar: this.avatar || null,
        verificado: this.verificado,
        cuentaGoogle: Boolean(this.googleId),
        favoritos: this.favoritos,
        biblioteca: this.biblioteca.map((j) => j.videojuego),
    };
};

export default mongoose.model("Usuario", usuarioSchema);
