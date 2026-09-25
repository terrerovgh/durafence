# Catalog image styling — 2026-09-25

The catalog now presents photography in consistent 3:2 frames with individually inspected crops. The source artwork's captions, cyan blocks and white margins are outside the displayed region. Gates use existing uncaptioned photographs; original source downloads remain available unchanged. Display crops and substitutions are recorded in `src/data/catalog-presentation.ts`.

Five hardware images (posts, rails, caps, 5/16 screws and 2-inch screw) were edited using the built-in image_gen tool to extract the product presentation onto near-black backgrounds. Original generated PNGs and optimized WebP website assets are saved in `public/images/catalog/refined/`. Exact prompts, generated source paths and final workspace paths are recorded in `catalog-image-edits.json`. These are edited reference visuals, not technical dimensional drawings.

`CatalogImage.astro` gives the images restrained color treatment and soft transitions into the existing ink background. Product images preserve silver metal, the black cap and the white cap. The engineering illustration uses a cropped detail of the original drawing with a monochrome treatment. Alternative text reflects the displayed subjects, and attribution identifies the imagery as adapted.

Validation: production build passes. Chromium checks at 320, 768, 1024 and 1440 px found no broken loaded images, missing alt text, horizontal overflow or console exceptions. Final product, engineering and pedestrian views were visually reviewed on desktop and mobile after correcting the individual crops. Pricing and estimate logic were not changed.


## Superseding visual correction

At the user's explicit request, removed every image fade, gradient overlay, mask, opacity reduction and color filter. Catalog images now have clean edges and 12 px rounded corners. Six new edited photographic assets remove baked-in white mats, cyan graphics and captions; exact prompts and paths are in `catalog-clean-image-edits.json`. Gallery enlargement links use the cleaned assets. The original reference engineering sheet remains a direct crop to avoid publishing regenerated technical text. The previously generated hardware assets remain, displayed without masks. Production build passes.
