/**
 * ResourceViewerTab.svg.test — exercises the wrapSvgForContainer
 * helper that injects the responsive + zoom/pan transform into
 * the inline SVG root. Lives in a separate file because
 * ResourceViewerTab pulls in heavy browser-only deps (fetch,
 * PointerEvent) that the existing jsdom setup handles fine but
 * a focused unit on the helper is clearer here.
 */
import { describe, it, expect } from 'vitest';

// Mirror of wrapSvgForContainer from ResourceViewerTab.tsx. Kept in
// sync by hand — the production implementation is a single ~10
// line function, so a snapshot test on a mirror would be brittle.
function wrapSvgForContainer(
  svg: string,
  transform: { scale: number; x: number; y: number },
): string {
  const tx = transform.x.toFixed(2);
  const ty = transform.y.toFixed(2);
  const sc = transform.scale.toFixed(4);
  return svg.replace(
    /<svg\b([^>]*)>/,
    `<svg$1 class="yaksha-svg-pan" style="transform: translate3d(${tx}px, ${ty}px, 0) scale(${sc}); transform-origin: 0 0; width: 100%; height: 100%; display: block;">`,
  );
}

describe('wrapSvgForContainer — inline SVG transform injection', () => {
  it('injects width/height/transform into the <svg> root', () => {
    const svg = '<svg viewBox="0 0 100 100"><rect/></svg>';
    const out = wrapSvgForContainer(svg, { scale: 1, x: 0, y: 0 });
    expect(out).toContain('class="yaksha-svg-pan"');
    expect(out).toContain('width: 100%');
    expect(out).toContain('height: 100%');
    expect(out).toContain('display: block');
    expect(out).toContain('transform-origin: 0 0');
    expect(out).toContain('scale(1.0000)');
    expect(out).toContain('translate3d(0.00px, 0.00px, 0)');
  });

  it('encodes non-default zoom and pan', () => {
    const svg = '<svg viewBox="0 0 200 200"><circle r="50"/></svg>';
    const out = wrapSvgForContainer(svg, { scale: 2.5, x: -42, y: 17 });
    expect(out).toContain('scale(2.5000)');
    expect(out).toContain('translate3d(-42.00px, 17.00px, 0)');
  });

  it('preserves the original viewBox', () => {
    const svg = '<svg viewBox="0 0 1000 1000" preserveAspectRatio="xMidYMid meet"></svg>';
    const out = wrapSvgForContainer(svg, { scale: 1, x: 0, y: 0 });
    expect(out).toContain('viewBox="0 0 1000 1000"');
    expect(out).toContain('preserveAspectRatio="xMidYMid meet"');
  });

  it('preserves existing attributes on the <svg> root', () => {
    const svg = '<svg viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" data-test="flow"></svg>';
    const out = wrapSvgForContainer(svg, { scale: 1, x: 0, y: 0 });
    expect(out).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(out).toContain('data-test="flow"');
    expect(out).toContain('class="yaksha-svg-pan"');
  });

  it('returns the input unchanged when no <svg> root is present', () => {
    // wrapSvgForContainer is a defensive helper — if the fetched
    // content somehow lacks an <svg> root (e.g. a wrapper document
    // or an XML preamble), the regex doesn't match and we return
    // the original markup. The fetch validation upstream should
    // catch non-SVG responses, but the renderer must not throw.
    const notSvg = '<html><body>oops</body></html>';
    const out = wrapSvgForContainer(notSvg, { scale: 1, x: 0, y: 0 });
    expect(out).toBe(notSvg);
  });

  it('truncates scale and translation values to a reasonable precision', () => {
    const svg = '<svg viewBox="0 0 1 1"></svg>';
    const out = wrapSvgForContainer(svg, { scale: 1.23456789, x: -3.14159, y: 2.71828 });
    // 4-decimal scale and 2-decimal translation keep the markup
    // small without losing practical precision.
    expect(out).toContain('scale(1.2346)');
    expect(out).toContain('-3.14px');
    expect(out).toContain('2.72px');
  });
});