import type { SiteImageOverride } from "@/lib/siteContent";

/**
 * DOM application of admin text/image overrides. Texts are matched by their exact
 * original wording (trimmed text node); images by their original source URL.
 * Every function is idempotent so a MutationObserver can call it freely.
 */

const UI_SELECTOR = "[data-site-editor-ui],script,style,textarea,noscript";

type AppliedText = { orig: string; shown: string };
const appliedTexts = new WeakMap<Text, AppliedText>();

export function originalTextOf(node: Text): string {
  const trimmed = (node.nodeValue ?? "").trim();
  const rec = appliedTexts.get(node);
  return rec && rec.shown === trimmed ? rec.orig : trimmed;
}

export function applyTexts(texts: Map<string, string>): void {
  if (typeof document === "undefined" || !document.body) return;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      const p = n.parentElement;
      return !p || p.closest(UI_SELECTOR) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
    },
  });
  const nodes: Text[] = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n as Text);
  for (const node of nodes) {
    const raw = node.nodeValue ?? "";
    const trimmed = raw.trim();
    const rec = appliedTexts.get(node);
    if (rec) {
      if (trimmed === rec.shown) {
        const want = texts.get(rec.orig);
        if (want === undefined) {
          node.nodeValue = raw.replace(rec.shown, () => rec.orig);
          appliedTexts.delete(node);
        } else if (want !== rec.shown) {
          node.nodeValue = raw.replace(rec.shown, () => want);
          rec.shown = want;
        }
        continue;
      }
      appliedTexts.delete(node); // React rendered something new here.
    }
    if (!trimmed) continue;
    const want = texts.get(trimmed);
    if (want !== undefined && want !== trimmed) {
      node.nodeValue = raw.replace(trimmed, () => want);
      appliedTexts.set(node, { orig: trimmed, shown: want });
    }
  }
}

function normalizeSrc(src: string | null): string {
  if (!src) return "";
  try {
    const u = new URL(src, window.location.href);
    if (u.pathname === "/_next/image") return u.searchParams.get("url") ?? u.href;
    return u.origin === window.location.origin ? u.pathname + u.search : u.href;
  } catch {
    return src;
  }
}

export function originalImageKey(img: HTMLImageElement): string {
  if (img.dataset.sgSet && img.getAttribute("src") === img.dataset.sgSet) return img.dataset.sgOrig ?? "";
  return normalizeSrc(img.getAttribute("src"));
}

export function imageTransform(o: Pick<SiteImageOverride, "x" | "y" | "zoom">): string {
  return `translate(${o.x}%, ${o.y}%) scale(${o.zoom})`;
}

function resetImage(img: HTMLImageElement): void {
  if (img.dataset.sgSet && img.getAttribute("src") === img.dataset.sgSet) {
    if (img.dataset.sgSrc !== undefined) img.setAttribute("src", img.dataset.sgSrc);
    if (img.dataset.sgSrcset) img.setAttribute("srcset", img.dataset.sgSrcset);
    else img.removeAttribute("srcset");
  }
  if (img.dataset.sgStyled) {
    img.style.transform = "";
    img.style.objectFit = img.dataset.sgFit ?? "";
    img.style.transformOrigin = "";
  }
  for (const k of ["sgSet", "sgOrig", "sgSrc", "sgSrcset", "sgStyled", "sgFit"]) delete img.dataset[k];
}

export function applyImages(images: Map<string, SiteImageOverride>): void {
  if (typeof document === "undefined") return;
  for (const img of Array.from(document.images)) {
    if (img.closest("[data-site-editor-ui]")) continue;
    const key = originalImageKey(img);
    const o = key ? images.get(key) : undefined;
    if (!o) {
      if (img.dataset.sgSet || img.dataset.sgStyled) resetImage(img);
      continue;
    }
    if (o.src) {
      if (img.getAttribute("src") !== o.src) {
        if (!img.dataset.sgSet) {
          img.dataset.sgSrc = img.getAttribute("src") ?? "";
          img.dataset.sgSrcset = img.getAttribute("srcset") ?? "";
        }
        img.dataset.sgOrig = key;
        img.dataset.sgSet = o.src;
        img.removeAttribute("srcset");
        img.setAttribute("src", o.src);
      }
    } else if (img.dataset.sgSet) {
      // Previously replaced, now only reframed: bring the original back.
      resetImage(img);
    }
    if (!img.dataset.sgStyled) {
      img.dataset.sgFit = img.style.objectFit;
      img.dataset.sgStyled = "1";
    }
    img.style.objectFit = "cover";
    img.style.transformOrigin = "center";
    const t = imageTransform(o);
    if (img.style.transform !== t) img.style.transform = t;
    if (img.parentElement) img.parentElement.style.overflow = "hidden";
  }
}
