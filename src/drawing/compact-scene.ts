import { fenceScene, feet, type BayDrawing, type FenceScene, type Primitive } from './fence-scene.ts';

/** Reuse the validated large-scene geometry and truth; reflow labels at native print sizes. */
export function compactFenceScene(spec: BayDrawing): FenceScene {
  const source = fenceScene(spec);
  const primitives: Primitive[] = [];
  const text = (role: string, x: number, y: number, value: string, size = 7.5, strong = false,
    align: 'start' | 'middle' | 'end' = 'start', maxWidth = 248 - x) =>
    primitives.push({ kind: 'text', role, x, y, text: value, size, strong, align, maxWidth });
  text('heading', 0, 10, 'TECHNICAL DETAIL', 9, true);
  text('scale', 0, 23, 'NOT TO SCALE / ILLUSTRATIVE', 7.5);
  if (spec.hasFence === false) {
    text('no-fence', 0, 44, 'Gate / accessory order. No fence elevation.');
    return { width: 248, height: 54, description: source.description, primitives };
  }
  const px = (x: number) => x * 0.46;
  const py = (y: number) => 52 + (y - 96) * 0.42;
  for (const item of source.primitives) {
    if (item.kind === 'text' || item.role === 'frame' || item.role === 'rule') continue;
    if (item.kind === 'line') primitives.push({ ...item, x1: px(item.x1), x2: px(item.x2), y1: py(item.y1), y2: py(item.y2), weight: Math.max(0.35, item.weight * 0.7) });
    else if (item.kind === 'rect') primitives.push({ ...item, x: px(item.x), y: py(item.y), width: item.width * 0.46, height: item.height * 0.42 });
    else primitives.push({ ...item, points: item.points.map((point) => ({ x: px(point.x), y: py(point.y) })) });
  }
  const embed = spec.embedFt ?? 2;
  text('spacing', px(270), 44, feet(spec.postSpacingFt) + ' O.C.', 7.5, true, 'middle', 170);
  text('height', px(102) - 7, py(213), feet(spec.heightFt), 7.5, true, 'end', 38);
  if (embed > 0) text('embedment', px(102) - 7, py(338), feet(embed), 7.5, true, 'end', 38);
  text('ground-label', 204, py(300) + 3, 'GRADE', 7.5, false, 'start', 44);
  text('post-length', 0, 182, 'Post length: ' + feet(spec.heightFt + embed) + '; embedment: ' + feet(embed), 7.5);
  text('rail-count', 0, 195, 'Rails / bay: ' + spec.rails + '; screws / picket: ' + spec.screwsPerPicket, 7.5);
  return { width: 248, height: 204, description: source.description, primitives };
}
