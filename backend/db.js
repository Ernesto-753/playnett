import mongoose from "mongoose";

// MONGODB_DB permite elegir otra base (por ejemplo, una para las pruebas)
export async function conectarDB(dbName = process.env.MONGODB_DB) {
    const uri = process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/playnett";
    await mongoose.connect(uri, dbName ? { dbName } : {});
    if (process.env.NODE_ENV !== "test") {
        console.log(`MongoDB conectado: ${mongoose.connection.host}/${mongoose.connection.name}`);
    }
}
