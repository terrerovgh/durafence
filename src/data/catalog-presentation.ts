import edits from '../../docs/research/catalog-clean-image-edits.json';

export type ImagePresentation = {
  file?: string;
  width?: number;
  height?: number;
  crop?: [x: number, y: number, width: number, height: number];
};

const clean = (id: string): ImagePresentation => {
  const asset = edits.edits.find((entry) => entry.id === id);
  if (!asset) throw new Error(`Missing catalog image: ${id}`);
  return { file: asset.file, width: asset.width, height: asset.height };
};
const product = (name: string): ImagePresentation => ({
  file: `refined/${name}.webp`, width: 1200, height: 800,
});
const cleanPlanks = (): ImagePresentation => ({
  file: 'refined/planks-white-bronze.webp', width: 1521, height: 1034,
});

export const catalogPresentation: Record<string, ImagePresentation> = {
  'Dura-Fence-by-Lineal-Feet.jpg': clean('sample-clean'),
  'Dura-Fence-Planks-1.jpg': cleanPlanks(),
  'Dura-Fence-Paint-Spray.jpg': clean('paint-clean'),
  'Dura-Fence-Sample-Box-.jpg': clean('sample-clean'),
  'Dura-Fence-Posts.jpg': product('posts'),
  'Dura-Fence-Rails-Rails.jpg': product('rails'),
  'Dura-Fence-Post-Caps-1.jpg': product('caps'),
  'Self-tapping-Screws-5-16.jpg': product('screws-5-16'),
  'Self-tapping-Screws-2.jpg': product('screws-2'),
  'Dura-Fence-Pedestrian-Gate.jpg': clean('pedestrian-clean'),
  'Dura-Fence-Double-Swing-Gate.jpg': { file: '42492761_472703063216913_5489094794154082304_n.jpg' },
  '20170131_131539_1.jpg': clean('white-fence-clean'),
  'whatsapp_image_2021-06-03_at_5.23.05_pm.jpeg': clean('pedestrian-clean'),
  // Keep the actual reference drawing; do not substitute regenerated technical content.
  'noa-engineering-drawings.jpg': { crop: [605, 397, 264, 162] },
};

export const catalogImageSrc = (image: string) =>
  `/images/catalog/${catalogPresentation[image]?.file ?? image}`;
