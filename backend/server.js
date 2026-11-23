import { conectarDB } from "./db.js";
import { crearApp } from "./app.js";

const PORT = process.env.PORT || 3000;

conectarDB()
    .then(() => crearApp().listen(PORT, () => console.log(`Playnett en http://localhost:${PORT}`)))
    .catch((err) => {
        console.error("No se pudo conectar a MongoDB:", err.message);
        process.exit(1);
    });
