import type { Classes } from 'snabbdom';

import { enrichText, innerHTML } from 'lib/richText';
import { ops as treeOps } from 'lib/tree/tree';
import type { TreePath } from 'lib/tree/types';
import { type VNode, type LooseVNodes, hl } from 'lib/view';

import type AnalyseCtrl from '@/ctrl';
import { moveName } from '@/go';
import type { AnalyseNode } from '@/interfaces';

/**
 * lila's inline move list (the tree's main line, with each variation in brackets or on its own
 * lines under the move it branches from), for Go: every move shows its number, its point and its
 * glyphs. lila's collapsible variations ("disclosure") and engine marks are left out.
 */
export function renderInlineView(ctrl: AnalyseCtrl): VNode {
  const renderer = new InlineView(ctrl);
  const root = ctrl.tree.root;
  return hl('div.tview2.tview2-inline', [
    renderer.commentNodes(root),
    renderer.renderNodes(root.children, { parentPath: '', parentNode: root, isMainline: true }),
  ]);
}

interface Args {
  isMainline: boolean;
  parentPath: TreePath;
  parentNode: AnalyseNode;
  parenthetical?: boolean;
}

/** lila's glyph ids 1–6 (`!`, `?`, `!!`, `??`, `!?`, `?!`) as the move list's classes. */
const glyphClasses = ['good', 'mistake', 'brilliant', 'blunder', 'interesting', 'inaccuracy'];

class InlineView {
  constructor(readonly ctrl: AnalyseCtrl) {}

  renderNodes([child, ...siblings]: AnalyseNode[], args: Args): LooseVNodes {
    if (!child) return undefined;
    return child.forceVariation && args.isMainline
      ? hl('interrupt', this.lines([child, ...siblings], args))
      : [
          this.moveNode(child, args),
          this.commentNodes(child),
          siblings[0] && hl('interrupt', this.lines(siblings, args)),
          this.renderNodes(child.children, this.childArgs(child, args, true)),
        ];
  }

  commentNodes(node: AnalyseNode): LooseVNodes[] {
    if (!this.ctrl.showComments || !node.comments.length) return [];
    return node.comments.map(comment =>
      hl('comment', [hl('span', { hook: innerHTML(comment.text, enrichText) })]),
    );
  }

  private lines(lines: AnalyseNode[], args: Args): LooseVNodes {
    if (!lines.length) return undefined;
    const lineArgs = { parentPath: args.parentPath, parentNode: args.parentNode, isMainline: false };
    return args.parenthetical
      ? hl('inline', this.sidelineNodes(lines, lineArgs))
      : hl(
          'lines',
          lines.map(line => hl('line', this.sidelineNodes([line], lineArgs))),
        );
  }

  private sidelineNodes([child, ...siblings]: AnalyseNode[], args: Args): LooseVNodes {
    if (!child) return undefined;
    const childArgs = this.childArgs(child, args, false);
    return [
      this.moveNode(child, args),
      this.commentNodes(child),
      args.parenthetical && this.lines(siblings, args),
      child.children.length < 2 || childArgs.parenthetical
        ? this.sidelineNodes(child.children, childArgs)
        : this.lines(child.children, childArgs),
      !args.parenthetical && this.lines(siblings, args),
    ];
  }

  private childArgs(child: AnalyseNode, args: Args, isMainline: boolean): Args {
    return {
      isMainline,
      parentPath: args.parentPath + child.id,
      parentNode: child,
      parenthetical: this.parenthetical(child),
    };
  }

  /** A single short side line goes in brackets inside the line it leaves. */
  private parenthetical(node: AnalyseNode): boolean {
    const [, second, third] = node.children;
    return !third && !!second && !treeOps.hasBranching(second, 6);
  }

  private moveNode(node: AnalyseNode, { isMainline, parentPath }: Args): VNode {
    const { ctrl } = this;
    const path = parentPath + node.id;
    const classes: Classes = {
      mainline: isMainline,
      active: path === ctrl.path,
      'context-menu': path === ctrl.contextMenuPath,
      'pending-deletion': path.startsWith(ctrl.pendingDeletionPath() || ' '),
      [node.color ?? 'black']: true,
    };
    node.glyphs.forEach(g => {
      const cls = glyphClasses[g.id - 1];
      if (cls) classes[cls] = true;
    });
    return hl('move', { attrs: { p: path }, class: classes }, [
      hl('index', String(node.ply)),
      hl('san', moveName(ctrl.size, node)),
      node.glyphs.map(g => hl('glyph', { attrs: { title: g.name } }, g.symbol)),
    ]);
  }
}
