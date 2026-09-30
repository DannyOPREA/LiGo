// The accessibility check shared by the page tests (units 9.4 and 9.7, ADR 0026 §4): axe-core's
// serious or critical WCAG 2.2 AA problems inside one part of the page, as readable lines.
import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** A contrast failure's colours and ratio, so the message says what to fix. */
const colours = (n: { any: { data?: unknown }[] }): string => {
  const d = n.any.find(c => (c.data as { contrastRatio?: number })?.contrastRatio)?.data as
    | { fgColor: string; bgColor: string; contrastRatio: number }
    | undefined;
  return d ? ` ${d.fgColor} on ${d.bgColor}, ${d.contrastRatio}:1` : '';
};

/** `exclude`: parts of the page left out, each with the reason at the call. */
export async function axeProblems(page: Page, include: string, exclude: string[] = []): Promise<string[]> {
  const axe = new AxeBuilder({ page }).include(include).withTags(WCAG);
  for (const part of exclude) axe.exclude(part);
  const { violations } = await axe.analyze();
  // lila's own buttons (white on its primary blue #3692e7, 3.3:1) fail colour contrast on every
  // page; unit 9.7's second part fixes lila's colours site-wide (ADR 0026 §4). Only that pair of
  // colours is let off.
  const lilaBlue = (n: { any: { data?: unknown }[] }) =>
    n.any.some(c => {
      const d = c.data as { fgColor?: string; bgColor?: string } | undefined;
      return d?.fgColor === '#ffffff' && d?.bgColor === '#3692e7';
    });
  return violations
    .filter(v => v.impact === 'serious' || v.impact === 'critical')
    .map(v => (v.id === 'color-contrast' ? { ...v, nodes: v.nodes.filter(n => !lilaBlue(n)) } : v))
    .filter(v => v.nodes.length > 0)
    .map(v => `${v.id}: ${v.help} (${v.nodes.map(n => n.target.join(' ') + colours(n)).join(', ')})`);
}
