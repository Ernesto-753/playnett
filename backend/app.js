import express from "express";
import cookieParser from "cookie-parser";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sesionOpcional } from "./middleware/auth.js";
import videojuegosRouter from "./routes/videojuegos.js";
import authRouter from "./routes/auth.js";
import favoritosRouter from "./routes/favoritos.js";
import comprasRouter from "./routes/compras.js";
import bibliotecaRouter from "./routes/biblioteca.js";
import perfilRouter from "./routes/perfil.js";

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function crearApp() {
    const app = express();

    app.use(express.json({ limit: "1mb" })); // 1 MB para poder subir la foto de perfil
    app.use(cookieParser());
    app.use(sesionOpcional);

    // ===== API =====
    app.use("/api/videojuegos", videojuegosRouter);
    app.use("/api/auth", authRouter);
    app.use("/api/favoritos", favoritosRouter);
    app.use("/api/compras", comprasRouter);
    app.use("/api/biblioteca", bibliotecaRouter);
    app.use("/api/perfil", perfilRouter);
    app.use("/api", (req, res) => res.status(404).json({ error: "Ruta no encontrada" }));

    // ===== Frontend =====
    // Solo se sirven los archivos del sitio; backend/, node_modules/ y .env no quedan expuestos.
    app.use("/img", express.static(path.join(raiz, "img")));
    app.use("/js", express.static(path.join(raiz, "js")));
    app.use("/components", express.static(path.join(raiz, "components")));
    for (const archivo of ["index.html", "script.js", "styles.css"]) {
        app.get(`/${archivo}`, (req, res) => res.sendFile(path.join(raiz, archivo)));
    }
    app.get("/", (req, res) => res.sendFile(path.join(raiz, "index.html")));

    // ===== Errores =====
    app.use((err, req, res, next) => {
        if (err.name === "ValidationError" || err.name === "CastError") {
            return res.status(400).json({ error: "Datos inválidos" });
        }
        if (err.type === "entity.parse.failed") {
            return res.status(400).json({ error: "JSON inválido" });
        }
        if (err.type === "entity.too.large") {
            return res.status(413).json({ error: "El archivo es demasiado grande" });
        }
        console.error(err);
        res.status(500).json({ error: "Error del servidor" });
    });

    return app;
}
