# Guion de venta · visita en frío con portátil

Escrito el 2026-09-03, para clínicas veterinarias en Colombia, cobrando a
mano y con prueba de 14 días.

La estrategia sale de la primera visita real: la clínica **ya tenía**
software de inventario conectado a la DIAN, pero **las citas en un
cuaderno**, y la historia clínica se veía anticuada. La muchacha se
interesó por el calendario.

De ahí sale la única regla que importa:

> **No vendes "cámbiese de software". Vendes "saque el cuaderno".**

Contra un programa ya pagado y ya aprendido, "cámbiese" pierde siempre.
Llenar el hueco que ese programa dejó no compite con nadie.

---

## 1. Antes de entrar

**A qué hora.** Entre 2 y 4 de la tarde, entre semana. Evita la mañana
(consulta llena), la hora de almuerzo y el sábado, que es el día pesado.

**A quién buscas.** Al dueño, que en clínicas chicas casi siempre es el
veterinario que atiende. Si no está, la persona del mostrador **no es un
obstáculo, es tu aliada**: es quien sufre el cuaderno todos los días. Si
la convences, ella te vende el producto por dentro mejor que tú.

**Qué miras en diez segundos, apenas entras:**

- ¿Hay un cuaderno o una agenda de papel en el mostrador? Eso es la venta.
- ¿Hay un computador encendido? ¿Se alcanza a ver qué programa tienen?
- ¿Cuántas personas trabajan ahí? Cambia lo que puedes prometer (ver §9).
- ¿Está lleno o vacío? Si está lleno, no insistas: pide la hora y vuelve.

**Qué llevas.** Portátil cargado, internet propio en el celular (no
cuentes con el wifi de ellos), y el link listo. Nada de folletos: el
folleto se bota.

---

## 2. Los primeros veinte segundos

No vendes. Compras permiso para la siguiente pregunta.

> "Buenas tardes. Soy Emmanuel, hice un programa para clínicas
> veterinarias. No vengo a que me compre nada hoy: estoy visitando
> clínicas de la zona para entender cómo llevan las citas y las historias.
> ¿Tiene dos minutos o vuelvo en otro momento?"

Tres cosas hacen el trabajo:

- **"No vengo a que me compre nada hoy"** baja la guardia. Es verdad, además.
- **"Entender cómo llevan"** te pone a preguntar, no a recitar.
- **"¿o vuelvo en otro momento?"** le da salida. Sin salida, la gente se
  defiende diciendo que no.

Si dice que está ocupada: *"¿Le sirve el jueves a esta hora?"* Anota y
vete. Volver cuando dijiste que ibas a volver ya te distingue de casi
todos.

---

## 3. Tres preguntas, antes de mostrar nada

En este orden. No pases a la siguiente sin dejar que conteste.

**1. "¿Cómo llevan hoy las citas?"**

Es la pregunta que descubrió el hueco en tu primera visita. Si dice
cuaderno, agenda o "nos acordamos", ya encontraste por dónde entrar.

**2. "¿Y las historias clínicas dónde quedan?"**

Aquí se separan dos mundos. Papel: no compites con nadie. Otro software:
la siguiente pregunta es *"¿y le gusta cómo se ve?"* — en tu primera
visita la respuesta fue que se veía anticuado.

**3. "¿Qué es lo que más les da lidia de eso?"**

Cállate y deja que hable. Lo que diga aquí es lo que tienes que repetirle
después con tus palabras. Anótalo apenas salgas.

**Regla:** si no contestó estas tres, no abras el portátil. Una demo sin
diagnóstico es un folleto hablado.

---

## 4. La demo: dos minutos, dos pantallas

Abres el portátil **solo después** de las tres preguntas, y muestras
**exactamente dos cosas**. Mostrar todo es el error clásico: la clínica se
abruma, piensa "esto es muy complicado para nosotros", y pierdes.

**Pantalla 1 — El calendario.** Es el hueco que encontraste.

> "Esto es lo mismo que usted tiene en el cuaderno, pero aquí no se pierde
> ni se le moja."

**Pantalla 2 — La ficha de una mascota.** Historia, peso, vacunas, todo en
una pantalla.

> "Llega Michi con vómito. Busca el nombre y ahí está: qué le diagnosticó
> en marzo, qué le recetó, cuánto pesaba, qué vacunas lleva."

Y te callas.

**Si pregunta por algo más** (inventario, caja, recordatorios), muéstralo
— pero solo si ella pregunta. Que ella pida es señal de compra; que tú
ofrezcas es ruido.

---

## 5. El cierre: registrarla ahí mismo

Esto es lo más fuerte que puedes hacer y casi nadie lo hace.

> "¿Me presta el cuaderno un momento? Le meto las citas de esta semana y
> mañana lo abre y ve si le sirve. Son catorce días de prueba, no pide
> tarjeta y no queda comprometida a nada."

Entonces, ahí parado en el mostrador:

1. Le creas la cuenta con **el correo de ella**.
2. Metes **una mascota real** del cuaderno, con su dueño.
3. Metes **las citas de esta semana**.
4. Le muestras cómo se ve el calendario ya con sus datos adentro.

Por qué funciona: deja de estar evaluando un producto ajeno y pasa a tener
uno propio con sus datos. La pregunta cambia de "¿me sirve esto?" a "¿lo
sigo usando?", que es mucho más fácil de contestar que sí.

**Antes de irte:** que abra WhatsApp y te guarde el contacto. Sin eso, el
seguimiento no existe.

---

## 6. El precio

**Nunca lo digas antes de la demo.** Sin haber visto nada, cualquier
número es caro.

**Pero si te lo preguntan antes, contéstalo de una.** Esquivarlo —"eso
depende", "ya llegamos a eso"— destruye la confianza más de lo que
cualquier precio la destruye.

> "Esencial son sesenta y nueve mil al mes, Avanzado noventa y nueve mil.
> Le muestro la diferencia en un minuto y usted me dice si le sirve."

Y sigues con la demo.

**Cuando toque justificarlo:**

> "Son noventa y nueve mil al mes. Poco más de tres mil pesos al día,
> menos de lo que cobra por una consulta."

Diferencia entre los dos planes, en una frase:

> "Esencial es para organizar las historias y las citas. Avanzado es lo
> mismo más caja, inventario y los recordatorios de vacunas. Si ya cobra y
> factura por otro lado, con Esencial le basta."

Esa diferencia son exactamente tres módulos, y así está en la base
(`tiene_modulo()` en `006_avisos.sql`): inventario, caja y recordatorios.
No inventes uno más.

**Cómo se paga hoy:** por WhatsApp, a mano. Es una ventaja, no una
carencia: *"Me escribe, coordinamos y le activo el plan el mismo día."*

---

## 7. Las cinco objeciones

**"Ya tenemos un software."**

> "Sí, y no le vengo a decir que lo cambie. Ese le sirve para el
> inventario y la DIAN. Yo le pregunto por las citas: ¿esas dónde están?"

Es tu mejor escenario, no el peor: la clínica ya demostró que paga por
software.

**"Yo no decido, tiene que hablar con el doctor."**

> "Claro. ¿A qué hora lo encuentro? Y mientras tanto, ¿le muestro a usted
> cómo funciona? Al fin y al cabo el que va a usar esto todos los días es
> el mostrador."

Le haces la demo igual. Sales con dos cosas: la hora del dueño y una
persona adentro que ya lo vio y lo quiere.

**"¿Y si se cae el internet?"**

Contesta con la verdad, sin adornarla:

> "Necesita internet, sí. La ventaja es que la información no vive en ese
> computador: si se daña o se lo roban, usted entra desde el celular o
> desde otro y está todo. Y si algún día quiere irse, se descarga todo en
> Excel cuando quiera, sin pedirme permiso."

Eso último es cierto y verificable: la exportación a CSV existe y baja
ocho tablas.

**"Déjeme pensarlo."**

Casi siempre significa "no me convenció" o "no soy yo quien decide".
Averigua cuál:

> "Con mucho gusto. ¿Qué es lo que le hace ruido, el precio o si de verdad
> lo van a usar?"

Y si no hay respuesta clara, no empujes — deja la prueba andando:

> "No tiene que decidir nada hoy. Déjelo prendido los catorce días y si no
> lo usó, no pasó nada."

**"¿Y esto quién lo respalda? ¿Usted es una empresa?"**

> "Lo hice yo, y por eso me tiene a mí en el WhatsApp cuando algo falle, no
> a un call center. Los datos son suyos y se los lleva cuando quiera."

No inventes una empresa que no existe. Se nota, y en un gremio donde todos
se conocen, se cuenta.

---

## 8. Al salir, y después

**Apenas sales**, todavía en la calle, anota:

- Nombre de la clínica, de la persona, y su WhatsApp.
- Qué usan hoy para citas y para historias.
- **La frase exacta** con que describió su problema.
- Si quedó registrada o no, y por qué no.

Esa frase exacta es lo más valioso que traes. Cuando cinco clínicas te
digan lo mismo con las mismas palabras, esa es la frase que va en la
landing.

**Seguimiento** (solo si quedó registrada):

- **Día 3** — *"¿Alcanzó a meter alguna cita? Si quiere le ayudo a montar
  las de la semana."* No preguntes qué le pareció: pregunta si la usó.
- **Día 12** — *"Se le acaban los catorce días el viernes. ¿Seguimos?"*
  Aquí sí se pide la decisión.

Si en el día 3 no ha metido nada, no se va a quedar. Sirve más para
aprender por qué que para insistir.

---

## 9. Lo que NO puedes prometer

Verificado contra el código el 2026-09-03. Cada línea de aquí es una venta
que se cae en la primera semana si la dices.

| No digas | Di |
|---|---|
| "Manda los recordatorios solo" | "Le arma la lista y el mensaje; usted da un clic y sale" |
| "Cada veterinario con su usuario" | "Es una cuenta para toda la clínica" |
| "El inventario se descuenta solo" | "Queda anotado qué medicamento usó; la cantidad la ajusta usted" |
| "Calcula solo la próxima vacuna" | "Usted pone la fecha de la próxima y la app se la recuerda" |
| "Factura electrónica DIAN" | "Eso no lo hace todavía. ¿Con qué factura hoy?" |
| "Le adjunta los exámenes a la historia" | "Guarda foto de la mascota; los exámenes todavía no" |

Tres de esas merecen explicación, porque son las que más se van a
preguntar:

**Multiusuario.** Es la más delicada. La base filtra por usuario
individual (`auth.uid() = user_id`), no por clínica. Si en una clínica dos
personas abren dos cuentas, **la segunda ve la aplicación vacía**. Dilo tú
antes de que lo descubran:

> "Es una cuenta para la clínica, la comparten. En la historia queda
> escrito qué veterinario atendió, así que no se pierde quién hizo qué."

Para una clínica de dos o tres personas eso alcanza. Para una de ocho
veterinarios, hoy no le sirve — y decírselo te ahorra un cliente furioso.

**Recordatorios.** La app arma la lista de a quién le toca vacuna y el
texto del mensaje. El clic de "enviar" es de la veterinaria. Vendido como
automático, la clínica descubre en dos días que no lo es.

**Facturación DIAN.** No existe nada. En la landing aparece marcado
"próximamente" y sin botón de pago, a propósito. Si te preguntan, es la
oportunidad de saber con qué facturan hoy — que fue justo lo que
encontraste en la primera visita.

---

## 10. Las primeras cinco visitas no son para vender

Son para averiguar cuál de estas dos frases es la verdadera:

- "El problema es que las citas están en un cuaderno."
- "El problema es que la historia clínica del software que tienen es fea."

Ambas las viste en una sola clínica. Cuál se repite, no lo sabes todavía —
y con una sola observación no se decide nada.

Meta de esas cinco: **cinco cuadernos vistos y cinco frases anotadas.** Si
además sale una venta, bien. Si no, no fue una visita perdida: nada de lo
que se puede aprender leyendo el código te dice esto.
