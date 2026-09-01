# Pendiente · Muro de pago en el registro

Aplazado a propósito el 2026-09-01. Emmanuel prefiere salir a prospectar
clientes antes de construir esto. No está bloqueado por nada técnico.

## Qué hay hoy

Cualquiera entra a la landing, se registra con correo o Google, y queda
adentro con 14 días de prueba y el plan Avanzado completo
(`004_planes.sql:28` — `perfiles.plan` nace `default 'completo'`).
Ni un dato de contacto más allá del correo, ni una decisión de compra.

Al día 15 `esta_activo()` deja de dejarla pasar y aparece
`PantallaBloqueo`. Verificado contra producción: las 9 tablas de datos
tienen `esta_activo()` en `qual` y en `with_check`, así que el bloqueo es
real y no cosmético.

## Qué se quiere en cambio

Que registrarse y entrar dejen de ser lo mismo. Dos caminos explícitos
desde la pantalla de registro:

1. **Pagar de una vez.** Se piden los datos de la clínica (nombre
   completo del responsable, documento, dirección, teléfono, NIT si
   factura) y se sale al checkout. Vuelve pagada y entra.
2. **Iniciar prueba de 14 días.** Un botón aparte, no el camino por
   defecto. Que se lea como una decisión y no como el atajo.

El motivo es de negocio, no técnico: hoy la prueba es lo que pasa cuando
alguien no decide nada, y una prueba que nadie eligió no califica a nadie.

## Decisiones que ya están tomadas y no hay que volver a discutir

- **Los datos de tarjeta no tocan VetaApp.** El checkout lo aloja Wompi.
  Nunca construir un formulario propio que reciba número de tarjeta:
  cambia el régimen de cumplimiento (PCI) y no aporta nada.
- **El monto no se calcula en el navegador.** Ya es así: el precio vive
  en `planes_precios` y la firma la pone `pago-iniciar` con el integrity
  secret. Cualquier cosa que se calcule en React se cambia con F12.
- **El bloqueo se queda en RLS.** Un muro de pago dibujado en React es
  una sugerencia; `esta_activo()` es la puerta.
- **Pedir dirección y documento es tratar datos personales.** La política
  de privacidad ya cita la Ley 1581 de 2012, pero al agregar esos campos
  hay que revisar que lo que dice el texto siga siendo lo que se hace.

## Lo que hay que construir

- Rehacer `AuthScreen` para que ofrezca los dos caminos.
- Tabla o columnas nuevas para los datos de la clínica que hoy no se
  piden. Revisar si `configuracion` ya sirve antes de crear nada.
- Que `crear_perfil()` (005_prueba.sql) deje de asignar la prueba sola:
  hoy la da siempre, y con esto la prueba pasa a ser una elección.
  **Cuidado:** ese trigger corre en cada alta de `auth.users`. Cambiarlo
  mal deja cuentas sin perfil.
- Desplegar las Edge Functions. Sin eso, el camino de pago no existe.

## Requisito previo

Nada de esto sirve sin la cuenta de comercio de Wompi aprobada. Mientras
tanto se cobra a mano desde el panel de admin, que ya funciona:
`admin_set_plan` y `admin_set_estado`, ambas validan `es_admin()` en la
base.
