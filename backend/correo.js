// Envío de correos.
// No hay un servidor SMTP configurado, así que el correo se imprime en la consola del servidor.
// Fuera de producción, la API también regresa el enlace (enlaceDemo) para poder probar el flujo.

export const modoDemo = process.env.NODE_ENV !== "production";

export function urlBase(req) {
    return process.env.URL_PUBLICA || `${req.protocol}://${req.get("host")}`;
}

export async function enviarCorreo({ para, asunto, texto }) {
    if (process.env.NODE_ENV === "test") return;
    console.log(
        ["", "========== CORREO ==========", `Para: ${para}`, `Asunto: ${asunto}`, "", texto, "============================", ""].join("\n")
    );
}
