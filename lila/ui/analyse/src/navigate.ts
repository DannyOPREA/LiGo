import { path as treePath } from 'lib/tree/tree';

import type AnalyseCtrl from './ctrl';
import type { AnalyseNode } from './interfaces';

export default class Navigate {
  constructor(private readonly ctrl: AnalyseCtrl) {}

  next = (): void => {
    const child = this.ctrl.node.children[0];
    if (child) this.ctrl.userJumpIfCan(this.ctrl.path + child.id);
  };

  prev = (): void => this.ctrl.userJumpIfCan(treePath.init(this.ctrl.path));

  last = (): void => this.ctrl.userJumpIfCan(treePath.fromNodeList(this.ctrl.mainline));

  first = (): void => this.ctrl.userJump(treePath.root);

  previousBranch = (): void => {
    let path = treePath.init(this.ctrl.path),
      parent = this.ctrl.tree.nodeAtPath(path);
    while (path.length && parent && parent.children.length < 2) {
      path = treePath.init(path);
      parent = this.ctrl.tree.nodeAtPath(path);
    }
    this.ctrl.userJumpIfCan(path);
  };

  nextBranch = (): void => {
    let child = this.ctrl.node.children[0];
    let path = this.ctrl.path;
    while (child && child.children.length < 2) {
      path += child.id;
      child = child.children[0];
    }
    if (child) this.ctrl.userJumpIfCan(path + child.id);
    else if (this.ctrl.tree.pathIsMainline(this.ctrl.path)) this.last();
    else this.exitVariation();
  };

  /** To the next (or previous) sibling line of the variation the cursor is in. */
  stepLine = (which: 'prev' | 'next'): void => {
    const from = this.ctrl.path;
    let [path, kids] = this.familyOf(from);
    while (path && kids.length < 2 && !this.ctrl.tree.pathIsMainline(path))
      [path, kids] = this.familyOf(path);
    const i = kids.findIndex(k => from.slice(path.length).startsWith(k.id));
    const to = which === 'next' ? (kids[i + 1] ?? kids[0]) : (kids[i - 1] ?? kids[kids.length - 1]);
    if (to) this.ctrl.userJumpIfCan(path + to.id);
  };

  private familyOf(path: string): [string, AnalyseNode[]] {
    const parentPath = treePath.init(path);
    return [parentPath, this.ctrl.tree.nodeAtPath(parentPath).children];
  }

  private readonly exitVariation = (): void => {
    if (this.ctrl.onMainline) return;
    let found,
      path = treePath.root;
    this.ctrl.nodeList.slice(1, -1).forEach((n: AnalyseNode) => {
      path += n.id;
      if (n.children[1]) found = path;
    });
    if (found) this.ctrl.userJump(found);
  };
}
