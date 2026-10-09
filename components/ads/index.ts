// Advertising components.
//
// Pieces in this folder:
//
//   MonetagTag   the Monetag Multitag, mounted once for the whole site from the
//                root layout. Tag-based: it fills no container of ours.
//   AdPlacement  a named in-content position, filled by AdSense — the only
//                network this site has that occupies a container.
//   AdsterraBanner  the Adsterra iframe banner for the reinstated zone. Banner
//                network: it occupies a position none of the other two claim.
//   SocialBarTag the Adsterra Social Bar, mounted once for the whole site at the
//                end of the document — the placement its publisher code asks
//                for. A second Adsterra unit, and a notification-style one, but
//                a different snippet shape from the banner: one script tag, no
//                atOptions block.
//   AutoAds      the AdSense Auto ads loader, mounted once for the whole site in
//                the root layout <head>. Auto ads needs no container and no slot
//                id — the AdSense dashboard decides placement — so this is a bare
//                loader, unlike AdPlacement which fills a named position.
//
// Nothing outside this folder (and lib/monetag.ts, the only code that touches
// the DOM for the Monetag tag) should know an ad network exists.
export { default as AdPlacement } from "./placement";
export { default as MonetagTag } from "./monetag-tag";
export { default as AdsterraBanner } from "./adsterra-banner";
export { default as SocialBarTag } from "./social-bar";
export { default as AutoAds } from "./auto-ads";
