# animal-proc-anim-js

Animación procedural de un pez, una serpiente y una lagartija en el navegador, hecha con [p5.js](https://p5js.org/).

**Demo:** <https://amadoramos.github.io/animal-proc-anim-js/>

Es un port de [animal-proc-anim](https://github.com/argonautcode/animal-proc-anim) de argonaut, escrito originalmente en Processing (Java). Explicación de la técnica en el [video original](https://www.youtube.com/watch?v=qlfh_rv6khY).

A diferencia del original, los animales no siguen el ratón: nadan hacia puntos aleatorios de la pantalla, girando en curva, y cada punto nuevo aparece con un efecto de ondas (ripple).

## Cómo ejecutarlo

Hay que servir la carpeta por HTTP (abriendo `index.html` directamente no carga `sketch.js`):

```bash
python -m http.server 8123
```

Luego abre <http://localhost:8123>.

## Controles

El menú de la esquina superior izquierda se oculta y se muestra pulsando **Menú**.

| Control | Qué hace |
|---|---|
| Animal | Pez, serpiente o lagartija |
| Velocidad | Multiplica la velocidad base de cada animal (0.25x – 3x) |
| Radio de giro | Arco más cerrado que puede trazar la cabeza. El mínimo sube con la velocidad para que los giros no sean bruscos |
| Ripple: Anillos | Cantidad de anillos por onda |
| Ripple: Separación | Tiempo entre un anillo y el siguiente |
| Ripple: Duración | Lo que tarda cada anillo en expandirse y desvanecerse |
| Ripple: Tamaño | Diámetro máximo de los anillos |

## Cómo funciona

- **Columna (`Chain`)**: cada animal es una cadena de articulaciones a distancia fija. Cada articulación sigue a la anterior y su ángulo se limita respecto a la vecina, así el cuerpo se curva sin doblarse de más.
- **Dirección**: la cabeza gira hacia su destino como máximo `velocidad / radio de giro` radianes por fotograma, por eso se mueve en arcos. El destino se da por alcanzado a una distancia de dos radios de giro; si no, un punto dentro del círculo de giro quedaría fuera de alcance y el animal daría vueltas alrededor para siempre.
- **Patas (lagartija)**: cada pata es una cadena de 3 articulaciones resuelta con FABRIK. El pie solo da un paso cuando se queda a más de 200 px de su posición ideal.
- **Cuerpo**: el contorno se dibuja con `curveVertex` alrededor de la columna, usando el ancho definido para cada vértebra.

## Archivos

- `index.html`: página y menú (controles HTML nativos).
- `sketch.js`: todo el código de la animación.

p5.js se carga desde CDN y **debe ser 1.x**: en p5 2.x `curveVertex` fue reemplazado por `splineVertex`, que maneja los vértices de control de otra forma.

## Licencia

MIT, igual que el proyecto original. Ver [LICENSE](LICENSE).
