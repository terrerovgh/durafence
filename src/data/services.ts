export type TradeIcon = 'home' | 'building' | 'shield' | 'gear';

/** The same four product groups appear in the hero and the business catalog. */
export const trades: {
  id: string; name: [string, string]; title: string; icon: TradeIcon;
  href: string; summary: string;
}[] = [
  { id: 'fences', name: ['Privacy', 'Fences'], title: 'Metal privacy fences', icon: 'home', href: '/services/', summary: 'Metal privacy fencing by the linear foot, with heights and finishes to suit the property.' },
  { id: 'gates', name: ['Matching', 'Gates'], title: 'Metal gates', icon: 'building', href: '/gates/', summary: 'Pedestrian and double swing gates for walkways and driveways.' },
  { id: 'planks', name: ['Fence', 'Planks'], title: 'Fence planks', icon: 'shield', href: '/parts/#planks', summary: 'Six-inch metal planks in five heights, with white and bronze finishes.' },
  { id: 'parts', name: ['Parts &', 'Hardware'], title: 'Fence parts and hardware', icon: 'gear', href: '/parts/', summary: 'Posts, rails, caps and screws for a complete fence system.' },
];

export const featured = [
  { name: 'Privacy fences', spec: 'Choose the height and finish, then build your Standard or Premium package by the linear foot.', href: '/services/', image: '20170131_131539_1.jpg', alt: 'White metal privacy fence along a residential property' },
  { name: 'Matching gates', spec: 'Pedestrian access, a double swing driveway entrance or a gate that slides beside the fence.', href: '/gates/', image: '42492761_472703063216913_5489094794154082304_n.jpg', alt: 'White double swing privacy gate across a driveway' },
  { name: 'Planks & parts', spec: 'Find the planks, posts, rails and hardware to assemble a fence or complete a replacement.', href: '/parts/', image: 'Dura-Fence-Planks-1.jpg', alt: 'Metal fence planks in white and bronze' },
];
