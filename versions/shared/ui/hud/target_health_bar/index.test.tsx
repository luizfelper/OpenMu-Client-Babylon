import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

vi.stubGlobal('location', { search: '', hostname: 'localhost', href: 'http://localhost/' });
const { TargetPanel } = await import('.');

const TARGET = { name: 'Budge Dragon', steps: 12, showBar: true };

describe('the monster health panel', () => {
  it('sits across the top of the screen in the original position', () => {
    const html = renderToStaticMarkup(<TargetPanel {...TARGET} overHead={false} />);

    expect(html).not.toContain('over-head');
    expect(html).toContain('class="target-name" style="top:2px"');
    expect(html).toContain('class="target-bar" style="width:82px;height:5px;top:15px"');
  });

  it('sits over the monster head, both pieces above the projected point', () => {
    const html = renderToStaticMarkup(<TargetPanel {...TARGET} overHead />);

    expect(html).toContain('class="target-health-bar over-head"');
    expect(html).toContain('class="target-name" style="top:-28px"');
    expect(html).toContain('class="target-bar" style="width:82px;height:5px;top:-13px"');
  });

  it('draws one step per twentieth of the health it was given', () => {
    const html = renderToStaticMarkup(<TargetPanel {...TARGET} overHead />);

    expect(html.match(/class="bar-step"/g)?.length).toBe(TARGET.steps);
  });

  it('keeps the name and drops the bar when nothing knows the health', () => {
    const html = renderToStaticMarkup(
      <TargetPanel name={TARGET.name} steps={0} showBar={false} overHead />
    );

    expect(html).toContain('Budge Dragon');
    expect(html).not.toContain('target-bar');
  });
});
