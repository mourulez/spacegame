# SPEC — Cel shader para móvil (shmup en raíles) · v2

> Documento para Claude Code. **No contiene implementación**: define qué construir, por qué, con qué APIs y cómo se valida.
> APIs verificadas contra **three.js r187** (última en npm a 4-nov-2026). Antes de empezar, Claude Code debe leer `package.json` del proyecto y, si la versión fijada es otra, revalidar en Context7 (`/mrdoob/three.js`) cada API citada aquí.

---

## 0. Objetivo y restricciones

- **Rendimiento:** 60 fps mínimo sostenido en móvil de gama media; 120 fps como objetivo donde la plataforma lo permita.
- **Presupuesto por frame:** 16,6 ms (60 Hz) / 8,3 ms (120 Hz) para CPU + GPU completos, no solo el shader.
- **Estilo:** bandas de luz duras (2–3), contorno en objetos clave, metal "falso" opcional.
- **Distribución:** portales web (Poki/CrazyGames). Restricción de descarga inicial de Poki < 8 MB (verificada en una conversación anterior del proyecto; revalidar antes de cerrar el pipeline de assets).

### 0.1 Realidad de los 120 fps (verificado)
- En iOS/iPadOS, Safari limita por defecto `requestAnimationFrame` a ~60 fps mediante la feature flag *"Prefer Page Rendering Updates near 60fps"*, activada por defecto; solo se desbloquea si el usuario la desactiva manualmente en Ajustes > Safari > Avanzado > Feature Flags.
- Consecuencia de diseño: **en iPhone el objetivo real es 60 fps estables**. 120 fps solo es alcanzable en Android con pantalla de alta frecuencia y en escritorio.
- **Dato medido (demo de prueba, Android del usuario, 4-nov-2026):** 120 fps, p95 8,4 ms, resolución 2× (780×1404), 9 draw calls, 5.650 triángulos. Es un único dispositivo y una escena simple: confirma que el enfoque es viable, no sustituye a la escena de estrés de §7.
- **Segundo dato medido (mismo Android, demo completa con todas las técnicas de esta spec activas):** 120 fps, p95 8,4 ms, resolución 2× (780×1416), 7 draw calls, 15.528 triángulos, 10 programas (incluye variantes compiladas al cambiar opciones). Incluye: material único con paleta, 2 tonos tintados, rim, especular, metal, calcomanía, trazos interiores e intersecciones, contorno tintado de grosor variable, sombra plana con stencil, llama de motor y rocas instanciadas con contorno.
- Requisito: la lógica del juego **no puede depender de la frecuencia de frame** (paso fijo de simulación o delta-time ya existente; Claude Code debe confirmar cuál usa el proyecto y no cambiarlo sin aviso).

### 0.2 Supuesto de renderer
- Se asume `WebGLRenderer` (WebGL 2; WebGL 1 no está soportado desde r163). Claude Code debe confirmar qué renderer usa el proyecto.
- Nota: la documentación de three.js recomienda `WebGPURenderer` + TSL para personalizar materiales. **Esta spec no migra a WebGPU**; es una decisión de madurez en móvil, no un hecho verificado. Si el proyecto ya usa `WebGPURenderer`, parar y pedir una spec alternativa (equivalente de contorno: `ToonOutlinePassNode`).

---

## 1. Análisis de la demo de referencia

Fuente: `github.com/ZaneAtega/Three-js-Anime-Shader` (clonado y leído: `shaders/vertexShader.glsl`, `shaders/fragmentShader.glsl`, `README.md`, bundle). Construida sobre three.js r152.

| Técnica en la demo | Qué hace | Coste en móvil | Decisión para nuestro juego |
|---|---|---|---|
| `ShaderMaterial` con `lights: true`, una sola `DirectionalLight` + ambiente | Iluminación mínima leída de los uniforms de three | Bajo | **Adoptar** el principio: 1 direccional + ambiente |
| Sombras de shadow map | Desactivadas (código comentado) | — | **Adoptar**: sin shadow maps |
| Banda de luz | `NdotL` + tintes de sombra/luz | Bajo | **Adoptar**, pero con rampa en textura (§3.2) |
| Rim light | Fresnel × `NdotL` con `smoothstep` estrecho | Bajo | **Descartado** por el usuario (§3.3) |
| Metal | Lectura de **matcap** con el vector reflejado | 1 lectura de textura | **Adoptar opcional** por material (§3.4) |
| Especular Blinn-Phong + Fresnel Schlick | `pow` por píxel | Medio | **Descartar** o sustituir por banda especular en la rampa |
| Tonemap GT por canal + `pow` gamma + saturación en el fragment | Gradación de color por píxel | Medio-alto (exp/pow ×3) | **Descartar**: paleta horneada en texturas/rampa |
| Contorno *inverted hull*: se re-dibuja la malla extruyendo vértices por la normal (`isOutline`) | Contorno en geometría | Duplica draw calls del objeto | **Adoptar, selectivo y mejorado** (§4) |
| El pase de contorno ejecuta el mismo fragment shader completo (iluminación incluida) | Contorno coloreado por la luz | Alto (sombreado completo por píxel de contorno) | **Descartar**: contorno con color plano |
| Uber-shader con `bool` uniforms (`isFace`, `isHair`, `isOutline`…) | Un programa para todo, con ramas | Ramas dinámicas + muchas texturas declaradas | **Descartar**: variantes por `#define` (§3.5) |
| `discard` (alpha cutoff, chroma key verde, máscara de contorno) | Recortes | Fuerza late-Z | **Prohibido** en opacos (§5) |
| Escritura de `gl_FragDepth` (ajuste de profundidad de la cara) | Truco de orden | Desactiva early-Z | **Prohibido** (§5) |
| Morph targets leídos con `texelFetch` en el vertex | Expresiones faciales | Medio | No aplica a naves |
| SDF facial (sombra autorada en textura) | Sombra artística | 2 lecturas | **Lección aplicable**: autorar la luz en texturas, no calcularla |
| Post-proceso: `UnrealBloomPass` + `SMAAPass`, `antialias: true`, `setPixelRatio(devicePixelRatio)` | Brillo y AA | Muy alto (varios pases a pantalla completa a resolución nativa) | **Descartar** (§5) |
| Modelos FBX de 6–42 MB, texturas PNG | Assets | Descarga y VRAM | **Descartar**: glTF + meshopt + KTX2 (§6) |

**Lección principal:** el *look* sale de ideas baratas (luz única, banda dura, matcap; el rim se descartó después, §3.3). El coste de la demo sale de su implementación (uber-shader, discard, `gl_FragDepth`, tonemap por píxel, post-proceso, contorno sombreado). Copiamos las ideas, no la implementación.

---

## 2. Base de conocimiento GPU móvil (verificado)

- En GPUs Arm Mali, `discard`, la cobertura modificada por shader y alpha-to-coverage fuerzan el test de profundidad tardío (late-Z), y con late-Z se pueden desactivar las técnicas de eliminación de superficies ocultas (FPK y variantes).
- En el fragment pre-pass de Mali (Immortalis-G925, Mali-G725/G625), escribir `gl_FragDepth` o usar `discard` obliga a ejecutar parte del shader dos veces.
- El *blending* desactiva early-ZS y FPK (documentación de Mali citada en el foro de Arm).
- La propia doc de three.js r187 advierte que `logarithmicDepthBuffer` usa `gl_FragDepth` y desactiva el early fragment test.

Corolario: **todo lo opaco debe ser opaco de verdad** (sin `discard`, sin `alphaTest`, sin `gl_FragDepth`, sin blending).

---

## 3. Material de naves y enemigos

### 3.1 Estrategia en dos fases
- **Fase A (por defecto):** `MeshToonMaterial` + `onBeforeCompile` para añadir matcap y especular. Ventaja: three mantiene instancing, skinning, fog y gestión de color.
- **Fase B (solo si el profiler demuestra que estamos limitados por fragment):** `ShaderMaterial` mínimo con iluminación propia (dirección de luz como uniform, sin chunks de luces). Requiere justificar con medidas antes/después.

### 3.2 Sombreado de 2 tonos con sombra tintada (validado en la demo)
- **No usar la rampa `gradientMap` como solución final.** En `onBeforeCompile`, eliminar el chunk `#include <gradientmap_pars_fragment>` y definir una función propia `getGradientIrradiance(normal, lightDirection)` con la misma firma (la llama `lights_toon_pars_fragment`, verificado en r186/r187). La función devuelve `mix(uShadowTint, vec3(1.0), smoothstep(t - w, t + w, dotNL))`.
- **Sombra tintada por material** (`uShadowTint`, uniform por material): la sombra es el mismo color en versión tintada (p. ej. lavanda sobre blanco, violeta sobre cobalto), no un gris. Es el aspecto manga/anime que pide el usuario.
- **Borde antialiasado:** `w = fwidth(dotNL)`. Con rampa `NearestFilter` el borde parpadeaba al moverse la nave.
- **Sin `AmbientLight`:** la luz ambiente rellena la sombra y la aplana. El color de sombra lo decide `uShadowTint`.
- **`DirectionalLight` con intensidad π:** compensa el `1/π` de `BRDF_Lambert`, de modo que la zona iluminada muestra exactamente el color base.
- **Dirección de luz:** lateral y algo alta respecto a la cámara de persecución; con la luz detrás de la cámara casi no se ve sombra.
- Variantes por define: `CEL_BANDS_3` (tono medio) y `CEL_SOFT` (borde ancho). Por defecto, 2 tonos.
- `uBandT` (umbral de sombra) como uniform compartido para ajustar el estilo sin recompilar.

### 3.2b Normales de sombreado (decisivas para la sombra manga)
- **Normales por cara = sombra rota.** Con normales planas cada faceta salta de tono entera al alabear la nave y la sombra no cruza la pieza. Fue la causa de los "colores inestables" en la primera demo.
- **Suavizado por ángulo** (equivalente a *Smooth by Angle* en Blender): promediar normales entre caras con ángulo < ~55°; por encima, arista dura. Paneles planos (alas, aletas) se quedan planos.
- **Densidad solo en piezas curvas** (fuselaje, cabina, góndolas): la GPU interpola normales linealmente por triángulo, así que con poca densidad la línea de sombra sale en dientes. En la demo: fuselaje 12 → 32 segmentos, cabina 16×6 → 32×12, góndolas 10 → 24; unos +1.000 triángulos por nave, asumible en móvil. **Es la mejora con más impacto.**
- **Normales transferidas (opcional, estilo):** copiar normales de una forma simple (cilindro para fuselaje/góndolas, elipsoide para cabina) con *Data Transfer* en Blender. Sombra más recta y gráfica. No arregla los dientes de una malla pobre.
- **`_shadow_bias` pintado (opcional):** atributo float por vértice exportado desde Blender (mismo mecanismo que `_outline_normal`), sumado a `dotNL` en la función de §3.2; negativo = más sombra. Define `USE_SHADOW_BIAS`. No usar el color de vértice estándar: `MeshToonMaterial` lo multiplicaría por el color base (deducción, no probado).
  - **Solo para oclusión** (vientre, uniones ala-fuselaje, tomas de aire, huecos): zonas oscuras venga de donde venga la luz.
  - **Nunca para sombras proyectadas** (p. ej. la de la cabina sobre el fuselaje): dependen de la luz y pintadas fijas quedan mal en otros ángulos (detectado por el usuario en la demo).
  - El valor solo existe en vértices: donde no hay vértices, no hay sombra pintada. Si hace falta precisión entre vértices, textura de umbral en escala de grises (técnica documentada de Guilty Gear Xrd).

### 3.2c Material único por nave con paleta (validado en la demo)
- **Toda la nave = 1 malla + 1 material + 1 draw call** (más 1 de contorno). En la demo la nave pasó de 6 draw calls a 1 sin cambio visual.
- **Textura de paleta:** una columna por zona de color. Fila 0 = color base, fila 1 = color de sombra (`uShadowTint` por zona), fila 2 = propiedades (en la demo: R = rim, ya descartado, G = especular, B = metal, A = emisivo; en producción van en `extras`, §11.3), fila 3 = color de contorno. `NearestFilter`, sin mipmaps.
- **Máscara de emisivo en la paleta:** canal alfa de la fila de propiedades; la zona muestra su color base pleno, sin bandas ni sombra. Su contorno puede ir en su propio color. Sin bloom por post-proceso (descartado en móvil).
- **Áreas emisivas en la superficie (punto, línea o región; opción por defecto para luces, validado en la demo):** sin geometría ni draw calls, dentro del material de la nave.
  - **Forma:** segmento A–B en espacio de la nave con radio de núcleo (A = B → punto; radio grande → región). Distancia punto–segmento por píxel (`emSegDist`).
  - **Núcleo:** color pleno casi blanco con borde antialiasado (`fwidth`). **Brillo derramado:** el color de la luz se suma sobre la superficie alrededor, en 2 bandas cel, modulado por el color base (luz roja sobre azul se lee violeta: correcto).
  - Define `USE_LED_LIGHT`; uniforms `uEmA[N]` (A.xyz, radio núcleo), `uEmB[N]` (B.xyz, alcance), `uLedColor`, `uLedCore`. Coste: N distancias a segmento por píxel de la nave; **N ≤ 4 por material**.
  - **Error encontrado dos veces:** el acumulador del brillo debe empezar en −1, no en 0; con 0 el borde de la banda cubre toda la nave.
  - **La franja es emisiva y tiene la forma del área:** encendida, rojo pleno con núcleo interior caliente (40 % del radio); apagada, color de "cristal apagado" (rojo oscuro). Uniform compartido `uLedOn` para parpadeo on/off (en la demo, 0,6 s / 0,6 s).
  - **Halo a través del contorno (sustituye al sprite):** el material de contorno de la nave calcula por vértice la cercanía a las mismas áreas (`USE_EM_OUTLINE`, mismos uniforms compartidos); cerca de la luz el trazo se ensancha (hasta ~3×) y toma el color de la luz. El resplandor sigue la silueta real de la pieza. Coste: N distancias por vértice del casco; 0 draw calls.
  - **Descartado — sprite aditivo de halo:** probado en dispositivo; se percibe como una pegatina redonda no asociada a la forma ("se ve barato").
  - **Piezas emisivas por paleta** (alfa de la fila de propiedades): válidas cuando la forma iluminada es geometría propia (ranuras modeladas, pantallas). El usuario prefiere el área emisiva para luces.
- **Contorno tintado por zona (validado en la demo):** el material de contorno de la nave comparte la textura de paleta y lee la fila 3 con la misma `uv.x` (define `USE_PALETTE_OUTLINE`). Cada zona tiene su color de línea (versión oscura y algo más saturada del color base, no negro). Coste: una lectura de textura en el pase de contorno; mismo draw call. Requiere que la geometría del casco de contorno conserve el atributo `uv`.
- **UV de paleta:** en Blender, cada grupo de caras se coloca dentro de su casilla (no hace falta desplegar con cuidado). El shader lee `uv.x` para elegir la columna.
- **Define `USE_PALETTE`:** el fragment lee la paleta tras `#include <color_fragment>` y alimenta las mismas funciones de §3.2–§3.4b mediante variables globales en lugar de uniforms por material. Especular y metal quedan activos para toda la nave y se anulan por zona con 0 en la paleta, sin programas extra.
- **Librea intercambiable:** cambiar la textura de paleta cambia colores y sombras (facciones, élites, mejoras del roguelite) sin tocar malla ni shader.
- **Producción:** la demo usa una `DataTexture` float lineal por comodidad. En el juego: colores en un PNG pequeño en sRGB y propiedades en una textura de datos aparte (o en un array de uniforms indexado por columna). Verificar en la versión fijada de three que la decodificación sRGB de la textura de colores es correcta.
- **Calcomanías y líneas de panel:** si hacen falta, segunda textura pequeña; las líneas pintadas en textura se pixelan de cerca. Preferir cortes en la geometría.

### 3.2d Calcomanías (decals) proyectadas en el shader (validado en la demo)
- **Objetivo:** pegatinas (banderas, insignias, números, escuadrón) sin romper el material único ni el draw call único, y fáciles de colocar.
- **Método elegido: proyección en espacio de objeto dentro del material de la nave.** Cada calcomanía es una caja (centro, ejes u/v/w y tamaño) en el espacio de la nave. El vertex shader calcula `vDecal[i] = (uDecalInv[i] * position).xyz`; al ser una transformación afín, la interpolación es exacta. El fragment comprueba que está dentro de la caja, que la cara mira hacia la proyección (`dot(normal, eje w) > ~0,3`, evita que atraviese a la cara opuesta) y lee el atlas.
- **Se aplica antes de la iluminación** (sobre `diffuseColor`): la pegatina recibe las mismas bandas, sombra tintada, trazos y contorno que la zona donde está. Se lee como pintada en la nave.
- **Atlas único** para todas las calcomanías del juego (p. ej. 256–512 px, casillas fijas), sRGB, con mipmaps y canal alfa como máscara. Uniforms por calcomanía: `mat4` inversa, eje de proyección `vec3`, rectángulo del atlas `vec4`. Defines `USE_DECALS` y `NUM_DECALS`.
- **Coste:** un `mat4 × vec4` por vértice y calcomanía; por píxel, una comprobación y una lectura de textura por calcomanía. 0 draw calls y 0 triángulos extra. **Límite de diseño: ≤ 4 calcomanías por material** (cada una añade varyings y una lectura); cada valor distinto de `NUM_DECALS` es un programa distinto, así que fijar pocos valores (p. ej. 0, 2, 4).
- **Facilidad de colocación (requisito del usuario):** en Blender, un Empty con forma de caja por calcomanía, con nombre `decal_<casilla>`; posición, giro y escala definen la pegatina. Al cargar, el juego lee esos nodos y genera los uniforms. Claude Code debe verificar que el exportador glTF de la versión de Blender usada exporta esos Empties como nodos con nombre y transformación, y documentar el flujo.
- **Variantes por instancia:** en `InstancedMesh` todas las instancias comparten calcomanías (están en espacio de objeto). Para cambiar la pegatina por nave (número de escuadrón), material clonado (mismo programa, uniforms propios) o casilla del atlas como atributo de instancia.
- **Alternativas descartadas como método por defecto:**
  - *Segunda UV a un atlas:* sin límite de número y sin coste de proyección, pero exige desplegar las caras de cada pegatina en Blender; peor para "fácil de poner". Válida para naves con muchas marcas fijas.
  - *`DecalGeometry` de three.js (addon):* genera malla nueva por calcomanía, con su draw call y riesgo de z-fighting. Reservar para marcas dinámicas puntuales (impactos), si se necesitan.
  - *Calcomanías transparentes superpuestas:* blending/discard en opacos; contra §5.
- **Compresión:** las calcomanías tienen bordes duros; ETC1S puede dar artefactos. Probar UASTC o PNG para el atlas (pendiente de medir).

### 3.3 Rim light — descartado
- **Decisión del usuario (noviembre de 2026): no se implementa.** Quitado de la librería de render, del visor y del formato de activo. La demo lo conserva como referencia histórica.
- Motivo de fondo, verificado en la demo y en dispositivo: en superficies planas vistas de canto el Fresnel llena toda la cara y la hace saltar de color a la vez; el contorno ya define la silueta.
- El feedback de juego que se pensaba hacer con el rim (flash de impacto, tonel, enemigo élite) se decidirá en el juego con otros medios.

### 3.4 Metal por matcap (opcional)
- Una textura matcap pequeña en escala de grises que multiplica el color base, solo en materiales con `#define USE_FAKE_METAL`.
- Alternativa sin código propio: `MeshMatcapMaterial` para piezas que no necesitan bandas.

### 3.4b Brillo especular "anime"
- Punto de brillo con corte duro: `smoothstep(uSpecT - w, uSpecT + w, N·H)` con `w = fwidth(N·H)`, solo donde `N·L` supera el umbral de sombra. Una operación barata por píxel; sin `pow`.
- Intensidad por material (`uSpecStrength`): cabina alta, metal media, fuselaje baja, resto 0 (sin define). Define `USE_ANIME_SPEC`. `uSpecT` compartido (~0,988).
- Requiere normales suaves y densidad suficiente: con malla pobre el punto salta entre vértices.

### 3.4c Feedback de amenaza (diseño)
- Que el enemigo reaccione antes del golpe (cambio de color al ser fijado por el lock-on o cuando un misil va hacia él) da lectura de juego casi gratis con uniforms, sin recompilar.

### 3.5 Variantes y compilación
- Las variantes se expresan con `#define` en `onBeforeCompile`, **nunca** con `bool` uniforms ramificados.
- Implementar `customProgramCacheKey()` devolviendo una clave estable por variante. Verificado: por defecto la clave es `onBeforeCompile.toString()`; si varias variantes comparten la función, three reutilizaría el mismo programa por error.
- Defines en uso: `USE_FAKE_METAL`, `USE_ANIME_SPEC`, `USE_SHADOW_BIAS`, `CEL_BANDS_3`, `CEL_SOFT`. Cada combinación activa es un programa.
- Límite de diseño: **≤ 8 programas** de material en una run (medir con `renderer.info.programs`). Nota: cambiar opciones en caliente deja programas en caché (en la demo llegó a 15); la cifra válida es la de la configuración final.
- El especular, el bias y los 3 tonos no deben añadir programas por material si se deciden una vez para todo el juego: fijar la configuración y no exponerla como opción en runtime.
- Precompilar en la pantalla de carga/taller con `renderer.compileAsync(scene, camera)` (usa `KHR_parallel_shader_compile` si existe) para evitar tirones al aparecer el primer enemigo de un tipo.

### 3.6 Color
- Sin tonemap por píxel personalizado. Paleta y contraste decididos en las texturas base y en la rampa.
- Confirmar `renderer.toneMapping` actual del proyecto y no cambiarlo sin comparación visual aprobada por el usuario.

---

## 4. Contornos

### 4.1 Técnica elegida: inverted hull selectivo
- Segunda malla que **comparte la geometría** del objeto, con material de contorno: `side: BackSide`, color plano, sin luces, sin texturas.
- **Grosor constante en pantalla**: extrusión en espacio de clip proporcional a `gl_Position.w`, como hace `OutlineEffect` de three (verificado en su código: `pos + normalize(pos - pos2) * thickness * pos.w`). Añadir un tope por distancia para que los objetos lejanos no se conviertan en manchas.
- **Orden de dibujado:** contornos con `renderOrder` mayor que los opacos, para que la profundidad de la malla principal descarte por early-Z los píxeles del casco que quedan detrás. Medir ganancia.
- **Quién lleva contorno:** nave del jugador, enemigos, jefes, recogibles. **No:** balas, partículas, escenario, objetos a más de X distancia (X a calibrar).
- Enemigos con `InstancedMesh`: el contorno es otro `InstancedMesh` que reutiliza el mismo atributo `instanceMatrix`. Claude Code debe verificar en la versión fijada que compartir el atributo entre dos `InstancedMesh` funciona sin copias por frame.

- **Un único casco para toda la nave:** el contorno tiene un solo material, así que todas las piezas de la nave se fusionan en una sola malla de contorno (1 draw call). En la demo: nave en 5 draw calls + 1 de contorno. No hacer un clon de contorno por malla (un juego three.js de referencia lo hacía y llegó a ~340 draw calls antes de optimizar a ~120).
- **Mallas con morph targets:** el contorno debe deformarse igual o se despega.
  - El shader de contorno debe incluir los chunks de morph (`morphtarget_pars_vertex`, `morphtarget_vertex`), como hace `OutlineEffect`.
  - `Mesh.clone()` copia `morphTargetInfluences` con `slice()` (verificado en r186): para que el contorno siga los morphs hay que reasignar al clon **el mismo array**.
  - `_outline_normal` horneada no se deforma con el morph: en mallas con morph usar `normal` o hornear también los deltas.

### 4.1a Grosor variable del contorno, tipo pluma (validado en la demo)
- **Todo en el vertex shader del contorno:** sin draw calls ni coste por píxel extra. Multiplicador final limitado a 0,45×–1,8× (contrastes mayores abren huecos en las esquinas del casco).
- **Grosor según la luz (automático):** `mix(1,45, 0,7, smoothstep(−0,2, 0,5, dot(N_mundo, L)))`, más grueso en el lado en sombra y más fino en el iluminado. La normal usa `modelMatrix` (y `instanceMatrix` en instancias), así que el trazo cambia al alabear. Define `USE_LIGHT_WIDTH`; uniform `uLightDir` (dirección hacia la luz en mundo).
- **Grosor pintado (autor):** en Blender, Vertex Paint sobre un *Color Attribute*, canal R, gris medio = 1×. Llega a three como atributo `color`; no entra en conflicto con la paleta porque el material de la nave no usa color de vértice. Define `USE_PAINTED_WIDTH`, solo en materiales cuyo casco tenga el atributo (si falta, WebGL lee 0 y el contorno desaparece). Piezas sin pintar: valor por defecto 0,5 (1×) al fusionar.
- **Reglas de pintado usadas en la demo (referencia de estilo):** raíz del ala gruesa y punta fina, deriva fina arriba, vientre con más peso, motores con más peso atrás, cañones finos.
- **Densidad:** el grosor solo cambia en los vértices del casco; con un solo segmento de raíz a punta la variación es lineal. Para afinados más marcados, vértices intermedios en los bordes.
- **Descartado:** irregularidad aleatoria del grosor (decisión del usuario); si se usara, debería ser estática para no "hervir".

### 4.1b Trazos interiores finos (validado en la demo)
- **Combinación de referencia (estilo Hi-Fi Rush):** contorno exterior grueso con casco invertido + pocos trazos interiores finos dibujados en el propio material de la nave. Sin post-proceso.
- **Pocos y con intención:** cada trazo debe representar algo (ecuador del fuselaje, línea de flaps, aro final del motor). Marcar automáticamente todas las aristas vivas satura el morro y las zonas curvas (probado y descartado en la demo).
- **Método: isolíneas de un campo lineal por vértice.** Atributo float `_line` por pieza; el trazo se dibuja donde vale 0. Ejemplos de la demo: fuselaje `f = y` (ecuador); motor `f = z − (fin del tubo − 0,35)`; ala `f = distancia firmada a una recta paralela al borde de salida` (flaps). Piezas sin trazo: `1e3`.
- **Ventaja frente a marcar aristas:** al ser lineal, la línea sale recta y limpia independientemente de la topología y la densidad de la malla; no exige que haya aristas donde va el trazo.
- **Shader:** `1 − smoothstep(w·(W/2 − 0,5), w·(W/2 + 0,5), |f|)` con `w = max(fwidth(f), 1e-5)` (nunca `smoothstep` con bordes iguales). Grosor constante en píxeles (`uLineW` × pixel ratio), menor que el contorno exterior (referencia: contorno 2,5–3 px, trazo 1 px). Define `USE_PANEL_LINES`. Color: fila 3 de la paleta.
- **Trazos repetidos (validado en la demo, cañones):** `_line` pasa a `vec2` (valor del campo, periodo). Con periodo > 0 el shader dibuja una línea en cada múltiplo del periodo (`abs(fract(f/p + 0,5) − 0,5) · p`), p. ej. anillos de refrigeración en un cañón. Evitar que tapas planas de una pieza caigan justo en un múltiplo (se pintaría la tapa entera): piezas abiertas o desfase del campo.
- **Líneas de intersección entre piezas (validado en la demo, fuselaje–motores):** segundo atributo float `_line2` por pieza. Cada pieza guarda "cuánto está dentro de la otra" mediante la función implícita de la otra pieza (cilindro del motor evaluado en el fuselaje; sección elíptica del fuselaje evaluada en el motor); la línea se dibuja donde vale 0 en ambas, así se ve a los dos lados de la unión. No es un campo lineal: su precisión depende de la densidad de malla en la zona de unión (en la demo, las góndolas pasan a 6/14 anillos según densidad). En producción es preferible hornear en Blender la distancia a la otra pieza (o marcar la unión) que calcularla en carga.
- **Coste:** un atributo vec2 + un float por vértice y unas pocas operaciones por píxel; 0 draw calls extra.
- **Blender:** el campo se puede calcular por script a partir de un plano o recta definidos por el artista y exportar como atributo `_line` (mismo mecanismo que `_outline_normal`). Un trazo por pieza; si una pieza necesita dos, segundo atributo o pieza separada. Método de autoría pendiente de definir por Claude Code (no verificado).

### 4.2 Problema específico de naves (hard-surface)
- Las naves tienen aristas duras → normales partidas → el casco extruido **se abre en grietas** en las aristas.
- Solución A (preferida, coste cero en runtime): en Blender, hornear normales suavizadas en un atributo de malla llamado `_outline_normal` y exportar con la opción *Attributes* del exportador glTF. Verificado: el exportador solo exporta atributos que empiezan por `_` y escribe el nombre en mayúsculas (`_OUTLINE_NORMAL`); `GLTFLoader` lo pasa a minúsculas (`_outline_normal`). Claude Code debe confirmar el tipo/dominio de atributo admitido por el exportador en la versión de Blender del usuario.
- Solución B (si no hay pipeline de Blender aún): calcular en carga normales promediadas por posición sobre un clon de la geometría (`BufferGeometryUtils.mergeVertices` + `computeVertexNormals`) y copiarlas a ese atributo. Coste solo en carga.
- El shader de contorno usa `_outline_normal` si existe y `normal` como respaldo.

### 4.3 Descartados
- `OutlineEffect` global: recorre la escena dos veces por frame cambiando materiales y la vuelve a renderizar entera (verificado en su `render()`). Solo como referencia/prototipo.
- Contorno por post-proceso (Sobel sobre profundidad/normales): pases a pantalla completa y buffer de normales extra; caro en ancho de banda móvil.
- Contorno sombreado como en la demo.

---

## 5. Reglas de rendimiento (obligatorias)

1. Opacos sin `discard`, sin `alphaTest`, sin `gl_FragDepth`, sin `logarithmicDepthBuffer`.
2. Transparencia solo en efectos pequeños (balas, chispas, estelas). Nada transparente a pantalla completa.
3. **Sin** `EffectComposer`, `UnrealBloomPass`, `SMAAPass` ni `setEffects()` en móvil. **Bloom permitido solo en su versión selectiva y barata (en validación en dispositivo):**
   - **Pase de emisivos a 1/4 de resolución:** malla proxy que comparte la geometría de la nave (sin copia; `matrixWorld` copiada de la nave cada frame) con un material que pinta solo las áreas emisivas (resto negro, que también ocluye). 1 draw call pequeño.
   - **Desenfoque dual filtering** (Bjørge, ARM, SIGGRAPH 2015): 3 bajadas (1/8, 1/16, 1/32) y 3 subidas con núcleos distintos de bajada (5 muestras) y subida (8 muestras). Render targets RGBA8 sin mipmaps, filtrado lineal; solo el primero con depth.
   - **Composición:** un único quad a pantalla completa con mezcla aditiva sobre la imagen ya dibujada en el canvas. **La escena principal no se renderiza a textura:** conserva el MSAA del canvas y evita la copia a resolución completa.
   - **Coste en draw calls:** +8 (1 emisivos + 6 de blur diminutos + 1 composición); el único pase a resolución completa es la composición. `renderer.info.autoReset = false` y `reset()` al inicio del frame para que el HUD cuente todos los pases.
   - **Pendiente:** medir el coste real en dispositivo (tiempo de frame con y sin) antes de adoptarlo; referencia publicada: un juego móvil con bloom no optimizado gastaba ~3 ms por frame (ARM/Nordeus).
4. `setPixelRatio`: nunca `devicePixelRatio` sin tope. Tope inicial 2; **resolución dinámica** por niveles discretos con histéresis según el tiempo de frame (evitar redimensionar el canvas cada frame).
5. `antialias` (MSAA del canvas): decidir midiendo en dispositivo; hipótesis a validar, no hecho: en GPUs de tiles el coste es moderado y con contornos el aliasing se nota.
6. `powerPreference: 'high-performance'` como prueba A/B, no como dogma (es solo una pista al navegador según la doc).
7. Sin shadow maps. **Sombra de la nave en el suelo: blob (validado en la demo).** Quad en el suelo con una elipse de borde duro (antialiasado con `fwidth`, estilo cel) que **multiplica** el color del suelo mediante `CustomBlending` (`blendSrc = ZeroFactor`, `blendDst = SrcColorFactor`), sin escribir profundidad y dibujado tras los opacos. El tinte va en espacio de pantalla (multiplica el framebuffer ya codificado). Se coloca justo debajo de la nave (lectura de posición para el jugador, prioritaria sobre la coherencia con el sol), gira con el rumbo y se estrecha al alabear. Coste: 1 draw call y un área pequeña de blending. Con la cámara de persecución, la sombra solo entra en cuadro si la nave vuela bajo respecto al suelo: la altura de vuelo y la cámara deben definirse juntas (en la demo, suelo a 3,6 unidades por debajo). 
   **Sombra plana proyectada (validada en la demo, opción por defecto).** La misma geometría de la nave se dibuja otra vez aplastada sobre el plano del suelo en el vertex shader (`wp += dir · (sueloY − wp.y) / dir.y`), con la silueta exacta y borde duro.
   - **Luz de sombra propia:** dirección más vertical que el sol del sombreado, para que la sombra quede cerca de la nave y en cuadro. Truco habitual; la coherencia exacta con el sol se sacrifica por legibilidad.
   - **Stencil:** `stencilFunc = NotEqual`, `stencilRef = 1`, `stencilZPass = Replace`; cada píxel se oscurece una sola vez aunque se solapen piezas. Requiere crear el renderer con `stencil: true` (en three r186 el valor por defecto es `false`, verificado en el código fuente).
   - **Resto:** mismo blending multiplicativo que el blob, `side: DoubleSide` (la proyección puede invertir triángulos), `depthWrite: false`, `frustumCulled = false` (la sombra queda fuera de la caja de la nave). Comparte la geometría de la nave, sin copia.
   - **Coste:** 1 draw call; vértices de la nave procesados dos veces (~5.000 triángulos, asumible) y fragmentos solo en el área de la sombra.
   - **Limitaciones:** solo suelo plano; no cae sobre rocas ni relieve (para eso, shadow map, descartado en móvil). Las rocas la ocultan correctamente por el test de profundidad.
   - **Pendiente (decidido por el usuario, más adelante):** rayado estilo Hi-Fi Rush dentro de la sombra, preferiblemente con las rayas fijadas al suelo (espacio de mundo), no a la pantalla.
8. Draw calls: enemigos repetidos con `InstancedMesh`; contornos cuentan doble en el presupuesto.
9. Presupuesto inicial de draw calls: **≤ 40 por frame** en la escena de estrés. Es un objetivo de diseño propuesto, no un dato verificado; calibrarlo con medidas en dispositivo.
10. Piezas pequeñas y lejanas sin contorno (también lo aplicó el juego de referencia para bajar draw calls).

---

## 6. Pipeline de assets (Blender → glTF → three)

- Formato: `.glb`. Nada de FBX en runtime.
- **Fusión por material antes de comprimir:** `gltf-transform` `dedup` → `flatten` → `join`, y `meshopt` como último paso. `join` salta las primitivas con morph targets, y `BufferGeometryUtils.mergeGeometries` exige los mismos morphs en todas las geometrías: cada pieza con morphs es un draw call propio.
- Geometría: compresión **meshopt** con `gltf-transform` y `MeshoptDecoder` en `GLTFLoader`.
- Texturas: KTX2/Basis con `KTX2Loader`; ETC1S para color base. Requiere tener instalado `ktx` (KTX-Software) para el CLI. Las rampas y matcaps diminutos no se comprimen (artefactos de bloque).
- Preferir **texturas de paleta** pequeñas compartidas entre naves frente a un PNG grande por nave.
- Atributo `_outline_normal` horneado en Blender (§4.2). Verificar tras el paso por `gltf-transform` que el atributo sobrevive (`gltf-transform inspect`).
- **Shape keys para estados visuales** (armas que se despliegan, mejoras visibles, daños): las partes ocultas se colapsan a un punto y se expanden en su clave, sin mallas extra ni cambios de visibilidad. Coste: los vértices colapsados siguen pasando por el vertex shader y la malla no se puede fusionar. Usar solo donde compense frente a piezas instanciadas en anclajes.
- **Blender vía MCP (opcional, sin verificar):** un juego de referencia modeló sus assets con un add-on MCP de Blender. Permitiría que Claude genere naves respetando las convenciones (`_outline_normal`, `_shadow_bias`, nombres de piezas). Revisar el add-on antes de adoptarlo.
- GLSL, si se separa en ficheros: Vite permite importarlos como texto con el sufijo `?raw`.

---

## 7. Medición y aceptación

### 7.1 Instrumentación (modo debug, desactivable)
- HUD con: ms de frame (media y p95), `renderer.info.render.calls`, `renderer.info.render.triangles`, `renderer.info.programs.length`, nivel de resolución dinámica actual.
- Escena de estrés reproducible: oleada máxima prevista + jefe + máximo de balas en pantalla.

### 7.2 Dispositivos de prueba (el usuario confirma cuáles tiene)
- 1 Android gama media de 60 Hz, 1 Android de 120 Hz, 1 iPhone reciente.

### 7.3 Criterios
- Escena de estrés: p95 ≤ 16,6 ms en los tres dispositivos; en el Android de 120 Hz, media ≤ 8,3 ms con resolución dinámica permitida.
- Ningún tirón > 50 ms al aparecer un tipo de enemigo nuevo (precompilación OK).
- Comparativa visual antes/después aprobada por el usuario (capturas en las mismas posiciones del raíl).

---

## 8. Plan por fases

1. **Auditoría (sin cambios):** informe con versión de three, renderer, materiales actuales, post-proceso, pixel ratio, draw calls y ms en la escena de estrés. Entregar al usuario antes de tocar nada.
2. **Material toon base** (§3.2, §3.2b, §3.2c) en nave del jugador y un enemigo: 2 tonos tintados, normales por ángulo, densidad en piezas curvas, material único con paleta. Medir.
3. **Feedback de juego** (§3.4c) y especular anime (§3.4b). (Rim descartado, §3.3.)
4. **Contorno selectivo** (§4.1) con solución B de normales; después solución A cuando exista el atributo desde Blender.
5. **Reglas §5** aplicadas a todo el proyecto + resolución dinámica.
6. **Pipeline de assets** (§6).
7. **Metal matcap** (§3.4) solo si el usuario lo aprueba visualmente.
8. Fase B del material (§3.1) solo si los datos lo justifican.

Cada fase termina con medidas en el HUD y capturas; no se pasa a la siguiente sin OK del usuario.

---

## 9. Preguntas abiertas para el usuario

- ¿Qué renderer y versión de three usa el proyecto hoy? ¿Hay post-proceso activo?
- ¿Las naves ya salen de Blender en glTF? ¿Qué versión de Blender?
- ¿Grosor/color del contorno: negro uniforme o tintado por facción?
- ¿Qué dispositivos de prueba hay disponibles?

---

## 10. Fuentes verificadas

- Demo y código: `zaneatega.github.io/Three-js-Anime-Shader`, repo `ZaneAtega/Three-js-Anime-Shader` (shaders y README leídos directamente).
- three.js r187 (paquete npm leído): `WebGLRenderer` (opciones, `compileAsync`, aviso de `logarithmicDepthBuffer`), `gradientmap_pars_fragment`, `OutlineEffect`, `GLTFLoader` (nombres de atributos), `BufferGeometryUtils`, `KTX2Loader`, `meshopt_decoder`.
- Context7 `/mrdoob/three.js`: `MeshToonMaterial.gradientMap`, `DataTexture`, `OutlineEffect`, `onBeforeCompile` / `customProgramCacheKey`.
- Arm: blogs de HSR y fragment pre-pass en Mali; foros Arm sobre FPK, blending y late-Z.
- Safari ProMotion: WebKit bug 173434 y guías de la feature flag *Prefer Page Rendering Updates near 60fps*.
- Blender glTF: commit del exportador "export attributes only if start with underscore".
- gltf-transform CLI: comandos `meshopt`, `etc1s`, `uastc`, `inspect`.
- Vite: importación de assets con `?raw`.
- Guilty Gear Xrd: charla GDC 2015 de Junya C. Motomura y análisis de la comunidad (normales editadas, umbral por color de vértice, textura de umbral).
- Juego "WHACK!" (byteworm, itch.io) y notas de su autor sobre el renderizado (toon + casco invertido + shape keys, fusión por material en móvil).
- gltf-transform: documentación de `join` / `joinPrimitives` (no admite morph targets).
- three.js r186: `Mesh.copy` (`morphTargetInfluences.slice()`), `BufferGeometryUtils.mergeGeometries` (morphs consistentes).
- Demo de validación: artefacto "Cel shader de nave" (2 tonos tintados, normales por ángulo, densidad, normales transferidas, `_shadow_bias`, especular anime, contorno con normales suavizadas, resolución dinámica).

---

## 11. Catálogo de recursos y formato de activo

> Esta sección es la referencia para implementar el cargador de activos y para modelar en Blender. Cada recurso se describe por separado: qué hace, sus parámetros, si vive en el **activo** (fichero de cada nave/objeto) o en el **juego** (global), y cómo se representa en el fichero.
> Valores entre paréntesis = valores validados en la demo.

### 11.0 Formato, ficheros y convenciones

**Tres ficheros por activo, con papeles distintos:**

| Fichero | Qué es | Se abre en Blender |
|---|---|---|
| `<activo>.blend` | **Maestro.** Modificadores sin aplicar, todo editable. | Sí |
| `<activo>.glb` | **Intercambio.** glTF 2.0 binario exportado desde Blender, **sin compresión** (ni meshopt ni KTX2). Es lo que lee el pipeline. | Sí (File › Import › glTF 2.0) |
| `<activo>.build.glb` | **Build del juego.** Generado por el pipeline (§6) con meshopt + KTX2. | **No garantizado**: los ficheros con meshopt o KTX2 no deben considerarse abribles en Blender (según una fuente secundaria, Blender no carga KTX2 ni meshopt; Claude Code debe comprobarlo). Nunca editar este fichero. |

**Exportación desde Blender (glTF 2.0):**
- Activar *Include › Custom Properties* (las propiedades personalizadas se exportan como `extras`; el exportador documenta soporte de "Extras (custom properties)").
- Activar la exportación de atributos (*Attributes*): solo se exportan los atributos cuyo nombre empieza por `_` (verificado en el commit del exportador).
- Activar la exportación de color de vértice (`COLOR_0`). **Verificar** el comportamiento exacto de esta opción en la versión de Blender usada (ha cambiado entre versiones).
- Aplicar modificadores al exportar (el `.glb` contiene la malla ya evaluada; el `.blend` conserva los modificadores).

**Lectura en el juego (three.js):**
- `extras` de nodos, mallas y materiales → `userData` del objeto correspondiente (verificado en `GLTFLoader` r186: `assignExtrasToUserData` en nodos, mallas, materiales, escenas).
- Atributos con `_` → mismo nombre en minúsculas (`_OUTLINE_NORMAL` → `_outline_normal`, verificado).
- `COLOR_0` → atributo `color`.

**Convenciones:**
- Unidades: metros. Una nave de jugador mide ~5–6 u de largo (demo).
- Orientación: en Blender el morro mira a **+Y** y arriba es **+Z**; con la conversión del exportador a +Y arriba, el morro queda hacia **−Z** en three, que es la convención del juego. **Verificar con un activo de prueba** antes de modelar en serie.
- Nombres de objetos: `<rol>` en minúsculas con sufijo de lado (`wing_l`, `engine_r`). Los Empties de datos usan prefijos fijos (§11.12–§11.14); ninguna pieza puede empezar por esos prefijos.
- **Las piezas se mantienen separadas en el `.glb`** (fuselaje, alas, motores…). El juego las fusiona al cargar en una sola malla (§11.3). Así el fichero sigue siendo editable y los cálculos por pieza (intersecciones, trazos) son posibles.

**Resumen: dónde vive cada recurso**

| # | Recurso | Ámbito | Representación en el fichero |
|---|---|---|---|
| 11.1 | Piezas y geometría | Activo | Objetos malla con nombre |
| 11.2 | Normales de sombreado | Activo | Normales de la malla (exportadas) |
| 11.3 | Paleta y material único | Activo + juego | UV0 + textura de paleta + `extras` del material |
| 11.4 | Sombreado 2/3 tonos | Juego (+ color de sombra por zona en paleta) | — |
| 11.5 | Rim light | **Descartado** (§3.3) | — |
| 11.6 | Especular anime | Juego (+ intensidad por zona) | `extras` del material |
| 11.7 | Metal (matcap) | Juego (+ máscara por zona) | `extras` del material |
| 11.8 | Sombra pintada | Activo (opcional) | Atributo `_shadow_bias` |
| 11.9 | Contorno exterior | Juego (+ color y grosor por zona/vértice) | Paleta + `COLOR_0.R` (+ `_outline_normal` opcional) |
| 11.10a | Aristas (líneas interiores automáticas) | Activo | Atributo `_EDGE` (calculado al exportar) |
| 11.10 | Trazos interiores | Activo | Atributo `_LINE` (horneado) |
| 11.11 | Líneas de intersección | Activo | Atributo `_LINE2` (horneado) |
| 11.12 | Calcomanías | Activo + atlas del juego | Empties `decal_*` |
| 11.13 | Áreas emisivas | Activo | Empties `emit_*` |
| 11.14 | Toberas y puntos de disparo | Activo | Empties `nozzle_*`, `muzzle_*` |
| 11.15 | Llama de motor | Juego | — (usa `nozzle_*`) |
| 11.16 | Sombra en el suelo | Juego | — (usa la geometría) |
| 11.17 | Bloom selectivo | Juego | — (usa `emit_*`) |

### 11.1 Piezas y geometría
- **Qué:** silueta y volumen de la nave.
- **Parámetros:** ninguno en tiempo de ejecución.
- **Autoría:** un objeto por pieza con nombre de rol. Densidad solo en piezas curvas (fuselaje 32 segmentos, cabina 32×12, góndolas 24 en la demo); paneles planos con la mínima geometría. Piezas que se cruzan (motor dentro del fuselaje) se dejan cruzadas, sin booleanas.
- **Fichero:** mallas glTF; triángulos tras exportar.

### 11.2 Normales de sombreado
- **Qué:** deciden la forma de la sombra cel (§3.2b).
- **Parámetros:** ángulo de suavizado (55°).
- **Autoría:** modificador *Smooth by Angle* (55°). Opcional: *Data Transfer* de normales desde una forma simple (cilindro/elipsoide) para sombras más gráficas. Paneles planos (alas, aletas, carlinga facetada) con aristas vivas.
- **Fichero:** `NORMAL` de cada primitiva (normales personalizadas aplicadas al exportar).

### 11.3 Paleta y material único
- **Qué:** todo el color de la nave en una textura pequeña; un material y un draw call (§3.2c).
- **Parámetros por zona (casilla):** color base, color de sombra, color de contorno; y propiedades: `spec`, `metal`, `emissive` (0–1).
- **Autoría:**
  - Una imagen PNG `<activo>_palette.png` (sRGB), una columna por zona, **3 filas**: 0 = base, 1 = sombra, 2 = contorno. Casillas de 8×8 px como mínimo para que el filtrado no mezcle vecinas.
  - Material único `cel` con la imagen conectada al *Base Color* del Principled BSDF (así el exportador la incluye como `baseColorTexture` sin conversiones).
  - UV0: las caras de cada zona, escaladas dentro de su casilla (sin desplegado cuidadoso).
  - Propiedades por zona como propiedades personalizadas **del material**: `cel_sw_<n>` = vector de 3 floats `[spec, metal, emissive]` (n = índice de columna).
- **Fichero:** `TEXCOORD_0`, `baseColorTexture`, `material.extras.cel_sw_<n>`.
- **Juego:** construye la textura de propiedades (o un array de uniforms) a partir de `cel_sw_*`; `NearestFilter`, sin mipmaps.
- **Nota:** la demo usaba una cuarta fila de propiedades en la propia textura; en producción las propiedades van en `extras` para no mezclar datos lineales con colores sRGB en la misma imagen.

### 11.4 Sombreado 2/3 tonos
- **Qué:** corte de luz/sombra con color de sombra tintado por zona (§3.2).
- **Parámetros (juego):** número de tonos (2), umbral `uBandT` (0), borde antialiasado, luz direccional de intensidad π, sin luz ambiente.
- **Parámetros (activo):** color de sombra de cada zona → fila 1 de la paleta.

### 11.5 Rim light — descartado
- No forma parte del formato (§3.3). Las propiedades de zona no tienen `rim`.

### 11.6 Especular anime
- **Parámetros (juego):** tamaño `uSpecT` (0,988), color (blanco).
- **Parámetros (activo):** `spec` de cada zona (cabina 0,8; metal 0,9; fuselaje 0,55; resto 0).

### 11.7 Metal (matcap)
- **Parámetros (juego):** textura matcap compartida (generada o PNG del juego).
- **Parámetros (activo):** `metal` de cada zona (0/1).

### 11.8 Sombra pintada (opcional)
- **Qué:** zonas siempre en sombra (oclusión), nunca sombras proyectadas (§3.2b).
- **Parámetros:** valor por vértice, negativo = más sombra (−1,5 = siempre en sombra).
- **Autoría:** atributo float de malla `_shadow_bias` en el dominio de punto. Pintar atributos float directamente no es cómodo en Blender: crearlo con *Geometry Nodes* (*Store Named Attribute*, p. ej. por selección o proximidad) y aplicar el modificador antes de exportar. Claude Code debe documentar el procedimiento probado en la versión de Blender usada.
- **Fichero:** atributo `_SHADOW_BIAS` → `_shadow_bias`. Ausente = 0.
- **Relación con el umbral de sombra:** se suma a N·L antes de compararlo con el umbral. Sombra donde `N·L + sombra pintada < umbral`: pintar −0,3 equivale a subir el umbral 0,3 solo en esa zona.

### 11.8b Rayado de tinta (juego; en prueba en el visor, noviembre de 2026)
- **Qué:** un tercer escalón por debajo de la sombra, con rayas de tinta, efecto cómic. Rayado donde `N·L + sombra pintada < umbral − profundidad`. Con −1,5 pintado, una zona queda siempre rayada (el vientre). Sin pintar, se raya lo que más da la espalda a la luz; con profundidad 1,5, solo lo pintado.
- **Rayas fijas a la nave:** son los cortes de la superficie con planos paralelos en el espacio del modelo, así que siguen sus curvas y se mueven y giran con ella (sin el efecto «cortina de ducha» de una trama fija a la pantalla). Grosor constante en píxeles; se desvanecen cuando en pantalla quedan a menos de ~3 px (modelos lejanos). Color = color de contorno de la zona; las zonas emisivas nunca se rayan.
- **Parámetros (juego):** profundidad (0,5), separación (0,05 u en un modelo de 2,2 u), ángulo de los planos alrededor del eje vertical del modelo (45°; 0° = anillos alrededor del largo, 90° = a lo largo), grosor (1 px).
- **Parámetros (activo):** ninguno nuevo: usa la sombra pintada (§11.8). Si algún día hace falta rayar algo que no está en sombra, sería un atributo propio `_HATCH`.
- **Coste:** unas pocas operaciones por píxel en el mismo shader; sin texturas ni draw calls.
- **Pendiente de decidir:** si se adopta, sus valores, y si se añade un rayado cruzado para la sombra más profunda. El rayado de la sombra en el suelo (§13.4) podría compartir el estilo.

### 11.9 Contorno exterior
- **Qué:** casco invertido con grosor constante en píxeles (§4).
- **Dónde se ve (juego), decisión del usuario (noviembre de 2026):** **solo silueta** por defecto. Cada modelo tiene su propio número de stencil (bits 1–7: hasta 127 modelos a la vez; la sombra plana usa el bit 0). Donde el modelo queda delante, el stencil guarda su número, y su contorno solo se dibuja donde el número no es el suyo: el borde exterior y nada más, también sobre otros modelos. Lo de dentro lo dibujan las aristas (§11.10a) y los trazos (§11.10–§11.11), finos, y el exterior queda grueso, efecto cómic. La alternativa **casco** dibuja también donde una pieza tapa a otra y, en modelos con detalle, rayas sueltas entre relieves (el casco asoma a trozos). Limitaciones del modo silueta: las piezas de un mismo `.glb` forman una sola silueta (se fusionan en una malla); y las instancias de un `InstancedMesh` comparten material y, por tanto, número: dos enemigos iguales solapados se leen como una sola forma. Cómo agrupar enemigos se decide en el juego (aceptarlo, contorno «casco» para ellos o repartirlos en varios lotes con números distintos).
- **Parámetros (juego):** grosor base (2 px), grosor según la luz (×1,45 en sombra, ×0,7 en luz), límites (0,45×–1,8×), tope por distancia.
- **Parámetros (activo):**
  - Color de contorno por zona → fila 2 de la paleta.
  - Grosor pintado → **`COLOR_0` canal R** (0,5 = 1×; 1,0 = 2×; 0 = 0×). Autoría: *Color Attribute* pintado en *Vertex Paint*. Si la pieza no tiene color de vértice, el juego usa 1×.
  - Normales de contorno: **las calcula el juego al cargar** (promedio de normales por posición, §4.2 solución B). Opcional: atributo `_outline_normal` horneado si una pieza necesita control manual.

> **Decisión del usuario (noviembre de 2026):** los trazos (§11.10 y §11.11) van **horneados en el activo** como atributos por vértice. El visor y el juego no calculan nada: si el atributo viene, se pinta; si no, no hay trazo. Sustituye a la versión anterior de esta spec (Empties `line_*` y propiedad `cel_intersect` calculados al cargar).

### 11.10a Aristas (líneas interiores automáticas)
- **Qué:** líneas finas sobre las aristas de la malla: automáticas en las aristas duras, con control a mano arista por arista. Con el contorno en modo silueta (§11.9), un cubo se ve con el borde exterior grueso y la «Y» interior fina.
- **Regla:** una arista es línea si es **dura** (las normales del sombreado se separan en ella: lo que decide *Smooth by Angle* o las aristas *Sharp*) o es borde abierto de la malla; **más** las marcadas `line_on`, **menos** las marcadas `line_off`. Las diagonales de la triangulación nunca.
- **Parámetros (juego):** grosor (1 px), color = color de contorno de la zona. Coste: ningún draw call ni pase extra; se pintan en el mismo shader, sobre la superficie, con coordenadas baricéntricas.
- **Autoría en Blender:** nada para las automáticas. Para corregir: en modo edición, seleccionar aristas y *Mesh › Set Attribute* sobre atributos booleanos de arista llamados `line_on` (añadir) o `line_off` (quitar). `npm run asset:blend` calcula la regla al exportar. En la vía A, el generador aplica la misma regla.
- **Fichero:** atributo `_EDGE` (vec3 por esquina de triángulo): el one-hot de la esquina + 2 × las marcas de las tres aristas del triángulo (la arista k es la opuesta a la esquina k; 1 = línea). glTF no tiene datos por arista, así que el script de exportación triangula y lo escribe por esquina. Ausente = sin aristas.
- **Verificado (noviembre de 2026)** en Blender 5.2.3 con `viewer/samples/edge-test/` (cubo facetado con una arista `line_off`, cilindro suavizado a 55° con una arista `line_on`): llegan al `.glb` exactamente las 11 y 33 aristas esperadas, sin triángulos mal formados, y el sombreado (facetado y suave) sobrevive a la triangulación.

### 11.10 Trazos interiores
- **Qué:** pocas líneas finas con intención (§4.1b).
- **Parámetros (juego):** grosor (1,25 px), color = color de contorno de la zona.
- **Parámetros (activo), por pieza:** un campo por vértice cuyo cero es el trazo, y su periodo.
- **Fichero:** atributo `_LINE` (vec2, dominio de punto): x = valor del campo (el trazo se dibuja donde vale 0; lejos de 0, p. ej. 1000, = sin trazo); y = periodo (0 = una sola línea; >0 = líneas repetidas cada `periodo` unidades, p. ej. anillos de un cañón). Pieza sin el atributo = sin trazo. Un trazo por pieza; si hacen falta dos, el segundo va en `_LINE2` o en otra pieza.
- **Autoría:** el campo debe ser lineal sobre la pieza para que la línea salga recta: la distancia firmada a un plano (ecuador: `y`; flaps: distancia a una recta paralela al borde de salida). En la vía A (§12.4) lo calcula el generador. En Blender: *Geometry Nodes › Store Named Attribute* con la distancia a un plano, aplicado antes de exportar (procedimiento pendiente de documentar cuando se modele en Blender).

### 11.11 Líneas de intersección
- **Qué:** línea fina donde una pieza se mete en otra (fuselaje–motor).
- **Fichero:** atributo `_LINE2` (float, dominio de punto) en cada una de las dos piezas: cuánto está dentro de la otra (distancia firmada a la superficie de la otra pieza). La línea sale donde vale 0, a los dos lados de la unión. Lejos de 0 = sin línea. Pieza sin el atributo = sin línea.
- **Autoría:** en la vía A, el generador lo calcula con la forma implícita de la otra pieza (como la demo). En Blender: *Geometry Nodes › Geometry Proximity* (pendiente de probar). Su precisión depende de la densidad de malla en la zona de unión.

### 11.12 Calcomanías
- **Qué:** pegatinas proyectadas en el material (§3.2d).
- **Parámetros (juego):** atlas único del juego (PNG sRGB con alfa, casillas fijas). No va dentro del activo.
- **Parámetros (activo), por calcomanía:** casilla del atlas, posición, orientación, tamaño.
- **Autoría:** Empty `decal_<nombre>` con propiedad `slot` (int). Su caja local de −1 a +1 define la pegatina: X local = ancho, Y local = alto (arriba de la imagen), Z local = dirección de proyección. Escalar el Empty para dimensionarla. Máximo 4 por activo.
- **Fichero:** nodo `decal_*` con transformación y `extras.slot`.

### 11.13 Áreas emisivas
- **Qué:** punto, línea o región de luz sobre la superficie, con luz derramada en 2 bandas, halo por el contorno y bloom (§3.2c).
- **Parámetros por área:** color de la luz, radio del núcleo (0,08), alcance del brillo (0,5), parpadeo (encendido/apagado en s; 0,6/0,6).
- **Autoría:** Empty `emit_<nombre>`. El segmento emisor va de X local −1 a +1 (longitud = 2 × escala X); con escala X ≈ 0 es un punto; con radio grande, una región. Propiedades personalizadas: `color` (vector de 3 floats en sRGB 0–1, color de la luz), `core` (float), `glow` (float), `blink_on`, `blink_off` (floats, 0 = fija). Máximo 4 por activo. El núcleo caliente y el cristal apagado salen del mismo color (más claro y muy oscuro); cada área puede tener su color.
- **Fichero:** nodo `emit_*` con transformación y `extras`.
- **Juego:** construye los uniforms `uEmA[]`, `uEmB[]` y el pase de bloom.

### 11.14 Toberas y puntos de disparo
- **Autoría:** Empties `nozzle_<n>` y `muzzle_<n>`. Eje Z local = dirección de salida (de la llama o del disparo). En `nozzle_*`, propiedades `radius` y `length` de la llama.
- **Fichero:** nodos con transformación y `extras`.

### 11.15 Llama de motor (juego)
- Shader propio, aditivo, modo suave por defecto (§ llama en la demo). Se coloca en cada `nozzle_*`. Todas las llamas de una nave en 1 draw call.

### 11.16 Sombra en el suelo (juego)
- Sombra plana proyectada con stencil (§5.7). No necesita datos del activo: reutiliza su geometría.

### 11.17 Bloom selectivo (juego)
- Solo de las áreas `emit_*` (§5.3). Parámetros globales: resolución del pase (1/4), niveles (3), intensidad (1,6).

### 11.18 Límites y riesgos del formato
1. **Blender abre el `.glb`, pero no muestra el aspecto cel:** verás la malla, la paleta como textura, los colores de vértice, los Empties y sus propiedades personalizadas, renderizados con los materiales de Blender. La vista final solo existe en el juego (o en un visor del juego). Un material de previsualización en Blender es posible pero no es parte de esta spec.
2. **Al exportar se pierden** los modificadores (quedan aplicados) y la forma de visualización de los Empties (cubo, flecha); sí se conservan posición, giro, escala, jerarquía y propiedades personalizadas. Por eso el maestro es el `.blend`.
3. **El build comprimido no es para Blender** (11.0).
4. **Verificado con el activo de prueba `viewer/samples/demo-ship/` en Blender 5.2.3 LTS (noviembre de 2026), ciclo three → `.glb` → importar en Blender → exportar → visor, con el mismo resultado visual:**
   - Atributos `_SHADOW_BIAS`, `_LINE` (FLOAT2) y `_LINE2` se importan como atributos de punto con su nombre y se reexportan con *Attributes* activado.
   - `COLOR_0` se importa como *Color Attribute* de esquina (BYTE_COLOR) y se reexporta como VEC4 unsigned short normalizado; el cargador lo lee igual (canal R). Pierde algo de precisión (0,5 → 0,503), sin efecto visible en el grosor.
   - Orientación: el morro (−Z en three) queda hacia +Y en Blender, arriba +Z, y vuelve igual.
   - `extras` de Empties (`emit_*`, `decal_*`, `nozzle_*`) y del material (`cel_sw_*`) se conservan; giros y escalas de los Empties también.
   - La paleta se importa con interpolación *Closest* y espacio sRGB.
   - Opciones de exportación usadas: `export_extras`, `export_attributes`, `export_vertex_color='ACTIVE'`, `export_all_vertex_colors`.

---

## 12. Visor de activos, producción de activos y bucle de revisión

> Objetivo del usuario: un **visor** en three.js que use **exactamente el mismo código de render que el juego**, al que se le pasa un activo y sirve para validarlo; y que **Claude Code genere y mejore los activos** a partir de prompts del usuario, revisándolos él mismo en el visor con Playwright antes de entregarlos.

### 12.1 Arquitectura: un solo código de render
- **Módulo de render compartido** (p. ej. `packages/cel-render`): materiales cel (§3), contorno y trazos (§4), calcomanías y áreas emisivas (§3.2c–d), sombra plana, llama, bloom (§5), y el **cargador de activos** que interpreta la sección 11 (fusión de piezas, paleta, `extras`, Empties y, si el activo no las trae, normales de contorno; los trazos vienen horneados, §11.10). Sin dependencias de UI.
- **Juego** y **visor** importan ese módulo; ninguno duplica lógica de render. Una corrección en el visor es una corrección en el juego.
- Si el repo del juego ya tiene otra estructura, Claude Code la respeta y extrae el módulo compartido dentro de ella. Propuesta si no hay ninguna:
  ```
  packages/cel-render/      código compartido (render + cargador)
  apps/game/                juego
  apps/viewer/              visor
  assets/<activo>/          fuente del activo (ver 12.4) y salidas
  tools/capture/            capturas con Playwright
  tools/build-assets/       pipeline gltf-transform → .build.glb (§6)
  ```
- Stack: Vite + TypeScript (Vite ya contemplado en §6). Versión de three fijada en `package.json`; revalidar APIs con Context7 si cambia (§0).

### 12.2 Visor: funciones
- **Carga:** arrastrar un `.glb`, o parámetro de URL `?asset=<ruta>`. Recarga en caliente al cambiar el fichero (servidor de desarrollo de Vite).
- **Vista:** cámara orbital, poses fijas (persecución, lateral, frontal, cenital, 3/4, inferior), suelo y luz como en el juego, animación de vuelo opcional.
- **Panel:** los mismos interruptores de la demo (§13.2) para comparar efectos, con los valores por defecto del juego.
- **HUD:** fps, p95, Hz estimados, draw calls (contando todos los pases: `renderer.info.autoReset = false` + `reset()` por frame), triángulos, programas, resolución.
- **Validador (12.3)** con su informe visible en el visor y exportable como JSON.
- **Modo captura** (para Playwright): `?capture=1&pose=<nombre>&t=<segundos>&blink=on|off&dpr=1`. Congela el tiempo en `t`, fija el estado del parpadeo, oculta la UI, fija el pixel ratio y, cuando el primer frame está listo, pone `window.__viewerReady = true`.
- **Uso en móvil:** servidor de desarrollo accesible en la red local (`vite --host`) o despliegue estático, para que el usuario abra el visor en su teléfono y mida rendimiento real.

### 12.3 Validador del activo
Comprueba la sección 11 y devuelve errores (bloquean) y avisos:
- **Errores:** paleta ausente o sin 3 filas; material distinto de `cel`; UV0 ausente; más de 4 `emit_*` o 4 `decal_*`; `emit_*` sin `color`/`core`/`glow`; `decal_*` sin `slot`; extensiones de compresión en un `.glb` de intercambio (meshopt/KTX2 solo en `.build.glb`).
- **Avisos:** triángulos por encima del presupuesto acordado; pieza curva con densidad baja; casillas de paleta menores de 8×8 px; color de vértice ausente (grosor de contorno 1×); orientación sospechosa (morro no hacia −Z).
- **Métricas:** triángulos tras fusionar, draw calls de la nave (objetivo: 1 + contorno), número de zonas de paleta, emisivos, calcomanías, trazos.

### 12.4 Producción de activos: dos vías, mismo resultado
El activo final siempre es un `.glb` de intercambio que cumple la sección 11. Se elige **por activo**:

**A) Solo código (vía por defecto).** Recomendada para naves duras y paramétricas.
- Fuente: un script `generate.ts` junto al activo (ejemplo, el activo de prueba del visor: `viewer/samples/demo-ship/`). Construye piezas (perfiles de revolución, extrusiones, simetrías), paleta, UV de paleta, color de vértice, atributos de trazo (`_line`, `_line2`) y sombra pintada, y Empties (`emit_*`, `decal_*`, `nozzle_*`, `muzzle_*`) con sus `userData`, y exporta con `GLTFExporter` de three.js desde Node (`node generate.ts`).
- Verificado en r186: `GLTFExporter` serializa `userData` como `extras` en nodos, mallas y materiales, y antepone `_` a los atributos no estándar.
- Ventajas: texto versionable y legible en git, reproducible, variantes por parámetros (familias de enemigos, mejoras visibles del roguelite). Sin Blender instalado.
- Límites: formas orgánicas o esculpidas; retoques manuales del usuario.

**B) Código + Blender.** Para activos que el usuario quiera retocar a mano o que pidan herramientas de Blender.
- Fuente: `assets/<activo>/<activo>.blend` (maestro) + `assets/<activo>/scripts/*.py` (un script por cambio, versionado).
- Claude Code ejecuta Blender sin interfaz con un script `bpy` que abre el `.blend`, aplica el cambio, guarda y exporta el `.glb` con las opciones de §11.0 fijadas en el script (forma habitual: `blender --background <activo>.blend --python <script>.py`; verificar los argumentos con la versión instalada).
- Requiere Blender instalado. Commit del `.blend` y del script tras cada iteración aceptada (el `.blend` es binario; el script documenta el cambio).
- Vía no verificada y no necesaria: add-on MCP de Blender para trabajar con Blender abierto.

**Paso entre vías:** un activo de la vía A puede importarse en Blender y continuar por la vía B; desde ese momento el `.blend` es el maestro y el generador deja de usarse para ese activo. El paso inverso no se contempla.

**Diseño:** todos los activos son diseños originales. No reproducir naves, personajes ni logotipos de franquicias existentes, ni aproximarse a ellos por acumulación de rasgos.

### 12.5 Bucle de revisión con Playwright
Para cada prompt del usuario sobre un activo:
1. Claude Code modifica la fuente (generador o `.blend` + script).
2. Genera el `.glb` de intercambio.
3. Carga el activo en el visor en modo captura y ejecuta el validador. Si hay errores, corrige y vuelve al paso 1.
4. Saca capturas de las 6 poses fijas con el parpadeo encendido, y la de persecución también apagado.
5. Revisa las capturas con una lista mínima: silueta legible; sin nave teñida entera (error conocido §3.2c); sin grietas de contorno; trazos interiores donde se pidieron y solo esos; emisivos con su forma; calcomanías en su sitio y orientación; sombra en el suelo coherente.
6. Entrega al usuario: resumen del cambio, informe del validador, métricas y capturas. **El juicio estético final es del usuario.**
7. Si el usuario lo aprueba, commit (y `.build.glb` con el pipeline de §6).

**Notas de entorno (comprobadas en esta sesión):**
- El navegador sin pantalla renderiza por software (SwiftShader). Con Chromium de Playwright funcionó con los argumentos `--use-angle=swiftshader --enable-unsafe-swiftshader --ignore-gpu-blocklist`.
- Es lento: usar resoluciones moderadas y `dpr=1` en captura, y esperar a `window.__viewerReady`. **Nunca usar sus fps como medida de rendimiento.** El rendimiento se mide en el móvil del usuario con el visor.
- Las capturas de referencia para detectar regresiones solo son comparables dentro del mismo entorno de captura.

---

## 13. Estado actual y decisiones del usuario (para retomar en otra sesión)

### 13.1 Implementación de referencia
- Demo validada: fichero `nave-cel-shader.html` (entregado junto a esta spec). Contiene una implementación funcional de todas las técnicas de esta spec sobre three.js r186.1 y sirve de referencia de comportamiento, **no** de arquitectura (es un único fichero de demo con geometría procedural).
- Nave de la demo: diseño original (morro romo con toma de aire, carlinga poligonal, cuerpo ensanchado y engrosado tras la carlinga, dos motores laterales, alas en flecha caídas sobre las góndolas, cañones bajo las alas, deriva dorsal central).

### 13.2 Valores por defecto decididos por el usuario
- Resolución: nativa (máx. 2×). Densidad de malla: alta.
- Sombreado: 2 tonos con sombra tintada; normales por ángulo.
- **Rim light: descartado** (no se implementa, §3.3). Especular anime: activado. Metal: activado.
- Contorno exterior: 2 px, tintado por zona, grosor según la luz + grosor pintado. Sin irregularidad aleatoria.
- Trazos interiores: 1,25 px; pocos y con intención (ecuador, flaps, final de motor, timón de deriva, anillos de cañón, uniones fuselaje–motor).
- Llama de motor: modo suave (aditivo), **sin contorno** (probado y rechazado).
- Calcomanía de prueba: bandera de España simple en el morro.
- Sombra en el suelo: silueta plana con stencil; luz de sombra más vertical que el sol.
- Luces: **áreas emisivas** con parpadeo on/off (0,6/0,6 s) y halo por el contorno. Rechazados por el usuario: pieza emisiva visible (cuadrado cian) y sprite de halo.
- Bloom selectivo: activado en la demo, **pendiente de medir** en el móvil (con y sin) antes de adoptarlo.

### 13.3 Medidas en dispositivo
- Android del usuario, demo completa: 120 fps, p95 8,4 ms, resolución 2×, 7–8 draw calls, ~15.500 triángulos (antes del bloom).
- iPhone: Safari limita a 60 fps por defecto (§0.1).

### 13.4 Pendientes
1. Medir el coste del bloom selectivo en el móvil.
2. Escena de estrés (§7): 20–30 enemigos instanciados con material, contorno y sombra.
3. ~~Verificaciones del formato con un activo de prueba (§11.18 punto 4).~~ Hecho (noviembre de 2026).
4. Rayado tipo Hi-Fi Rush dentro de la sombra del suelo (aplazado por el usuario).
5. Crear el módulo de render compartido, el visor y el validador (§12) y migrar la nave de la demo a un generador de la vía A.
6. Hornear la oclusión ambiental como sombra pintada (§11.8), automática en `asset:blend` y en los generadores. Detalle en `specs/ambient-occlusion-bake.md`.
