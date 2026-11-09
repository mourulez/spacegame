import type { CelParams, ModelFeatures } from './render-next/index.ts';

/*
 * The look's settings panel, the same controls as the reference demo. A
 * control is greyed out, with the reason under it, when the model lacks the
 * data it needs or render-next doesn't have the feature yet. A dot marks
 * every value that differs from the library's defaults.
 */

type Key = keyof CelParams;
type Need = keyof ModelFeatures | 'pending';

interface Base {
  key: Key;
  label: string;
  hint?: string;
  needs?: Need[];
}
interface Segmented extends Base {
  kind: 'seg';
  options: [value: string, label: string][];
}
interface Toggle extends Base {
  kind: 'switch';
}
interface Range extends Base {
  kind: 'range';
  min: number;
  max: number;
  step: number;
  unit?: string;
}
type Control = Segmented | Toggle | Range;

const GROUPS: { title: string; controls: Control[] }[] = [
  {
    title: 'Sombreado',
    controls: [
      { kind: 'seg', key: 'bands', label: 'Tonos', options: [['2', '2 tonos'], ['3', '3 tonos'], ['soft', 'Suave']], hint: '2 tonos es la sombra anime: el mismo color en versión tintada, con un corte limpio.' },
      { kind: 'range', key: 'bandThreshold', label: 'Umbral de sombra', min: -0.5, max: 0.5, step: 0.05 },
      { kind: 'switch', key: 'shadowBias', label: 'Sombra pintada', needs: ['shadowBias'], hint: 'Zonas siempre en sombra pintadas en el modelo, como el vientre.' },
      { kind: 'switch', key: 'hatch', label: 'Rayado de tinta', hint: 'Un escalón por debajo de la sombra: lo pintado como sombra y, sin pintar, lo que más da la espalda a la luz.' },
      { kind: 'range', key: 'hatchDepth', label: 'Profundidad', min: 0, max: 1.5, step: 0.05, hint: 'Cuánto por debajo del corte de sombra empieza el rayado.' },
      { kind: 'range', key: 'hatchSpacing', label: 'Separación', min: 0.02, max: 0.15, step: 0.005, unit: ' u' },
      { kind: 'range', key: 'hatchAngle', label: 'Ángulo', min: 0, max: 90, step: 5, unit: '°', hint: '0°: anillos alrededor del largo; 90°: a lo largo.' },
      { kind: 'range', key: 'hatchWidth', label: 'Grosor de raya', min: 0.5, max: 2.5, step: 0.25, unit: ' px' },
    ],
  },
  {
    title: 'Brillos',
    controls: [
      { kind: 'switch', key: 'spec', label: 'Brillo especular anime' },
      { kind: 'range', key: 'specThreshold', label: 'Corte del especular', min: 0.95, max: 0.999, step: 0.001, hint: 'Más alto, punto más pequeño.' },
      { kind: 'switch', key: 'metal', label: 'Metal falso', needs: ['metal'] },
    ],
  },
  {
    title: 'Contorno',
    controls: [
      { kind: 'switch', key: 'outline', label: 'Contorno' },
      { kind: 'seg', key: 'outlineMode', label: 'Dónde', options: [['silhouette', 'Solo silueta'], ['hull', 'Casco']], hint: 'Solo silueta: el borde exterior y nada más; lo de dentro lo dibujan aristas y trazos. Casco: también donde una pieza tapa a otra, y a trozos entre detalles.' },
      { kind: 'seg', key: 'outlineColor', label: 'Color', options: [['tint', 'Tintado por zona'], ['flat', 'Uniforme']], needs: ['palette'] },
      { kind: 'seg', key: 'outlineNormals', label: 'Normales', options: [['smooth', 'Suavizadas'], ['raw', 'Originales']], hint: 'Con las originales se abren grietas en las aristas duras.' },
      { kind: 'range', key: 'outlineWidth', label: 'Grosor', min: 0.5, max: 4, step: 0.25, unit: ' px' },
      { kind: 'switch', key: 'outlineLightWidth', label: 'Grosor según la luz', hint: 'Tipo pluma: más grueso en el lado en sombra.' },
      { kind: 'range', key: 'outlineShadeK', label: 'En sombra', min: 1, max: 2, step: 0.05, unit: '×' },
      { kind: 'range', key: 'outlineLitK', label: 'En luz', min: 0.4, max: 1, step: 0.05, unit: '×' },
      { kind: 'switch', key: 'outlinePaintedWidth', label: 'Grosor pintado', needs: ['paintedWidth'] },
      { kind: 'range', key: 'outlineFadeStart', label: 'Afina desde', min: 5, max: 40, step: 1, unit: ' u', hint: 'Distancia a la cámara a partir de la que el contorno adelgaza.' },
    ],
  },
  {
    title: 'Líneas interiores',
    controls: [
      { kind: 'switch', key: 'edges', label: 'Aristas', needs: ['edges'], hint: 'Las aristas duras del modelo, más las marcadas con line_on y menos las marcadas con line_off.' },
      { kind: 'range', key: 'edgeWidth', label: 'Grosor de aristas', min: 0.5, max: 2.5, step: 0.25, unit: ' px', needs: ['edges'] },
      { kind: 'switch', key: 'lines', label: 'Trazos', needs: ['lines'], hint: 'Líneas sobre las caras: paneles, anillos, uniones entre piezas.' },
      { kind: 'range', key: 'lineWidth', label: 'Grosor de trazo', min: 0.5, max: 2.5, step: 0.25, unit: ' px', needs: ['lines'] },
    ],
  },
  {
    title: 'Efectos',
    controls: [
      { kind: 'switch', key: 'emissive', label: 'Áreas emisivas', needs: ['emissive'] },
      { kind: 'switch', key: 'bloom', label: 'Bloom selectivo', needs: ['emissive'], hint: 'Solo las áreas emisivas, a 1/4 de resolución. Compara el tiempo de frame con y sin.' },
      { kind: 'switch', key: 'decals', label: 'Calcomanías', needs: ['decals'] },
    ],
  },
  {
    title: 'Escena',
    controls: [
      { kind: 'seg', key: 'groundShadow', label: 'Sombra en el suelo', options: [['planar', 'Silueta'], ['blob', 'Elipse'], ['off', 'No']], hint: 'Silueta: la propia malla aplastada sobre el suelo. Las dos, un draw call y sin shadow maps.' },
      { kind: 'seg', key: 'resolution', label: 'Resolución', options: [['auto', 'Auto'], ['1', '1×'], ['native', 'Nativa']], hint: 'Auto baja o sube por escalones según el tiempo de frame. Nativa se limita a 2×.' },
    ],
  },
];

const REASONS: Record<Need, string> = {
  pending: 'Aún no está en render-next: llega en un próximo paso.',
  palette: 'El modelo no tiene paleta.',
  metal: 'El modelo no tiene zonas de metal.',
  shadowBias: 'El modelo no tiene sombra pintada.',
  edges: 'El modelo no trae aristas marcadas.',
  lines: 'El modelo no tiene trazos.',
  paintedWidth: 'El modelo no tiene grosor pintado.',
  emissive: 'El modelo no tiene áreas emisivas.',
  decals: 'El modelo no tiene calcomanías.',
};

const decimals = (step: number) => (String(step).split('.')[1] ?? '').length;

interface Field {
  control: Control;
  root: HTMLElement;
  hint: HTMLElement;
  inputs: (HTMLInputElement | HTMLButtonElement)[];
  show(value: CelParams[Key]): void;
}

export interface ParamsPanel {
  /** Show these values, and grey out what the model can't use. */
  update(params: Readonly<CelParams>, features: Readonly<ModelFeatures>, defaults: Readonly<CelParams>): void;
}

export function createParamsPanel(container: HTMLElement, onChange: (changes: Partial<CelParams>) => void): ParamsPanel {
  const fields: Field[] = [];
  let id = 0;

  for (const group of GROUPS) {
    const section = document.createElement('section');
    section.className = 'group';
    const title = document.createElement('h2');
    title.textContent = group.title;
    section.append(title);

    for (const control of group.controls) {
      const root = document.createElement('div');
      root.className = 'field';
      const row = document.createElement('div');
      row.className = 'row';
      const label = document.createElement('label');
      label.textContent = control.label;
      row.append(label);
      const hint = document.createElement('p');
      hint.className = 'hint';
      let field: Field;

      if (control.kind === 'switch') {
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'switch';
        input.id = label.htmlFor = `p${id++}`;
        input.addEventListener('change', () => onChange({ [control.key]: input.checked }));
        row.append(input);
        root.append(row, hint);
        field = { control, root, hint, inputs: [input], show: (v) => (input.checked = v as boolean) };
      } else if (control.kind === 'range') {
        const input = document.createElement('input');
        input.type = 'range';
        input.min = String(control.min);
        input.max = String(control.max);
        input.step = String(control.step);
        input.id = label.htmlFor = `p${id++}`;
        const output = document.createElement('output');
        row.append(output);
        const format = (v: number) => `${v.toFixed(decimals(control.step))}${control.unit ?? ''}`;
        input.addEventListener('input', () => {
          output.textContent = format(+input.value);
          onChange({ [control.key]: +input.value });
        });
        root.append(row, input, hint);
        field = {
          control,
          root,
          hint,
          inputs: [input],
          show: (v) => {
            input.value = String(v);
            output.textContent = format(v as number);
          },
        };
      } else {
        const seg = document.createElement('div');
        seg.className = 'seg';
        seg.setAttribute('role', 'group');
        seg.setAttribute('aria-label', control.label);
        const buttons = control.options.map(([value, text]) => {
          const button = document.createElement('button');
          button.textContent = text;
          button.addEventListener('click', () => onChange({ [control.key]: value }));
          seg.append(button);
          return button;
        });
        root.append(row, seg, hint);
        field = {
          control,
          root,
          hint,
          inputs: buttons,
          show: (v) => buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(control.options[i][0] === v))),
        };
      }
      fields.push(field);
      section.append(root);
    }
    container.append(section);
  }

  return {
    update(params, features, defaults) {
      for (const { control, root, hint, inputs, show } of fields) {
        show(params[control.key]);
        const missing = control.needs?.find((need) => need === 'pending' || !features[need]);
        for (const input of inputs) input.disabled = !!missing;
        root.classList.toggle('off', !!missing);
        root.classList.toggle('changed', params[control.key] !== defaults[control.key]);
        hint.textContent = missing ? REASONS[missing] : (control.hint ?? '');
        hint.hidden = !hint.textContent;
      }
    },
  };
}
