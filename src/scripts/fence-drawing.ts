import { estimateBay } from '../drawing/order-drawing.ts';
import { fenceScene, type BayDrawing } from '../drawing/fence-scene.ts';
export type { BayDrawing } from '../drawing/fence-scene.ts';

const NS = 'http://www.w3.org/2000/svg';

export const bayFromEstimate = estimateBay;

/** Both fit modes retain the same readable, bounded paper-space scene. */
export function drawBay(svg: SVGSVGElement, spec: BayDrawing, fit: 'sheet' | 'invoice' = 'sheet'): void {
  const scene = fenceScene(spec);
  svg.setAttribute('viewBox', '0 0 ' + scene.width + ' ' + scene.height);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', scene.description);
  svg.replaceChildren();
  const title = document.createElementNS(NS, 'title');
  if (fit === 'sheet') title.id = 'drawing-title';
  title.textContent = scene.description;
  svg.append(title);
  for (const item of scene.primitives) {
    const node = document.createElementNS(NS, item.kind === 'polygon' ? 'polygon' : item.kind);
    node.setAttribute('data-' + item.role, '');
    if (item.kind === 'text') {
      node.textContent = item.text;
      set(node, { x: item.x, y: item.y, fill: '#222222', 'font-family': 'Arial, sans-serif',
        'font-size': item.size, 'font-weight': item.strong ? '700' : '400', 'text-anchor': item.align });
    } else if (item.kind === 'line') {
      set(node, { x1: item.x1, y1: item.y1, x2: item.x2, y2: item.y2, stroke: item.color, 'stroke-width': item.weight });
    } else {
      set(node, { fill: item.fill, stroke: item.stroke, 'stroke-width': 0.6 });
      if (item.kind === 'rect') set(node, { x: item.x, y: item.y, width: item.width, height: item.height });
      else node.setAttribute('points', item.points.map((point) => point.x + ',' + point.y).join(' '));
    }
    svg.append(node);
  }
}

function set(node: SVGElement, attributes: Record<string, string | number>): void {
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
}
