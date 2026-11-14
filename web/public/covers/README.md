# Arcade cover templates

Original images generated with the built-in image generation tool on 2026-11-14.
These are decorative genre templates, not screenshots of gameplay.
Assigned automatically by genre in `web/src/lib/cover.ts`; unknown genres use a stable game-ID hash. No import screen or backend cover field is required.

Each image ships as WebP in two sizes, made from the 1254x1254 PNG originals
(in commit 0c57208 on feat/launcher-ui): `<id>.webp`, 960 px wide at quality
78, for cards, and `<id>-backdrop.webp`, 160 px wide at quality 60, for the
blurred page backdrop. Regenerate both from the originals if the art changes.

## Generation prompts

### orbit.webp

Original video game cover illustration: a tiny angular courier spaceship sailing between luminous ice asteroids above a teal planet, cinematic miniature 3D diorama, frosted crystalline surfaces, cyan rim light, deep navy space, premium playful retro arcade mood. Square composition with central subject readable in portrait and landscape crops; quiet dark lower third for UI title overlay. Full bleed artwork only, no lettering, logos, frames, interface or existing game characters.

### ruins.webp

Original video game cover illustration: a tiny hooded adventurer facing a luminous emerald doorway in ancient mossy geometric dungeon ruins, floating stone steps and amber torchlight, cinematic miniature 3D diorama, polished tactile materials, premium playful retro arcade mood with frosted glass-like crystals. Square composition, central subject readable in portrait and landscape crops, quiet dark lower third for UI title overlay. Full bleed artwork only, no lettering, logos, frames, interface or existing game characters.

### velocity.webp

Original video game cover illustration: a futuristic small coral orange racing car drifting on a sweeping midnight teal circuit above clouds, luminous cyan track rails, cinematic miniature 3D diorama, polished tactile toy materials, premium playful retro arcade mood. Square composition with central subject readable in portrait and landscape crops, quiet dark lower third for UI title overlay. Full bleed artwork only, no lettering, logos, frames, interface or existing game characters.

### prism.webp

Original video game puzzle cover illustration: sculptural arrangement of floating translucent turquoise, amber and coral glass cubes over a dark teal tiled puzzle board, one glowing diamond crystal, cinematic miniature 3D diorama, frosted edges, beautiful refraction, premium playful retro arcade mood. Square composition with central subject readable in portrait and landscape crops, quiet dark lower third for UI title overlay. Full bleed artwork only, no lettering, numbers, logos, frames or interface.
