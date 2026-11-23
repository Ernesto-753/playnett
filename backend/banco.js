// Pasarela de pago SIMULADA (no se cobra nada de verdad).
// Hace las mismas validaciones que haría un banco y rechaza las tarjetas / cuentas de prueba:
//   Tarjeta aprobada:   4242 4242 4242 4242 (cualquier fecha futura y CVV)
//   Tarjeta rechazada:  4000 0000 0000 0002
//   PayPal rechazado:   rechazado@paypal.com
import { CORREO_VALIDO } from "./config/tienda.js";

const TARJETAS_RECHAZADAS = new Set(["4000000000000002"]);

function luhn(numero) {
    let suma = 0;
    for (let i = 0; i < numero.length; i++) {
        let d = Number(numero[numero.length - 1 - i]);
        if (i % 2 === 1) {
            d *= 2;
            if (d > 9) d -= 9;
        }
        suma += d;
    }
    return suma % 10 === 0;
}

function marca(numero) {
    if (/^4/.test(numero)) return "Visa";
    if (/^(5[1-5]|2[2-7])/.test(numero)) return "Mastercard";
    if (/^3[47]/.test(numero)) return "American Express";
    return "Tarjeta";
}

// Regresa { aprobado, detalle } o { aprobado: false, error }
export function validarPago(metodo = {}, ahora = new Date()) {
    if (metodo.tipo === "tarjeta") {
        const numero = String(metodo.numero ?? "").replace(/[\s-]/g, "");
        const titular = String(metodo.titular ?? "").trim();
        const [mes, anio] = String(metodo.vencimiento ?? "").split("/").map((n) => parseInt(n, 10));
        const cvv = String(metodo.cvv ?? "");

        if (!titular) return { aprobado: false, error: "Escribe el nombre del titular" };
        if (!/^\d{13,19}$/.test(numero) || !luhn(numero)) return { aprobado: false, error: "El número de tarjeta no es válido" };
        if (!mes || mes < 1 || mes > 12 || Number.isNaN(anio)) return { aprobado: false, error: "La fecha de vencimiento no es válida (MM/AA)" };
        const finDeMes = new Date(Date.UTC(2000 + anio, mes, 1));
        if (finDeMes <= ahora) return { aprobado: false, error: "La tarjeta está vencida" };
        if (!/^\d{3,4}$/.test(cvv)) return { aprobado: false, error: "El CVV no es válido" };
        if (TARJETAS_RECHAZADAS.has(numero)) return { aprobado: false, error: "Pago rechazado por el banco: fondos insuficientes", rechazado: true };

        return { aprobado: true, detalle: `${marca(numero)} •••• ${numero.slice(-4)}` };
    }

    if (metodo.tipo === "paypal") {
        const correo = String(metodo.correo ?? "").trim().toLowerCase();
        if (!CORREO_VALIDO.test(correo)) return { aprobado: false, error: "Escribe el correo de tu cuenta PayPal" };
        if (correo === "rechazado@paypal.com") return { aprobado: false, error: "Pago rechazado por PayPal", rechazado: true };
        return { aprobado: true, detalle: `PayPal (${correo})` };
    }

    return { aprobado: false, error: "Selecciona un método de pago" };
}
