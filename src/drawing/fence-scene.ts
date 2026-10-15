/** Fixed paper-space geometry. Dimensions describe the order, never the drawn scale. */
export type BayDrawing = {
  packageName: string;
  postSpacingFt: number;
  rails: number;
  screwsPerPicket: number;
  heightFt: number;
  embedFt?: number;
  runLabel: string;
  hasFence?: boolean;
};
export type Point = { x: number; y: number };
export type Primitive =
  | { kind: 'line'; role: string; x1: number; y1: number; x2: number; y2: number; color: string; weight: number }
  | { kind: 'rect'; role: string; x: number; y: number; width: number; height: number; fill: string; stroke: string }
  | { kind: 'polygon'; role: string; points: Point[]; fill: string; stroke: string }
  | { kind: 'text'; role: string; x: number; y: number; text: string; size: number; strong: boolean; align: 'start' | 'middle' | 'end'; maxWidth: number };
export type FenceScene = { width: number; height: number; description: string; primitives: Primitive[] };
export const drawingLimits = { pickets: 24, rails: 8, screws: 48 };
export const feet = (value: number): string => String(Number(value.toFixed(4))) + ' ft';

export function fenceScene(spec: BayDrawing): FenceScene {
  const primitives: Primitive[] = [];
  const width = 532, height = spec.hasFence === false ? 220 : 470;
  const ink = '#222222', muted = '#817a70', gold = '#b9854b';
  const line = (role: string, x1: number, y1: number, x2: number, y2: number, color = muted, weight = 0.6) =>
    primitives.push({ kind: 'line', role, x1, y1, x2, y2, color, weight });
  const rect = (role: string, x: number, y: number, w: number, h: number, fill: string, stroke = ink) =>
    primitives.push({ kind: 'rect', role, x, y, width: w, height: h, fill, stroke });
  const label = (role: string, x: number, y: number, text: string, size = 9, strong = false,
    align: 'start' | 'middle' | 'end' = 'start', maxWidth = width - x - 16) =>
    primitives.push({ kind: 'text', role, x, y, text, size, strong, align, maxWidth });
  const arrow = (x: number, y: number, dx: number, dy: number) => {
    const points = [{ x, y }, { x: x + dx * 5 - dy * 2, y: y + dy * 5 + dx * 2 },
      { x: x + dx * 5 + dy * 2, y: y + dy * 5 - dx * 2 }];
    primitives.push({ kind: 'polygon', role: 'arrow', points, fill: ink, stroke: ink });
  };
  rect('frame', 1, 1, width - 2, height - 2, '#ffffff', '#d7d1c6');
  label('heading', 18, 29, 'TECHNICAL DETAIL', 14, true);
  label('scale', 514, 29, 'NOT TO SCALE / ILLUSTRATIVE', 9, false, 'end', 230);
  line('rule', 18, 43, 514, 43, gold, 1.3);
  if (spec.hasFence === false) {
    label('no-fence', 26, 100, 'GATE / ACCESSORY ORDER', 12, true);
    label('no-fence', 26, 124, 'No fence elevation applicable.');
    label('scope', 26, 155, 'Only supplied gate dimensions appear in the schedule.');
    label('scope', 26, 173, 'No site layout, opening location or gate swing is inferred.');
    return { width, height, primitives, description: 'No fence run. No fence elevation applicable. Not to scale / illustrative.' };
  }
  const embed = spec.embedFt ?? 2;
  for (const value of [spec.heightFt, spec.postSpacingFt, spec.rails]) {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError('Invalid drawing dimension');
  }
  if (!Number.isInteger(spec.rails) || !Number.isFinite(spec.screwsPerPicket) || spec.screwsPerPicket < 0 ||
    !Number.isFinite(embed) || embed < 0 ||
    !Number.isFinite(spec.heightFt + embed)) throw new RangeError('Invalid drawing specification');
  label('scope', 18, 66, 'TYPICAL BAY - representative detail, not a project layout', 10, true);
  const left = 138, right = 402, top = 126, ground = 300, bottom = embed > 0 ? 365 : ground;
  // Visual proportions are deliberately fixed. Actual dimensions are stated on the dimension lines.
  for (const x of [left, right]) {
    if (embed > 0) {
      rect('concrete', x - 12, ground, 24, bottom - ground + 7, '#edeae4', muted);
      for (let y = ground + 8; y < bottom; y += 10) line('concrete-hatch', x - 10, y, x + 10, y + 5);
    }
    rect('post', x - 5, top, 10, bottom - top, '#b9bdc1');
  }
  const pickets = Math.min(drawingLimits.pickets, Math.max(2, Math.ceil(spec.postSpacingFt * 2)));
  const inner = left + 5, span = right - left - 10, pitch = span / pickets;
  for (let i = 0; i < pickets; i += 1) {
    const x = inner + i * pitch + 1.2, w = pitch - 2.4;
    primitives.push({ kind: 'polygon', role: 'picket', fill: '#f1eee7', stroke: '#817a70', points: [
      { x, y: ground - 3 }, { x, y: top + 12 }, { x: x + w / 2, y: top + 4 },
      { x: x + w, y: top + 12 }, { x: x + w, y: ground - 3 },
    ] });
  }
  const rails = Math.min(drawingLimits.rails, spec.rails);
  for (let i = 0; i < rails; i += 1) {
    const y = top + 18 + (ground - top - 36) * (i + 1) / (rails + 1);
    rect('rail', inner, y - 2, span, 4, '#454545');
    const screws = Math.min(pickets, Math.floor(drawingLimits.screws / rails));
    for (let j = 0; j < screws; j += 1) rect('screw', inner + span * (j + 0.5) / screws - 1, y - 1, 2, 2, '#ffffff', '#ffffff');
  }
  line('ground', 111, ground, 435, ground, ink, 1);
  for (let x = 117; x < 435; x += 12) line('ground-hatch', x, ground + 1, x - 6, ground + 8);
  // Center-to-center dimension with witness lines extending from the post centerlines.
  line('extension', left, top - 4, left, 91);
  line('extension', right, top - 4, right, 91);
  line('dimension', left, 96, right, 96, ink);
  arrow(left, 96, 1, 0); arrow(right, 96, -1, 0);
  label('spacing', (left + right) / 2, 86, feet(spec.postSpacingFt) + ' O.C.', 10, true, 'middle', 230);
  const vertical = (x: number, y1: number, y2: number, value: string, role: string) => {
    line('extension', x - 4, y1, left - 8, y1);
    line('extension', x - 4, y2, left - 8, y2);
    line('dimension', x, y1, x, y2, ink);
    arrow(x, y1, 0, 1); arrow(x, y2, 0, -1);
    label(role, x - 10, (y1 + y2) / 2 + 3, value, 10, true, 'end', x - 28);
  };
  vertical(102, top, ground, feet(spec.heightFt), 'height');
  if (embed > 0) vertical(102, ground, bottom, feet(embed), 'embedment');
  label('ground-label', 444, ground + 4, 'GRADE', 9, false, 'start', 70);
  label('embed-note', 18, 395, embed > 0
    ? 'Concrete shown schematically; footing diameter is not specified.'
    : 'Zero embedment specified; footing / anchorage detail not supplied.');
  line('rule', 18, 408, 514, 408, gold, 0.8);
  label('post-length', 18, 428, 'POST LENGTH  ' + feet(spec.heightFt + embed), 10, true, 'start', 245);
  label('rail-count', 286, 428, 'RAILS / BAY  ' + spec.rails, 10, true, 'start', 228);
  label('pattern', 18, 446, 'SCREWS / PICKET  ' + spec.screwsPerPicket + '    Representative pattern; at most 8 rails shown.');
  label('approval', 18, 461, 'Confirm dimensions and anchorage before fabrication; no structural approval.', 9);
  const description = 'Typical bay. Not to scale / illustrative. Above ground ' + feet(spec.heightFt) +
    '; embedment ' + feet(embed) + '; post length ' + feet(spec.heightFt + embed) +
    '; spacing ' + feet(spec.postSpacingFt) + ' on center; ' + spec.rails + ' rails per bay.';
  return { width, height, primitives, description };
}
