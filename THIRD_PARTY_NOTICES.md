# Third-party notices

The application's own source is licensed under the root [MIT license](LICENSE). Everything listed below keeps its own license.

## npm packages

Packages are installed by `npm ci` and are not copied into this repository. Each keeps the license in its own package. Most are MIT, Apache-2.0, ISC or BSD. These need a specific mention:

| Package | License | How it is used |
| --- | --- | --- |
| `@meta-sam/parser` | Meta's **SAM License** (see `node_modules/@meta-sam/parser/LICENSE`); not an OSI open-source license | Reads SAM 3.1's mask answers on the server. Unmodified. |
| `@vercel/analytics` | MPL-2.0 | Cookieless page-view counting on the live site. Unmodified. |
| `sharp` (and its `@img/sharp-libvips-*` binaries) | Apache-2.0; the bundled libvips binaries are LGPL-3.0-or-later | Checks and resizes images on the server. Installed as published, dynamically linked, unmodified. |
| `dexie` | Apache-2.0 | Browser storage (IndexedDB). |

Development-only tools (ESLint, Playwright, Vitest, axe-core and their dependencies) are not part of the deployed site.

## Files in this repository that are not original source

- **Fonts:** `public/fonts/Inter.ttf` and `public/fonts/Cairo.ttf` are under the SIL Open Font License; the notices are next to them (`Inter-OFL.txt`, `Cairo-OFL.txt`). Keep those notices with any copy of the fonts.
- **Image compressor:** `public/vendor/browser-image-compression-2.0.2.js` is an unmodified copy of the browser build of [browser-image-compression](https://github.com/Donaldcwl/browser-image-compression) 2.0.2 (MIT License, Copyright (c) 2019 Donald Chan). It is served from this site so the compressor's web worker never loads code from a CDN.

## Images

- **Showcase ads** (`public/showcase/ad-dafa-candle.webp`, `ad-nada-cream.webp`, `ad-hope-bottle.webp`): made on the live site from these free photos under the [Unsplash License](https://unsplash.com/license): [scented candle](https://unsplash.com/photos/1768690569742-9705f4c98f22), [cream jar on a towel](https://unsplash.com/photos/1630398777076-9b262a08c211) and [orange bottle](https://unsplash.com/photos/1617963656226-41ae10af91ac). Any text printed on a product is that product's own label.
- **Home comparison** (`public/showcase/headphones-photo.webp`, `headphones-ad.webp`): the project owner's own product photo and the ad made from it on the live site.
- **Guided demo** (`public/demo/hope-bottle.jpg`, `public/demo/hope-logo.png`): the project owner's own bottle photo and logo, the same ones used in the demo video.
- **Sample shelf** (`public/demo/shelf-sample.jpg`): assembled from the project owner's own product photos (the TALJ can, the white sneaker and the headphones).
- **Test fixture** (`public/demo/sora-product.png`): sample artwork made for this project, used by the automated tests.

The showcase brands (دِفا / Dafa Home, نَدى / Nada Skin and hope.) and their logos are fictional demo brands made for the project. No showcase or demo ad makes a claim about campaign performance.

## Names

Meta, Muse Spark, Muse Image, SAM, Instagram, Facebook, WhatsApp, GitHub and Vercel are named only to identify the models, platforms and services the project uses or plans to support. Naming them does not imply endorsement.
