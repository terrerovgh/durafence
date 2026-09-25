import type { CatalogProduct } from './catalog';

const gateHeights = '6 ft; ask about 4 or 5 ft options';

export const gates: CatalogProduct[] = [
  {
    id: 'pedestrian', name: 'Pedestrian gate', image: 'Dura-Fence-Pedestrian-Gate.jpg',
    alt: 'White metal pedestrian gate alongside a matching privacy fence',
    description: 'A single swinging leaf for a walkway, side yard or garden entrance. Match the planks to the fence and choose a width that accommodates the people and equipment using the opening.',
    specs: [
      { label: 'Widths', value: '3, 4, 5 or 6 ft' },
      { label: 'Heights', value: gateHeights },
      { label: 'Gate finishes', value: 'White, bronze or unpainted' },
      { label: 'Frame finishes', value: 'White, bronze or unpainted' },
    ],
    note: 'Confirm the clear opening, hinge side, swing direction and latch arrangement with your quote.',
    source: 'https://durafence.net/product/dura-fence-pedestrian-gates/',
  },
  {
    id: 'double-swing', name: 'Double swing gate', image: 'Dura-Fence-Double-Swing-Gate.jpg',
    alt: 'Two-leaf white metal privacy gate across a driveway',
    description: 'Two hinged leaves create a wider driveway entrance and meet at the center. Plan the opening together with the adjoining fence, leaving room for both leaves to travel.',
    specs: [
      { label: 'Total opening widths', value: '10, 12, 14 or 16 ft' },
      { label: 'Heights', value: gateHeights },
      { label: 'Gate finishes', value: 'White or bronze' },
      { label: 'Frame finishes', value: 'White, bronze or unpainted' },
    ],
    note: 'Measure the opening between posts and check the driveway slope, swing clearance and center closure.',
    source: 'https://durafence.net/product/dura-fence-double-swing-gate/',
  },
];
