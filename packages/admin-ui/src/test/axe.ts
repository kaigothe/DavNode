import axe from 'axe-core';

/**
 * Runs axe-core on the current document and returns what it found, as
 * readable lines. jsdom has no layout and no real styles, so the colour
 * contrast rule (and the ones that need a viewport) cannot work here; the
 * end-to-end tests check those in a real browser, in both themes. The same
 * goes for "region" (all content in landmarks): it judges a whole page, but
 * here a component is rendered alone, and what Ant Design leaves in the body
 * after a closing modal (depending on how far its animation got) trips it.
 */
export async function accessibilityProblems(): Promise<string[]> {
  const result = await axe.run(document.body, {
    rules: {
      'color-contrast': { enabled: false },
      region: { enabled: false },
      'scrollable-region-focusable': { enabled: false },
    },
  });
  return (
    result.violations
      // Ant Design gives every generated id the value "test-id" when it runs
      // under test, so a drawer's aria-labelledby points at nothing here. In a
      // browser the ids are real; the end-to-end tests check this there.
      .filter(
        (v) =>
          !(
            v.id === 'aria-dialog-name' &&
            v.nodes.every((n) => n.html.includes('aria-labelledby="test-id"'))
          ),
      )
      .map(
        (v) =>
          `${v.impact ?? 'unknown'} ${v.id}: ${v.help} — ${v.nodes
            .slice(0, 3)
            .map((n) => n.target.join(' '))
            .join(', ')}`,
      )
  );
}
