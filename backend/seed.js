// Llena la base de datos con los videojuegos del catálogo, una cuenta demo y algunas reseñas.
// Uso: npm run seed
// Se puede correr varias veces: actualiza los juegos por título sin cambiar sus ids
// (así no se rompen los favoritos ni las bibliotecas de los usuarios).
import mongoose from "mongoose";
import crypto from "node:crypto";
import { conectarDB } from "./db.js";
import Videojuego from "./models/Videojuego.js";
import Usuario from "./models/Usuario.js";
import Resena from "./models/Resena.js";

const DIA = 24 * 60 * 60 * 1000;
const enDias = (n) => new Date(Date.now() + n * DIA);

const REQ_LIGEROS = {
    minimos: "SO: Windows 10 · CPU: Intel Core 2 Duo · RAM: 4 GB · GPU: GeForce 9800 GTX",
    recomendados: "SO: Windows 11 · CPU: Intel Core i5 · RAM: 8 GB · GPU: GeForce GTX 1050",
};

export const juegos = [
    {
        titulo: "Forza Horizon 5",
        descripcion: "Carreras de mundo abierto por los paisajes de México: selvas, desiertos, volcanes y ciudades coloniales. Más de 500 autos y estaciones que cambian cada semana.",
        categoria: "Carreras",
        plataformas: ["PC", "Xbox"],
        precio: 1199,
        descuento: 50,
        ofertaFin: enDias(10),
        portada: "img/ForzaHorizon5.jpg",
        capturas: ["img/ForzaHorizon5.jpg"],
        requisitos: {
            minimos: "SO: Windows 10 · CPU: Intel i5-4460 · RAM: 8 GB · GPU: GTX 970 · 110 GB",
            recomendados: "SO: Windows 11 · CPU: Intel i5-8400 · RAM: 16 GB · GPU: GTX 1070 · SSD 110 GB",
        },
        tamanoGB: 110,
        popularidad: 95,
    },
    {
        titulo: "Halo Infinite",
        descripcion: "El Jefe Maestro regresa en un shooter de ciencia ficción con campaña de mundo abierto y multijugador gratuito.",
        categoria: "Acción",
        plataformas: ["PC", "Xbox"],
        precio: 0,
        portada: "img/HaloInfinite.jpg",
        capturas: ["img/HaloInfinite.jpg"],
        requisitos: {
            minimos: "SO: Windows 10 · CPU: AMD Ryzen 5 1600 · RAM: 8 GB · GPU: RX 570 · 50 GB",
            recomendados: "SO: Windows 11 · CPU: Ryzen 7 3700X · RAM: 16 GB · GPU: RX 5700 XT · 50 GB",
        },
        tamanoGB: 50,
        popularidad: 90,
    },
    {
        titulo: "Elden Ring",
        descripcion: "RPG de acción en las Tierras Intermedias. Explora un mundo abierto lleno de peligros, crea tu personaje y enfréntate a semidioses.",
        categoria: "RPG",
        plataformas: ["PC", "Xbox", "PS5"],
        precio: 1199,
        portada: "img/EldenRing.jpg",
        capturas: ["img/EldenRing.jpg"],
        requisitos: {
            minimos: "SO: Windows 10 · CPU: Intel i5-8400 · RAM: 12 GB · GPU: GTX 1060 3 GB · 60 GB",
            recomendados: "SO: Windows 11 · CPU: Intel i7-8700K · RAM: 16 GB · GPU: GTX 1070 8 GB · 60 GB",
        },
        tamanoGB: 60,
        popularidad: 85,
    },
    {
        titulo: "Minecraft",
        descripcion: "Construye, explora y sobrevive en un mundo infinito hecho de bloques, solo o con amigos.",
        categoria: "Simulación",
        plataformas: ["PC", "Xbox", "PS5"],
        precio: 599,
        portada: "img/Minecraft.jpg",
        portadaAlterna: "img/Minecraf2.jpg",
        capturas: ["img/Minecraft.jpg", "img/Minecraf2.jpg"],
        requisitos: REQ_LIGEROS,
        tamanoGB: 1.5,
        popularidad: 80,
    },
    {
        titulo: "Sea of Thieves",
        descripcion: "Aventura pirata cooperativa en mar abierto: navega, busca tesoros y enfréntate a otras tripulaciones.",
        categoria: "Aventura",
        plataformas: ["PC", "Xbox", "PS5"],
        precio: 799,
        descuento: 50,
        ofertaFin: enDias(5),
        portada: "img/SeaOfThieves.jpg",
        capturas: ["img/SeaOfThieves.jpg"],
        requisitos: {
            minimos: "SO: Windows 10 · CPU: Intel i3 @ 2.9 GHz · RAM: 4 GB · GPU: GTX 650 · 50 GB",
            recomendados: "SO: Windows 11 · CPU: Intel i5 @ 3.3 GHz · RAM: 8 GB · GPU: GTX 770 · 50 GB",
        },
        tamanoGB: 50,
        popularidad: 75,
    },
    {
        titulo: "Hollow Knight",
        descripcion: "Metroidvania dibujado a mano en el reino subterráneo de Hallownest.",
        categoria: "Indie",
        plataformas: ["PC", "Xbox", "PS5"],
        precio: 299,
        portada: "img/HollowKnight.jpg",
        capturas: ["img/HollowKnight.jpg"],
        requisitos: REQ_LIGEROS,
        tamanoGB: 9,
        popularidad: 70,
    },
];

const RESENAS = [
    { apodo: "NettPlayer", titulo: "Forza Horizon 5", calificacion: 5, comentario: "El mejor juego de carreras que he jugado, México se ve increíble." },
    { apodo: "LunaGamer", titulo: "Forza Horizon 5", calificacion: 4, comentario: "Muy divertido, aunque pesa bastante." },
    { apodo: "NettPlayer", titulo: "Elden Ring", calificacion: 5, comentario: "Difícil pero muy satisfactorio." },
    { apodo: "LunaGamer", titulo: "Hollow Knight", calificacion: 5, comentario: "Precioso y con una música increíble." },
    { apodo: "NettPlayer", titulo: "Halo Infinite", calificacion: 4, comentario: "El multijugador gratis está muy bien." },
    { apodo: "LunaGamer", titulo: "Minecraft", calificacion: 5, comentario: "Un clásico para jugar con amigos." },
];

export async function sembrar() {
    // Juegos (upsert por título)
    await Videojuego.bulkWrite(
        juegos.map((juego) => ({
            updateOne: { filter: { titulo: juego.titulo }, update: { $set: juego }, upsert: true },
        }))
    );
    const porTitulo = Object.fromEntries((await Videojuego.find({}, "titulo")).map((j) => [j.titulo, j._id]));

    // Jugadores que escriben las reseñas de ejemplo (no se puede iniciar sesión con ellos)
    for (const apodo of ["NettPlayer", "LunaGamer"]) {
        let autor = await Usuario.findOne({ apodo });
        if (!autor) {
            autor = await Usuario.create({
                apodo,
                correo: `${apodo.toLowerCase()}@ejemplo.playnett.mx`,
                fechaNacimiento: new Date("2000-01-01"),
                contrasena: crypto.randomBytes(24).toString("hex") + "!1",
                verificado: true,
            });
        }
        const suyas = RESENAS.filter((r) => r.apodo === apodo);
        for (const r of suyas) {
            const idJuego = porTitulo[r.titulo];
            if (!autor.tieneJuego(idJuego)) autor.biblioteca.push({ videojuego: idJuego, origen: "compra" });
            await Resena.updateOne(
                { videojuego: idJuego, usuario: autor._id },
                { $set: { calificacion: r.calificacion, comentario: r.comentario } },
                { upsert: true }
            );
        }
        await autor.save();
    }

    return Object.keys(porTitulo).length;
}

// Solo se ejecuta al correr el archivo directamente (npm run seed)
if (import.meta.url === `file://${process.argv[1]}`) {
    try {
        await conectarDB();
        const n = await sembrar();
        console.log(`Catálogo listo: ${n} videojuegos (con reseñas de ejemplo).`);
    } catch (err) {
        console.error("Error al llenar la base de datos:", err.message);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
}
