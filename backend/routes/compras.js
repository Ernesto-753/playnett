import { Router } from "express";
import crypto from "node:crypto";
import mongoose from "mongoose";
import Videojuego, { descuentoVigente, precioFinal } from "../models/Videojuego.js";
import Pedido from "../models/Pedido.js";
import { requiereSesion } from "../middleware/auth.js";
import { CODIGOS_PROMO, IVA } from "../config/tienda.js";
import { validarPago } from "../banco.js";
import { enviarCorreo } from "../correo.js";

const router = Router();
router.use(requiereSesion);

const redondear = (n) => Math.round(n * 100) / 100;
const formato = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" });

// Calcula el total con el descuento de la oferta, el código promocional y el IVA (ya incluido)
export function calcularTotal(juego, codigo) {
    const descuento = descuentoVigente(juego);
    const conOferta = precioFinal(juego);
    const codigoLimpio = String(codigo ?? "").trim().toUpperCase();
    const descuentoPromo = codigoLimpio ? CODIGOS_PROMO[codigoLimpio] : 0;
    if (codigoLimpio && !descuentoPromo) return { error: "El código promocional no es válido" };

    const total = redondear(conOferta * (1 - (descuentoPromo || 0) / 100));
    const subtotal = redondear(total / (1 + IVA));
    return {
        precio: juego.precio,
        descuento,
        precioConOferta: conOferta,
        codigoPromo: descuentoPromo ? codigoLimpio : null,
        descuentoPromo: descuentoPromo || 0,
        ahorroPromo: redondear(conOferta - total),
        subtotal,
        iva: redondear(total - subtotal),
        total,
    };
}

async function prepararCompra(req, res) {
    const { videojuego, codigo } = req.body ?? {};
    const juego = mongoose.isValidObjectId(videojuego) ? await Videojuego.findById(videojuego) : null;
    if (!juego) {
        res.status(404).json({ error: "Videojuego no encontrado" });
        return null;
    }
    // Verificar que el juego no esté en la biblioteca
    if (req.usuario.tieneJuego(juego._id)) {
        res.status(409).json({ error: "Este juego ya está en tu biblioteca", enBiblioteca: true });
        return null;
    }
    if (precioFinal(juego) === 0) {
        res.status(400).json({ error: "Este juego es gratis: usa «Obtener gratis»" });
        return null;
    }
    const resumen = calcularTotal(juego, codigo);
    if (resumen.error) {
        res.status(400).json({ error: resumen.error, campo: "codigo" });
        return null;
    }
    return { juego, resumen };
}

// POST /api/compras/resumen -> resumen de compra (y validar el código promocional)
router.post("/resumen", async (req, res, next) => {
    try {
        const preparada = await prepararCompra(req, res);
        if (!preparada) return;
        const { juego, resumen } = preparada;
        res.json({ juego: { id: juego._id, titulo: juego.titulo, portada: juego.portada, categoria: juego.categoria }, ...resumen });
    } catch (err) {
        next(err);
    }
});

// POST /api/compras -> confirmar pago
router.post("/", async (req, res, next) => {
    try {
        const preparada = await prepararCompra(req, res);
        if (!preparada) return;
        const { juego, resumen } = preparada;

        // Validar pago con el banco (simulado)
        const pago = validarPago(req.body.metodoPago);
        if (!pago.aprobado) {
            return res.status(402).json({ error: pago.error, rechazado: Boolean(pago.rechazado) });
        }

        const codigoActivacion = crypto.randomBytes(8).toString("hex").toUpperCase().match(/.{4}/g).join("-");
        const pedido = await Pedido.create({
            usuario: req.usuario._id,
            videojuego: juego._id,
            titulo: juego.titulo,
            precio: resumen.precio,
            descuento: resumen.descuento,
            codigoPromo: resumen.codigoPromo ?? undefined,
            descuentoPromo: resumen.descuentoPromo,
            subtotal: resumen.subtotal,
            iva: resumen.iva,
            total: resumen.total,
            metodoPago: { tipo: req.body.metodoPago.tipo, detalle: pago.detalle },
            codigoActivacion,
        });

        // Agregar juego a la biblioteca
        req.usuario.biblioteca.push({ videojuego: juego._id, origen: "compra" });
        await req.usuario.save();

        // Enviar comprobante al correo
        await enviarCorreo({
            para: req.usuario.correo,
            asunto: `Comprobante de compra: ${juego.titulo}`,
            texto: [
                `Gracias por tu compra, ${req.usuario.apodo}.`,
                `Pedido: ${pedido._id}`,
                `Juego: ${juego.titulo}`,
                `Subtotal: ${formato.format(resumen.subtotal)}`,
                `IVA (16 %): ${formato.format(resumen.iva)}`,
                `Total: ${formato.format(resumen.total)}`,
                `Pago: ${pago.detalle}`,
                `Código de activación: ${codigoActivacion}`,
            ].join("\n"),
        });

        res.status(201).json({
            pedido,
            mensaje: `Compra realizada. Enviamos el comprobante a ${req.usuario.correo}`,
        });
    } catch (err) {
        next(err);
    }
});

// GET /api/compras -> historial de compras del usuario
router.get("/", async (req, res, next) => {
    try {
        const pedidos = await Pedido.find({ usuario: req.usuario._id }).sort({ createdAt: -1 });
        res.json(pedidos);
    } catch (err) {
        next(err);
    }
});

export default router;
