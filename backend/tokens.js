import crypto from "node:crypto";

// Token aleatorio para enlaces de correo. En la base solo se guarda su hash.
export function nuevoToken() {
    const token = crypto.randomBytes(32).toString("hex");
    return { token, hash: hashToken(token) };
}

export function hashToken(token) {
    return crypto.createHash("sha256").update(String(token)).digest("hex");
}
