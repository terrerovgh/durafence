/** Product facts: docs/research/durafence-catalog.md. Prices belong to estimate.ts. */
export type CatalogProduct = {
  id: string;
  name: string;
  image: string;
  alt: string;
  description: string;
  specs: { label: string; value: string }[];
  note?: string;
  source: string;
};

const source = (slug: string) => `https://durafence.net/product/${slug}/`;

export const fence: CatalogProduct = {
  id: 'privacy-steel',
  name: 'Metal privacy fence',
  image: 'Dura-Fence-by-Lineal-Feet.jpg',
  alt: 'Privacy fence examples in bronze and white finishes',
  description: 'Build a continuous privacy line with metal planks, horizontal rails and square posts. Order by the linear foot for a backyard, street frontage or commercial perimeter, with matching gates for everyday access.',
  specs: [
    { label: 'Fence heights', value: '4, 5, 6, 7 or 8 ft' },
    { label: 'Plank width', value: '6 in' },
    { label: 'Finishes', value: 'White or bronze' },
    { label: 'Frame finishes', value: 'White, bronze or unpainted' },
    { label: 'System components', value: 'Posts, rails, planks, post caps and fastening screws' },
    { label: 'Order measurement', value: 'Total fence length in linear feet' },
  ],
  note: 'Choose your package in the estimator. Confirm the height, finish, layout and any special requirements with your quote.',
  source: source('dura-fence-by-lineal-feet'),
};

export const parts: CatalogProduct[] = [
  {
    id: 'planks', name: 'Fence planks', image: 'Dura-Fence-Planks-1.jpg',
    alt: 'Metal privacy planks shown in bronze and white',
    description: 'The vertical infill that forms the face of the fence. Use individual planks for a new privacy line or to replace a damaged section, matching the existing height and finish.',
    specs: [
      { label: 'Width', value: '6 in' },
      { label: 'Heights', value: '4, 5, 6, 7 or 8 ft' },
      { label: 'Finishes', value: 'White or bronze' },
    ],
    source: source('dura-fence-planks'),
  },
  {
    id: 'posts', name: 'Square fence posts', image: 'Dura-Fence-Posts.jpg',
    alt: 'Square hollow metal post sections on a dark background',
    description: 'Square posts support the fence line and provide the connection points for the rails. Match the post section, cap and finish when planning a new run or replacing a component.',
    specs: [
      { label: 'Standard size', value: '2½ × 2½ in section, 8 ft long' },
      { label: 'Additional size', value: '3 × 3 in section, 8 ft long; confirm availability' },
      { label: 'Finishes', value: 'White, bronze or unpainted' },
    ],
    source: source('dura-fence-post'),
  },
  {
    id: 'rails', name: 'Fence rails', image: 'Dura-Fence-Rails-Rails.jpg',
    alt: 'Rectangular hollow metal rail on a dark background',
    description: 'Horizontal rectangular rails connect the posts and carry the planks. Coordinate the rail layout with the selected fence package and the finished height.',
    specs: [
      { label: 'Stock length', value: '24 ft' },
      { label: 'Section', value: '1 × 2 in' },
      { label: 'Wall thickness', value: '0.125 in (⅛ in)' },
      { label: 'Published weight', value: '0.81 lb per linear foot' },
      { label: 'Finishes', value: 'White, bronze or unpainted' },
    ],
    source: source('dura-fence-rails'),
  },
  {
    id: 'post-caps', name: 'Post caps', image: 'Dura-Fence-Post-Caps-1.jpg',
    alt: 'Black and white square post caps',
    description: 'Finish the top of each square post with a matching cap. Check the post dimensions before ordering replacement caps.',
    specs: [
      { label: 'Standard size', value: '2½ × 2½ in' },
      { label: 'Other sizes', value: '2 × 2 in and 3 × 3 in; confirm availability' },
      { label: 'Colors', value: 'White, bronze or black' },
    ],
    source: source('dura-fence-post-caps'),
  },
  {
    id: 'screws-5-16', name: '5/16 self-tapping screws', image: 'Self-tapping-Screws-5-16.jpg',
    alt: '5/16 self-tapping metal fence screws',
    description: 'Fasteners for assembling metal fence components. Identify the required screw specification against the parts being joined before adding replacements or extras.',
    specs: [
      { label: 'Catalog designation', value: '5/16 self-tapping screws' },
      { label: 'Reference packaging', value: 'Box of 100' },
    ],
    note: 'Fence packages include screws. Additional screws are priced by weight in our estimator; a reference box is not an estimator quantity.',
    source: source('dura-fence-self-tapping-screws-5-16'),
  },
  {
    id: 'screws-2', name: '2 in self-tapping screws', image: 'Self-tapping-Screws-2.jpg',
    alt: 'Two-inch self-tapping screw for metal fence assembly',
    description: 'A second fastener option for the fence assembly. Confirm the required connection and screw type when ordering hardware.',
    specs: [
      { label: 'Nominal length', value: '2 in' },
      { label: 'Reference packaging', value: 'Box of 100' },
    ],
    note: 'Use the estimator for additional screw pricing by weight. Specify the screw type in your quote request.',
    source: source('durafence-self-tapping-screws-2%e2%80%b3'),
  },
];

export const gallery = [
  { image: '20170131_131539_1.jpg', alt: 'White metal privacy fence beside a house', title: 'White privacy fence' },
  { image: '69333799_656441814843036_8378153242147684352_n.jpg', alt: 'Bronze privacy fence with horizontal rails facing a lawn', title: 'Bronze fence and rails' },
  { image: '42492761_472703063216913_5489094794154082304_n.jpg', alt: 'White double swing gate across a driveway', title: 'Double swing gate' },
  { image: 'whatsapp_image_2021-06-03_at_5.23.05_pm.jpeg', alt: 'White pedestrian entrance beside a house and privacy fence', title: 'Pedestrian access' },
];
