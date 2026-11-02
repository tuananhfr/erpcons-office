# Office web identity

Updated 2026-11-02 from the owner's supplied Office/W/X/P/PDF PNGs.

## Sources and regeneration

- `public/brand/office/office-mark.png`: supplied combined Office mark.
- `public/brand/office/{van-ban,bang-tinh,trinh-chieu,pdf}-new.png`: supplied tool marks.
- `npm run brand:assets`: regenerates the social card, favicon, Apple/PWA/maskable icons, file-handler icons, and compatibility copies.
- `src/lib/seo/page-seo.ts`: canonical image/icon URLs and the public brand name, shared by Next metadata, editor metadata, JSON-LD, PWA and sign-in pages.

The social card is composed from SVG typography and the exact supplied PNG marks; it needs no browser, remote font download, or AI logo redraw. The current URL is `/brand/office/office-social.png` (1200×630). Landing and laptop preview use the same supplied marks. Raster laptop mockups with inconsistent embedded marks are not shipped.

Legacy `van-phong-*`, `og-image.png`, root `favicon.ico` and old tool icon URLs contain new artwork for compatibility. Active metadata points to new Office URLs, including the file-handler icons. PWA id, start URL and scope stay `/`; file formats, editor links and account behavior are unchanged.

## Audit coverage

The 2026-11-02 audit checked the exported HTML for home, discovery, guide, intake, documents, sharing/history panels and all four editors; it also checked both generated sign-in pages. It verified the OG/Twitter image, favicons, referenced image files, manifest identity and four file handlers/shortcuts, social PNG dimensions, and equality of legacy social-image copies. Result: 13 pages and 27 referenced brand assets passed. No active application source references the old `van-phong-*` visual assets or old brand phrase.

Verification: 936 tests passed, 1 conditional test skipped; ESLint and Next production compilation/type checking passed. The assembled editor output was a **local QA build** using `--allow-local-provenance`, because the cached editor builds did not match current checkout provenance. It must not be deployed. A release needs the normal clean editor provenance/build gates. No deployment or third-party social-platform cache refresh was performed.
