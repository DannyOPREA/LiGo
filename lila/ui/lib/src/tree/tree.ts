import { defined } from '../index';
import * as ops from './ops';
import * as treePath from './path';
import type { Clock, Glyph, Shape, TreeComment, TreeNode, TreeNodeOf, TreePath } from './types';

export { treePath as path, ops };

export type MaybeNode<N extends TreeNodeOf<N> = TreeNode> = N | undefined;

export interface TreeWrapper<N extends TreeNodeOf<N> = TreeNode> {
  root: N;
  lastPly(): number;
  nodeAtPath(path: TreePath): N;
  getNodeList(path: TreePath): N[];
  longestValidPath(path: string): TreePath;
  updateAt(path: TreePath, update: (node: N) => void): MaybeNode<N>;
  addNode(node: N, path: TreePath): TreePath | undefined;
  addNodes(nodes: N[], path: TreePath): TreePath | undefined;
  setShapes(shapes: Shape[], path: TreePath): MaybeNode<N>;
  setCommentAt(comment: TreeComment, path: TreePath): MaybeNode<N>;
  deleteCommentAt(id: string, path: TreePath): MaybeNode<N>;
  setGlyphsAt(glyphs: Glyph[], path: TreePath): MaybeNode<N>;
  setClockAt(clock: Clock | undefined, path: TreePath): MaybeNode<N>;
  pathIsMainline(path: TreePath): boolean;
  pathIsForcedVariation(path: TreePath): boolean;
  lastMainlineNode(path: TreePath): N;
  pathExists(path: TreePath): boolean;
  deleteNodeAt(path: TreePath): void;
  promoteAt(path: TreePath, toMainline: boolean): void;
  forceVariationAt(path: TreePath, force: boolean): MaybeNode<N>;
  getCurrentNodesAfterPly(nodeList: N[], mainline: N[], ply: number): N[];
  merge(tree: N): void;
  parentNode(path: TreePath): N;
  getParentClock(node: N, path: TreePath): Clock | undefined;
  walkUntilTrue(
    fn: (node: N, isMainline: boolean) => boolean,
    path?: TreePath,
    branchOnly?: boolean,
  ): boolean;
}

export function makeTree<N extends TreeNodeOf<N> = TreeNode>(root: N): TreeWrapper<N> {
  const lastNode = (): MaybeNode<N> => ops.findInMainline(root, (node: N) => !node.children.length);

  const nodeAtPath = (path: TreePath): N => nodeAtPathFrom(root, path);

  function nodeAtPathFrom(node: N, path: TreePath): N {
    if (path === '') return node;
    const child = ops.childById(node, treePath.head(path));
    return child ? nodeAtPathFrom(child, treePath.tail(path)) : node;
  }

  const nodeAtPathOrNull = (path: TreePath): MaybeNode<N> => nodeAtPathOrNullFrom(root, path);

  function nodeAtPathOrNullFrom(node: N, path: TreePath): MaybeNode<N> {
    if (path === '') return node;
    const child = ops.childById(node, treePath.head(path));
    return child ? nodeAtPathOrNullFrom(child, treePath.tail(path)) : undefined;
  }

  function longestValidPathFrom(node: N, path: TreePath): TreePath {
    const id = treePath.head(path);
    const child = ops.childById(node, id);
    return child ? id + longestValidPathFrom(child, treePath.tail(path)) : '';
  }

  function getCurrentNodesAfterPly(nodeList: N[], mainline: N[], ply: number): N[] {
    const nodes = [];
    for (let i = 0; i < nodeList.length; i++) {
      const node = nodeList[i];
      if (node.ply <= ply && mainline[i].id !== node.id) break;
      if (node.ply > ply) nodes.push(node);
    }
    return nodes;
  }

  const pathIsMainline = (path: TreePath): boolean => pathIsMainlineFrom(root, path);

  function pathIsMainlineFrom(node: N, path: TreePath): boolean {
    if (path === '') return true;
    const child = node.children[0];
    return child?.id === treePath.head(path) && pathIsMainlineFrom(child, treePath.tail(path));
  }

  const pathExists = (path: TreePath): boolean => !!nodeAtPathOrNull(path);

  const pathIsForcedVariation = (path: TreePath): boolean => getNodeList(path).some(n => n.forceVariation);

  function lastMainlineNodeFrom(node: N, path: TreePath): N {
    if (path === '') return node;
    const pathId = treePath.head(path);
    const child = node.children[0];
    if (!child || child.id !== pathId) return node;
    return lastMainlineNodeFrom(child, treePath.tail(path));
  }

  const getNodeList = (path: TreePath): N[] =>
    ops.collect(root, (node: N) => {
      const id = treePath.head(path);
      if (id === '') return undefined;
      path = treePath.tail(path);
      return ops.childById(node, id);
    });

  function updateAt(path: TreePath, update: (node: N) => void): MaybeNode<N> {
    const node = nodeAtPathOrNull(path);
    if (node) update(node);
    return node;
  }

  // returns new path
  function addNode(node: N, path: TreePath): TreePath | undefined {
    const newPath = path + node.id,
      existing = nodeAtPathOrNull(newPath);
    if (existing) {
      if (defined(node.clock) && !defined(existing.clock)) existing.clock = node.clock;
      return newPath;
    }
    return updateAt(path, n => {
      n.children.push(node);
    })
      ? newPath
      : undefined;
  }

  function addNodes(nodes: N[], path: TreePath): TreePath | undefined {
    const node = nodes[0];
    if (!node) return path;
    const newPath = addNode(node, path);
    return newPath ? addNodes(nodes.slice(1), newPath) : undefined;
  }

  const deleteNodeAt = (path: TreePath): void => ops.removeChild(parentNode(path), treePath.last(path));

  function promoteAt(path: TreePath, toMainline: boolean): void {
    const nodes = getNodeList(path);
    for (let i = nodes.length - 2; i >= 0; i--) {
      const node = nodes[i + 1];
      const parent = nodes[i];
      if (parent.children[0].id !== node.id) {
        ops.removeChild(parent, node.id);
        parent.children.unshift(node);
        if (!toMainline) break;
      } else if (node.forceVariation) {
        node.forceVariation = false;
        if (!toMainline) break;
      }
    }
  }

  const setCommentAt = (comment: TreeComment, path: TreePath) =>
    !comment.text
      ? deleteCommentAt(comment.id, path)
      : updateAt(path, node => {
          node.comments = node.comments || [];
          const existing = node.comments.find(function (c) {
            return c.id === comment.id;
          });
          if (existing) existing.text = comment.text;
          else node.comments.push(comment);
        });

  const deleteCommentAt = (id: string, path: TreePath) =>
    updateAt(path, node => {
      const comments = (node.comments || []).filter(c => c.id !== id);
      node.comments = comments.length ? comments : undefined;
    });

  const setGlyphsAt = (glyphs: Glyph[], path: TreePath) =>
    updateAt(path, node => {
      node.glyphs = glyphs;
    });

  const parentNode = (path: TreePath): N => nodeAtPath(treePath.init(path));

  const getParentClock = (node: N, path: TreePath): Clock | undefined =>
    path ? parentNode(path).clock : node.clock;

  function walkUntilTrue(
    fn: (node: N, isMainline: boolean) => boolean,
    from: TreePath = '',
    branchOnly = false,
  ) {
    function traverse(node: N, isMainline: boolean): boolean {
      if (fn(node, isMainline)) return true;
      let i = branchOnly ? 1 : 0;
      branchOnly = false;
      while (i < node.children.length) {
        const c = node.children[i];
        if (traverse(c, isMainline && i === 0 && !c.forceVariation)) return true;
        i++;
      }
      return false;
    }
    const n = nodeAtPathOrNull(from);
    return n ? traverse(n, pathIsMainline(from)) : false;
  }

  return {
    root,
    lastPly: (): number => lastNode()?.ply || root.ply,
    nodeAtPath,
    getNodeList,
    longestValidPath: (path: string) => longestValidPathFrom(root, path),
    updateAt,
    addNode,
    addNodes,
    setShapes: (shapes: Shape[], path: TreePath) =>
      updateAt(path, (node: N) => {
        node.shapes = shapes.slice();
      }),
    setCommentAt,
    deleteCommentAt,
    setGlyphsAt,
    setClockAt: (clock: Clock | undefined, path: TreePath) =>
      updateAt(path, node => {
        node.clock = clock;
      }),
    pathIsMainline,
    pathIsForcedVariation,
    lastMainlineNode: (path: TreePath): N => lastMainlineNodeFrom(root, path),
    pathExists,
    deleteNodeAt,
    promoteAt,
    forceVariationAt: (path: TreePath, force: boolean) => {
      ops.updateAll(root, n => (n.forceVariation = false));
      return updateAt(path, node => (node.forceVariation = force));
    },
    getCurrentNodesAfterPly,
    merge: (tree: N) => ops.merge(root, tree),
    parentNode,
    getParentClock,
    walkUntilTrue,
  };
}
