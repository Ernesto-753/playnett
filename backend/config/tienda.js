// Configuración de la tienda que no vive en la base de datos.

export const IVA = 0.16; // los precios ya incluyen IVA; se desglosa en el resumen

export const CODIGOS_PROMO = {
    PLAYNETT10: 10,
    GAMER20: 20,
};

// Unidades de disco simuladas para la biblioteca (instalar / desinstalar).
// "ocupadoGB" es lo que ya usan otros programas; los juegos instalados se suman aparte.
export const UNIDADES = [
    { id: "C", nombre: "Disco local (C:)", ruta: "C:\\Playnett\\Juegos", capacidadGB: 256, ocupadoGB: 170 },
    { id: "D", nombre: "Disco de juegos (D:)", ruta: "D:\\Juegos", capacidadGB: 1000, ocupadoGB: 350 },
    { id: "E", nombre: "Memoria USB (E:)", ruta: "E:\\Playnett", capacidadGB: 32, ocupadoGB: 4 },
];

export const CONTRASENA_SEGURA = /^(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
export const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
export const EDAD_MINIMA = 13;
export const MAX_INTENTOS = 5;
export const MINUTOS_BLOQUEO = 15;
