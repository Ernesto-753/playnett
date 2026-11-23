import mongoose from "mongoose";

// Pedido = una compra ya pagada (ver diagrama de clases)
const pedidoSchema = new mongoose.Schema(
    {
        usuario: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario", required: true, index: true },
        videojuego: { type: mongoose.Schema.Types.ObjectId, ref: "Videojuego", required: true },
        titulo: { type: String, required: true }, // copia del título al momento de comprar
        precio: { type: Number, required: true }, // precio de lista
        descuento: { type: Number, default: 0 }, // % de la oferta
        codigoPromo: { type: String },
        descuentoPromo: { type: Number, default: 0 }, // % del código promocional
        subtotal: { type: Number, required: true }, // sin IVA
        iva: { type: Number, required: true },
        total: { type: Number, required: true },
        metodoPago: {
            tipo: { type: String, enum: ["tarjeta", "paypal"], required: true },
            detalle: { type: String, required: true }, // "Visa •••• 4242" o el correo de PayPal (nunca la tarjeta completa)
        },
        estado: { type: String, enum: ["pagado"], default: "pagado" },
        codigoActivacion: { type: String, required: true },
    },
    { timestamps: true }
);

export default mongoose.model("Pedido", pedidoSchema);
