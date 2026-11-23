const modo = document.getElementById("btnModo");
const formulario = document.getElementById("formulario");

modo.addEventListener("click", function(){
    document.body.classList.toggle("dark");

    if(document.body.classList.contains("dark")){
        modo.innerText = "🌞";
    }else{
        modo.innerText = "🌙";
    }
});

// ===== Pantallas del formulario =====
// login     -> caso de uso 2 (iniciar sesión)
// registro  -> caso de uso 1 (crear cuenta)
// recuperar -> pedir el enlace para restablecer la contraseña
// nueva     -> crear nueva contraseña (llega con ?token= desde el correo)
const parametros = new URLSearchParams(location.search);
const tokenRecuperacion = parametros.get("token");
const volver = parametros.get("volver") || "";
let pantalla = tokenRecuperacion ? "nueva" : "login";

const $ = (id) => document.getElementById(id);
const error = $("error");
const aviso = $("aviso");
const CONTRASENA_SEGURA = /^(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
const CORREO_VALIDO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const TEXTOS = {
    login: { titulo: "Iniciar Sesion", boton: "Continuar", pregunta: "¿No tienes cuenta?", enlace: "Crear cuenta" },
    registro: { titulo: "Crear cuenta", boton: "Crear cuenta", pregunta: "¿Ya tienes cuenta?", enlace: "Iniciar sesión" },
    recuperar: { titulo: "Recuperar contraseña", boton: "Enviar enlace", pregunta: "¿Ya la recordaste?", enlace: "Iniciar sesión" },
    nueva: { titulo: "Nueva contraseña", boton: "Guardar contraseña", pregunta: "", enlace: "Iniciar sesión" },
};

function mostrarAviso(texto, enlace) {
    aviso.replaceChildren(texto);
    if (enlace) {
        const a = document.createElement("a");
        a.href = enlace;
        a.textContent = " Abrir enlace (modo demo)";
        aviso.append(a);
    }
    aviso.hidden = !texto;
}

function mensaje(id, texto, ok) {
    const nodo = $(id);
    nodo.textContent = texto;
    nodo.className = `mensaje ${texto ? (ok ? "mensaje--ok" : "mensaje--error") : ""}`;
}

function pintarPantalla() {
    const t = TEXTOS[pantalla];
    const ver = (selector, visible) => document.querySelectorAll(selector).forEach((n) => (n.hidden = !visible));
    ver(".solo-registro", pantalla === "registro");
    ver(".solo-login", pantalla === "login");
    ver(".solo-confirmar", pantalla === "registro" || pantalla === "nueva");
    ver(".solo-google", pantalla === "login" || pantalla === "registro");
    $("campo_correo").hidden = pantalla === "nueva";
    $("campo_contrasena").hidden = pantalla === "recuperar";

    $("titulo").innerText = t.titulo;
    $("enviar").innerText = t.boton;
    $("pregunta").innerText = t.pregunta;
    $("cambiarModo").innerText = t.enlace;
    $("contrasena").autocomplete = pantalla === "login" ? "current-password" : "new-password";
    $("contrasena").placeholder = pantalla === "login" ? "Tu contraseña" : "8+ caracteres, número y símbolo";
    error.innerText = "";
    document.querySelectorAll(".mensaje").forEach((m) => (m.textContent = ""));
}

// Ir a la pantalla de registro / volver a iniciar sesión
$("cambiarModo").addEventListener("click", function(evento) {
    evento.preventDefault();
    pantalla = pantalla === "login" ? "registro" : "login";
    if (tokenRecuperacion) history.replaceState(null, "", location.pathname);
    mostrarAviso("");
    pintarPantalla();
});

// Recuperar contraseña
$("olvide").addEventListener("click", (e) => {
    e.preventDefault();
    pantalla = "recuperar";
    pintarPantalla();
});

$("verTerminos").addEventListener("click", (e) => {
    e.preventDefault();
    $("dialogoTerminos").showModal();
});

// Mensaje al volver del enlace de verificación del correo
if (parametros.get("verificado") === "1") mostrarAviso("✓ Tu correo quedó verificado.");
if (parametros.get("verificado") === "0") mostrarAviso("El enlace de verificación no es válido o ya se usó.");
if (volver) mostrarAviso("Inicia sesión para continuar.");

pintarPantalla();


// ===== Validaciones mientras se escribe (registro) =====
function calcularEdad(fecha) {
    const n = new Date(fecha + "T00:00:00Z");
    const hoy = new Date();
    let edad = hoy.getUTCFullYear() - n.getUTCFullYear();
    const mes = hoy.getUTCMonth() - n.getUTCMonth();
    if (mes < 0 || (mes === 0 && hoy.getUTCDate() < n.getUTCDate())) edad--;
    return edad;
}

let esperaApodo, esperaCorreo;

// Validar que el nombre de usuario esté disponible
$("apellido").addEventListener("input", () => {
    clearTimeout(esperaApodo);
    const apodo = $("apellido").value.trim();
    if (apodo.length < 3) return mensaje("msg_apodo", apodo ? "El apodo está incompleto (mínimo 3 caracteres)" : "", false);
    esperaApodo = setTimeout(async () => {
        try {
            const r = await (await fetch(`/api/auth/disponible?apodo=${encodeURIComponent(apodo)}`)).json();
            mensaje("msg_apodo", r.apodo ? "Disponible" : "Ese nombre de usuario ya está en uso", r.apodo);
        } catch { /* sin conexión */ }
    }, 300);
});

// Validar formato del correo y que no esté registrado
$("correo").addEventListener("input", () => {
    if (pantalla !== "registro") return;
    clearTimeout(esperaCorreo);
    const correo = $("correo").value.trim();
    if (!correo) return mensaje("msg_correo", "", true);
    if (!CORREO_VALIDO.test(correo)) return mensaje("msg_correo", "El correo no tiene un formato válido", false);
    esperaCorreo = setTimeout(async () => {
        try {
            const r = await (await fetch(`/api/auth/disponible?correo=${encodeURIComponent(correo)}`)).json();
            mensaje("msg_correo", r.correo ? "" : "Este correo ya está registrado", r.correo);
        } catch { /* sin conexión */ }
    }, 300);
});

// Verificar edad mínima (13 años)
$("fechaNacimiento").max = new Date().toISOString().slice(0, 10);
$("fechaNacimiento").addEventListener("change", () => {
    const edad = calcularEdad($("fechaNacimiento").value);
    mensaje("msg_fecha", edad < 13 ? "Debes tener 13 años o más" : "", edad >= 13);
});

// Validar seguridad de la contraseña y confirmación
$("contrasena").addEventListener("input", () => {
    if (pantalla === "login") return;
    const ok = CONTRASENA_SEGURA.test($("contrasena").value);
    mensaje("msg_contrasena", ok ? "Contraseña segura" : "Necesita 8+ caracteres, un número y un símbolo", ok);
});
$("confirmarContrasena").addEventListener("input", () => {
    const ok = $("confirmarContrasena").value === $("contrasena").value;
    mensaje("msg_confirmar", ok ? "Coinciden" : "Las contraseñas no coinciden", ok);
});


// ===== Enviar al servidor =====
async function enviar(ruta, datos) {
    const respuesta = await fetch(ruta, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(datos),
    });
    const cuerpo = await respuesta.json().catch(() => ({}));
    if (!respuesta.ok) throw Object.assign(new Error(cuerpo.error || "No se pudo continuar"), { datos: cuerpo });
    return cuerpo;
}

function irALaTienda(retraso = 1000) {
    setTimeout(function() {
        window.location.href = "../index.html" + (volver.startsWith("#") ? volver : "");
    }, retraso);
}

// Practica 5 - Validar el formulario e iniciar sesión (ahora contra MongoDB)
formulario.addEventListener("submit", async function(evento) {
    evento.preventDefault();
    error.innerText = "";

    const apodo = $("apellido").value.trim();  // campo "Nombre de usuario"
    const correo = $("correo").value.trim();
    const contrasena = $("contrasena").value;
    const confirmarContrasena = $("confirmarContrasena").value;
    const saludo = $("saludo");
    const boton = $("enviar");

    // --- Validaciones antes de enviar ---
    if (pantalla === "recuperar") {
        if (!CORREO_VALIDO.test(correo)) { error.innerText = "Ingresa un correo válido"; return; }
    } else if (pantalla === "nueva") {
        if (!CONTRASENA_SEGURA.test(contrasena)) { error.innerText = "La contraseña necesita 8+ caracteres, un número y un símbolo"; return; }
        if (contrasena !== confirmarContrasena) { error.innerText = "Las contraseñas no coinciden"; return; }
    } else if (!correo || !contrasena) {
        error.innerText = "Ingresa tu correo y contraseña";
        return;
    }

    if (pantalla === "registro") {
        const fecha = $("fechaNacimiento").value;
        if (apodo === "") {
            error.innerText = "El campo apodo está vacío";
            return;
        } else if (apodo.length < 3) {
            error.innerText = "El apodo está incompleto";
            return;
        } else if (!CORREO_VALIDO.test(correo)) {
            error.innerText = "El correo no tiene un formato válido";
            return;
        } else if (!fecha) {
            error.innerText = "Falta tu fecha de nacimiento";
            return;
        } else if (calcularEdad(fecha) < 13) {
            error.innerText = "Debes tener 13 años o más";
            return;
        } else if (!CONTRASENA_SEGURA.test(contrasena)) {
            error.innerText = "La contraseña necesita 8+ caracteres, un número y un símbolo";
            return;
        } else if (contrasena !== confirmarContrasena) {
            error.innerText = "Las contraseñas no coinciden";
            return;
        } else if (!$("terminos").checked) {
            error.innerText = "Debes aceptar los términos y condiciones";
            return;
        }
    }

    boton.disabled = true;
    try {
        if (pantalla === "login") {
            const usuario = await enviar("/api/auth/login", { correo, contrasena, recordar: $("recordar").checked });
            saludo.innerText = "Hola " + usuario.apodo;
            irALaTienda();
        } else if (pantalla === "registro") {
            const usuario = await enviar("/api/auth/registro", {
                apodo, correo, fechaNacimiento: $("fechaNacimiento").value, contrasena, confirmarContrasena, terminos: true,
            });
            saludo.innerText = "Hola " + usuario.apodo;
            // Enviar correo de verificación
            mostrarAviso(usuario.mensaje + ".", usuario.enlaceDemo);
            irALaTienda(usuario.enlaceDemo ? 4000 : 1500);
        } else if (pantalla === "recuperar") {
            const r = await enviar("/api/auth/recuperar", { correo });
            mostrarAviso(r.mensaje, r.enlaceDemo);
        } else if (pantalla === "nueva") {
            const r = await enviar("/api/auth/restablecer", { token: tokenRecuperacion, contrasena, confirmarContrasena });
            history.replaceState(null, "", location.pathname);
            pantalla = "login";
            pintarPantalla();
            mostrarAviso(r.mensaje);
        }
    } catch (err) {
        if (err instanceof TypeError) {
            error.innerText = "No hay conexión con el servidor";
        } else {
            // Mostrar error: correo ya registrado / contraseña y correo incorrectos / cuenta bloqueada
            error.innerText = err.message;
            if (err.datos?.campo === "correo") mensaje("msg_correo", err.message, false);
            if (err.datos?.campo === "apodo") mensaje("msg_apodo", err.message, false);
        }
    } finally {
        boton.disabled = false;
    }
});


// ===== Iniciar sesión / Registrarse con Google =====
async function prepararGoogle() {
    let config = {};
    try { config = await (await fetch("/api/auth/config")).json(); } catch { /* sin servidor */ }

    if (!config.googleClientId) {
        // Sin GOOGLE_CLIENT_ID el botón explica qué falta en lugar de fingir un inicio de sesión
        $("googleNoConfigurado").hidden = false;
        $("googleNoConfigurado").addEventListener("click", () => {
            error.innerText = "El acceso con Google no está configurado en este servidor (falta GOOGLE_CLIENT_ID en .env).";
        });
        return;
    }

    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.onload = () => {
        google.accounts.id.initialize({
            client_id: config.googleClientId,
            callback: async ({ credential }) => {
                try {
                    const usuario = await enviar("/api/auth/google", { credential });
                    $("saludo").innerText = "Hola " + usuario.apodo;
                    irALaTienda();
                } catch (err) {
                    error.innerText = err.message;
                }
            },
        });
        google.accounts.id.renderButton($("botonGoogle"), { theme: "outline", size: "large", text: "continue_with", locale: "es" });
    };
    document.head.append(script);
}
prepararGoogle();
