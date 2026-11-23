# PLAYNETT

Tienda de videojuegos hecha con HTML, CSS y JavaScript, con un backend en **Node.js + Express** y base de datos **MongoDB** (Mongoose).

## Qué guarda MongoDB

| Colección     | Contenido                                                                 |
|---------------|---------------------------------------------------------------------------|
| `videojuegos` | Catálogo: título, categoría, plataformas (embebidas), precio, descuento… |
| `usuarios`    | Cuentas con contraseña cifrada (bcrypt), favoritos y biblioteca (embebida) |
| `pedidos`     | Compras pagadas: desglose de IVA, método de pago (sin datos de tarjeta), código de activación |
| `resenas`     | Reseñas de jugadores (una por usuario y juego)                           |

Los filtros, la búsqueda, el orden y la paginación del catálogo se resuelven en la base de datos con un *aggregation pipeline* (`$match`, `$addFields`, `$facet`).

## Cómo correrlo

1. Instala Node.js 22 o superior.
2. Consigue una base de datos MongoDB:
   - **Atlas (recomendado, gratis):** crea un cluster en <https://www.mongodb.com/atlas>, un usuario de base de datos, permite tu IP y copia la cadena de conexión.
   - **Local:** instala MongoDB Community Server y usa `mongodb://127.0.0.1:27017/playnett`.
3. Copia `.env.example` como `.env` y pon tu `MONGODB_URI` y un `JWT_SECRET`.
4. Instala dependencias, llena el catálogo y arranca:

```bash
npm install
npm run seed     # inserta los videojuegos
npm run dev      # http://localhost:3000
```

## Pantallas (una por diagrama de casos de uso del Gamer)

| # | Diagrama | Dónde |
|---|----------|-------|
| 1 | Registro | `components/iniciarSesion.html` → «Crear cuenta» |
| 2 | Inicio de sesión (bloqueo tras 5 intentos, recordar sesión, recuperar contraseña) | `components/iniciarSesion.html` |
| 3 | Catálogo | `#catalogo` |
| 4 | Buscar videojuego (historial, sugerencias, nombres parecidos) | barra de búsqueda |
| 5 | Detalle del videojuego | `#juego/ID` |
| 6 | Favoritos (aviso cuando un favorito entra en oferta) | `#favoritos` |
| 7 | Ofertas | `#ofertas` |
| 8 | Comprar videojuego | `#comprar/ID` |
| 9 | Biblioteca — Instalar | `#biblioteca` |
| 10 | Biblioteca — Desinstalar | `#biblioteca` |
| 11 | Perfil y configuración | `#perfil` |

### Partes simuladas (no hay servicios reales detrás)

- **Correos** (verificación, recuperar contraseña, comprobante): se imprimen en la consola del servidor. Fuera de producción la página muestra un enlace «modo demo» para seguir el flujo.
- **Pagos**: no se cobra nada. Tarjeta aprobada `4242 4242 4242 4242` (cualquier fecha futura y CVV), rechazada `4000 0000 0000 0002`; PayPal rechazado `rechazado@paypal.com`. Códigos promocionales: `PLAYNETT10`, `GAMER20`.
- **Instalar / desinstalar**: una página web no puede instalar programas; la descarga se simula en el navegador y el servidor guarda qué está instalado y en qué unidad (las unidades están en `backend/config/tienda.js`).
- **Google**: es real, pero necesita `GOOGLE_CLIENT_ID` en `.env` (credencial OAuth de Google Cloud). Sin ella, el botón explica que no está configurado.

## Pruebas

```bash
npm test                      # API: 45 pruebas agrupadas por los 11 diagramas
npx playwright install chromium   # solo la primera vez
npm run test:navegador        # navegador: recorre las 11 pantallas como un usuario (85 verificaciones)
```

Las dos usan bases de datos temporales en tu mismo cluster (`playnett_pruebas`, `playnett_navegador`) y las borran al terminar.

> La página ya no funciona abriendo `index.html` con doble clic: tiene que abrirse desde `http://localhost:3000` para poder hablar con la API.

## API

| Método | Ruta                            | Descripción                                   |
|--------|---------------------------------|-----------------------------------------------|
| GET    | `/api/videojuegos`              | Catálogo (`q`, `categoria`, `precio`, `oferta`, `orden`, `pagina`, `limite`) |
| GET    | `/api/videojuegos/categorias`   | Número de juegos por categoría                |
| GET    | `/api/videojuegos/:id`          | Detalle de un juego                           |
| POST   | `/api/auth/registro`            | Crear cuenta                                  |
| POST   | `/api/auth/login`               | Iniciar sesión (cookie httpOnly con JWT)      |
| POST   | `/api/auth/logout`              | Cerrar sesión                                 |
| GET    | `/api/auth/yo`                  | Usuario de la sesión actual                   |
| GET    | `/api/auth/disponible`          | ¿Nombre de usuario / correo libres?           |
| GET    | `/api/auth/verificar?token=`    | Enlace de verificación del correo             |
| POST   | `/api/auth/recuperar`           | Enviar enlace para restablecer contraseña     |
| POST   | `/api/auth/restablecer`         | Crear nueva contraseña                        |
| POST   | `/api/auth/google`              | Entrar / registrarse con Google               |
| GET    | `/api/videojuegos/:id/resenas`  | Reseñas (POST para escribir la tuya)          |
| GET    | `/api/favoritos`                | Favoritos del usuario                         |
| GET    | `/api/favoritos/avisos`         | Favoritos que entraron en oferta              |
| POST   | `/api/favoritos/:id`            | Agregar a favoritos                           |
| DELETE | `/api/favoritos/:id`            | Quitar de favoritos                           |
| POST   | `/api/compras/resumen`          | Resumen con descuento, código e IVA           |
| POST   | `/api/compras`                  | Confirmar pago                                |
| GET    | `/api/compras`                  | Historial de compras                          |
| GET    | `/api/biblioteca`               | Juegos del usuario y unidades de disco        |
| POST   | `/api/biblioteca/:id`           | Obtener juego gratis                          |
| POST   | `/api/biblioteca/:id/verificar-espacio` | Verificar espacio antes de instalar   |
| PUT/DELETE | `/api/biblioteca/:id/instalacion` | Instalar / desinstalar                  |
| PATCH  | `/api/perfil`                   | Cambiar nombre de usuario y foto              |
| PUT    | `/api/perfil/contrasena`        | Cambiar contraseña                            |

## Estructura

```
backend/
  server.js          arranca el servidor
  app.js             app Express (API + archivos del sitio)
  config/tienda.js   IVA, códigos promo, unidades de disco, reglas de contraseña
  banco.js           pasarela de pago simulada
  correo.js          envío de correos (consola)
  db.js              conexión a MongoDB
  seed.js            datos iniciales del catálogo
  models/            esquemas de Mongoose (Videojuego, Usuario)
  routes/            rutas de la API
  middleware/auth.js sesión con JWT
components/          página de inicio de sesión / registro / recuperar contraseña
js/                  una vista por pantalla (detalle, favoritos, ofertas, compra, biblioteca, perfil) + router
tests/               pruebas de la API y del navegador
img/                 portadas
index.html, script.js, styles.css
diagramas/           diagramas de clases, casos de uso y flujo
```
