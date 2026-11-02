// Resolves a tour target to a visible element. The sidebar's nav links exist in
// the DOM at every width but have a zero rect when hidden, so a hidden match is
// skipped in favour of the mobile fallback (the More menu or a bottom tab).
export type TargetRoot = { querySelectorAll(selector: string): ArrayLike<Element> };

function firstVisible(selector: string, root: TargetRoot): HTMLElement | null {
  for (const el of Array.from(root.querySelectorAll(selector))) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el as HTMLElement;
  }
  return null;
}

export function findTarget(
  selector: string,
  mobileFallback?: string,
  root: TargetRoot = document,
): HTMLElement | null {
  return firstVisible(selector, root) ?? (mobileFallback ? firstVisible(mobileFallback, root) : null);
}
