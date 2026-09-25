import { formatFeetInches, picketWidthIn, type Estimate } from '../data/estimate';

const NS = 'http://www.w3.org/2000/svg';
const INK = '#1c1c1c';
const THIN = '#6a655c';
const PAPER = '#f3f0e8';
const PICKET = '#e6e1d6';
const POST = '#c8c9cb';
const CONCRETE = '#d5d2cb';

const aboveFt = 6;
const embedFt = 2;
const postFt = aboveFt + embedFt;

export type BayDrawing = {
  packageName: string;
  postSpacingFt: number;
  rails: number;
  screwsPerPicket: number;
  heightFt: number;
  runLabel: string;
};

export function bayFromEstimate(result: Estimate, heightFt: number): BayDrawing {
  return {
    packageName: result.packageName,
    postSpacingFt: result.postSpacingFt,
    rails: result.railCount,
    screwsPerPicket: result.screwsPerPicket,
    heightFt,
    runLabel: result.runLabel,
  };
}

export function drawBay(svg: SVGSVGElement, spec: BayDrawing, fit: 'sheet' | 'invoice' = 'sheet'): void {
  const invoice = fit === 'invoice';
  const picketCount = Math.round((spec.postSpacingFt * 12) / picketWidthIn);
  const px = invoice ? 16 : 28;
  const abovePx = aboveFt * px;
  const embedPx = embedFt * px;
  const postTop = invoice ? 48 : 76;
  const groundY = postTop + abovePx;
  const postBottom = groundY + embedPx;
  const postW = invoice ? 12 : 16;
  const marginL = invoice ? 70 : 118;
  const innerW = Math.max(invoice ? 176 : 300, picketCount * (invoice ? 15 : 32));
  const leftPost = marginL;
  const innerX = leftPost + postW;
  const rightPost = innerX + innerW;
  const callX = rightPost + postW + (invoice ? 16 : 24);
  const width = callX + (invoice ? 148 : 188);
  const blockTop = postBottom + (invoice ? 28 : 36);
  const blockH = invoice ? 148 : 176;
  const height = blockTop + blockH + (invoice ? 10 : 16);

  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  svg.replaceChildren();

  const title = el('title');
  if (!invoice) title.id = 'drawing-title';
  title.textContent = `${spec.packageName} bay. Posts are ${formatFeetInches(postFt)}, with ${formatFeetInches(embedFt)} in concrete and ${formatFeetInches(aboveFt)} above ground. ${picketCount} pointed pickets, ${formatFeetInches(aboveFt)} tall and ${picketWidthIn} inches wide. ${spec.rails} rails, ${spec.screwsPerPicket} screws per picket.`;
  svg.append(title, el('rect', { width: String(width), height: String(height), fill: PAPER }));
  if (!invoice) {
    svg.append(
      el('rect', {
        x: '10',
        y: '10',
        width: String(width - 20),
        height: String(height - 20),
        fill: 'none',
        stroke: INK,
        'stroke-width': '1.1',
      }),
    );
  }

  const pointPx = px * 0.67;
  const picketBottom = groundY - 2;
  const picketW = innerW / picketCount;

  drawConcrete(svg, leftPost, postW, groundY, postBottom, invoice);
  drawConcrete(svg, rightPost, postW, groundY, postBottom, invoice);
  drawGround(svg, leftPost - 28, rightPost + postW + 28, groundY);
  drawPost(svg, leftPost, postTop, postW, postBottom);
  drawPost(svg, rightPost, postTop, postW, postBottom);

  for (let i = 0; i < picketCount; i += 1) {
    const x = innerX + i * picketW + 0.8;
    const w = Math.max(2, picketW - 1.6);
    const shoulder = postTop + pointPx;
    svg.append(
      el('path', {
        'data-picket': '',
        d: `M${x} ${picketBottom} L${x} ${shoulder} L${x + w / 2} ${postTop} L${x + w} ${shoulder} L${x + w} ${picketBottom} Z`,
        fill: PICKET,
        stroke: INK,
        'stroke-width': '0.9',
      }),
    );
  }

  const fractions = spec.rails === 3 ? [0.22, 0.5, 0.78] : [0.32, 0.7];
  const bodyTop = postTop + pointPx;
  const span = picketBottom - bodyTop;
  const railYs = fractions.map((fraction) => bodyTop + span * fraction);
  for (const y of railYs) {
    svg.append(
      el('line', {
        'data-rail': '',
        x1: String(innerX),
        x2: String(innerX + innerW),
        y1: String(y),
        y2: String(y),
        stroke: INK,
        'stroke-width': '2.4',
      }),
    );
  }

  railYs.forEach((y, railIndex) => {
    for (let i = 0; i < picketCount; i += 1) {
      const cx = innerX + picketW * (i + 0.5);
      drawScrew(svg, cx, y, railIndex === 0 && i === picketCount - 1);
    }
  });

  const centerL = leftPost + postW / 2;
  const centerR = rightPost + postW / 2;
  dimAcross(svg, centerL, centerR, invoice ? 22 : 36, postTop, `${formatFeetInches(spec.postSpacingFt)} O.C.`);
  dimAcross(svg, innerX, innerX + picketW, postTop - (invoice ? 8 : 14), bodyTop, `${picketWidthIn}"`);
  dimDown(svg, invoice ? 22 : 38, postTop, groundY, leftPost, formatFeetInches(aboveFt));
  dimDown(svg, invoice ? 46 : 74, groundY, postBottom, leftPost - (invoice ? 8 : 10), formatFeetInches(embedFt));

  const midRail = railYs[Math.floor(railYs.length / 2)] ?? railYs[0];
  callout(svg, innerX + innerW, midRail, callX, midRail, `${spec.rails} RAILS`);
  callout(svg, innerX + innerW, railYs[0] ?? midRail, callX, (railYs[0] ?? midRail) - (invoice ? 12 : 18), `${spec.screwsPerPicket} SCREWS / PICKET`);

  titleBlock(svg, invoice ? 12 : 22, blockTop, width - (invoice ? 24 : 44), spec, picketCount, invoice);
}

function drawGround(svg: SVGSVGElement, x1: number, x2: number, y: number): void {
  svg.append(el('line', { x1: String(x1), x2: String(x2), y1: String(y), y2: String(y), stroke: INK, 'stroke-width': '1.2' }));
  for (let x = x1 + 8; x < x2; x += 11) {
    svg.append(el('line', { x1: String(x), y1: String(y), x2: String(x - 7), y2: String(y + 8), stroke: THIN, 'stroke-width': '0.8' }));
  }
}

function drawPost(svg: SVGSVGElement, x: number, top: number, postW: number, bottom: number): void {
  svg.append(
    el('rect', {
      'data-post': '',
      x: String(x),
      y: String(top),
      width: String(postW),
      height: String(bottom - top),
      fill: POST,
      stroke: INK,
      'stroke-width': '1.3',
    }),
  );
}

function drawConcrete(svg: SVGSVGElement, postX: number, postW: number, groundY: number, bottom: number, invoice: boolean): void {
  const pad = invoice ? 6 : 9;
  const x = postX - pad;
  const w = postW + pad * 2;
  const h = bottom - groundY;
  svg.append(el('rect', { 'data-concrete': '', x: String(x), y: String(groundY), width: String(w), height: String(h), fill: CONCRETE, stroke: INK, 'stroke-width': '0.8' }));
  for (let y = groundY + 4; y < bottom - 2; y += invoice ? 5 : 6) {
    svg.append(el('line', { x1: String(x + 1), x2: String(x + w - 1), y1: String(y), y2: String(y + 3), stroke: THIN, 'stroke-width': '0.6' }));
  }
}

function drawScrew(svg: SVGSVGElement, cx: number, cy: number, marked: boolean): void {
  svg.append(
    el('circle', {
      'data-screw': '',
      cx: String(cx),
      cy: String(cy),
      r: '3.3',
      fill: PAPER,
      stroke: INK,
      'stroke-width': marked ? '1.3' : '0.9',
    }),
  );
  svg.append(
    el('line', {
      x1: String(cx - 2.1),
      x2: String(cx + 2.1),
      y1: String(cy),
      y2: String(cy),
      stroke: INK,
      'stroke-width': '0.8',
    }),
  );
}

function dimAcross(svg: SVGSVGElement, x1: number, x2: number, y: number, fromY: number, label: string, labelBelow = false): void {
  const dir = fromY < y ? 1 : -1;
  const gap = 5 * dir;
  svg.append(line(x1, fromY + gap, x1, y + dir * 3));
  svg.append(line(x2, fromY + gap, x2, y + dir * 3));
  svg.append(line(x1, y, x2, y, INK));
  svg.append(arrow(x1, y, 180));
  svg.append(arrow(x2, y, 0));
  svg.append(text((x1 + x2) / 2, labelBelow ? y + 15 : y - 7, label, { 'text-anchor': 'middle' }));
}

function dimDown(svg: SVGSVGElement, x: number, y1: number, y2: number, fromX: number, label: string): void {
  svg.append(line(fromX - 4, y1, x - 3, y1));
  svg.append(line(fromX - 4, y2, x - 3, y2));
  svg.append(line(x, y1, x, y2, INK));
  svg.append(arrow(x, y1, -90));
  svg.append(arrow(x, y2, 90));
  const mid = (y1 + y2) / 2;
  const node = text(0, 0, label, { 'text-anchor': 'middle' });
  node.setAttribute('transform', `translate(${x - 10} ${mid}) rotate(-90)`);
  svg.append(node);
}

function callout(svg: SVGSVGElement, x1: number, y1: number, x2: number, y2: number, label: string): void {
  svg.append(line(x1, y1, x2, y2));
  svg.append(el('circle', { cx: String(x1), cy: String(y1), r: '1.7', fill: INK }));
  svg.append(text(x2 + 6, y2 + 4, label));
}

function titleBlock(svg: SVGSVGElement, x: number, y: number, w: number, spec: BayDrawing, picketCount: number, invoice: boolean): void {
  const head = invoice ? 34 : 48;
  const pitch = invoice ? 13 : 15;
  const blockH = invoice ? 148 : 176;
  svg.append(el('rect', { x: String(x), y: String(y), width: String(w), height: String(blockH), fill: PAPER, stroke: invoice ? '#d5d5d5' : INK, 'stroke-width': '1' }));
  svg.append(text(x + 10, y + (invoice ? 16 : 20), 'DURA FENCE METAL', { 'font-size': invoice ? '12' : '13', 'font-weight': '600', 'letter-spacing': '0.12em' }));
  svg.append(text(x + w - 10, y + (invoice ? 16 : 20), 'NTS', { 'text-anchor': 'end', 'font-size': invoice ? '11' : '12' }));
  svg.append(text(x + 10, y + (invoice ? 30 : 38), 'ELEVATION — ONE BAY', { 'font-size': invoice ? '11' : '12' }));
  svg.append(line(x, y + head, x + w, y + head, invoice ? '#d5d5d5' : INK));

  const rows: [string, string][] = [
    ['PACKAGE', spec.packageName.toUpperCase()],
    ['POSTS', `${formatFeetInches(postFt)} · ${formatFeetInches(embedFt)} IN CONCRETE`],
    ['PICKETS', `${picketCount} × ${formatFeetInches(aboveFt)} POINTED`],
    ['RAILS', String(spec.rails)],
    ['SCREWS', `${spec.screwsPerPicket} PER PICKET`],
    ['ABOVE', formatFeetInches(aboveFt)],
    ['RUN', spec.runLabel ? `${spec.runLabel} FT` : '—'],
  ];
  rows.forEach(([label, value], index) => {
    const rowY = y + head + 14 + index * pitch;
    svg.append(text(x + 10, rowY, label, { fill: THIN, 'font-size': invoice ? '10' : '11', 'letter-spacing': '0.06em' }));
    svg.append(text(x + (invoice ? 78 : 118), rowY, value, { 'font-size': invoice ? '11' : '12' }));
  });
}

function line(x1: number, y1: number, x2: number, y2: number, stroke = THIN): SVGElement {
  return el('line', {
    x1: String(x1),
    y1: String(y1),
    x2: String(x2),
    y2: String(y2),
    stroke,
    'stroke-width': '0.8',
  });
}

function arrow(x: number, y: number, angle: number): SVGElement {
  return el('path', {
    d: 'M0 0 L-8 -3.1 L-8 3.1 Z',
    fill: INK,
    transform: `translate(${x} ${y}) rotate(${angle})`,
  });
}

function text(x: number, y: number, value: string, extra: Record<string, string> = {}): SVGElement {
  const node = el('text', {
    x: String(x),
    y: String(y),
    fill: INK,
    'font-family': 'Barlow, Arial Narrow, Arial, sans-serif',
    'font-size': '12',
    ...extra,
  });
  node.textContent = value;
  return node;
}

function el(name: string, attrs: Record<string, string> = {}): SVGElement {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}
