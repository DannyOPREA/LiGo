import type LobbyController from './ctrl';
import type { Hook } from './interfaces';

export function init(hook: Hook) {
  hook.action = hook.sri === site.sri ? 'cancel' : 'join';
}

export function initAll(ctrl: LobbyController) {
  ctrl.data.hooks.forEach(init);
}

export function add(ctrl: LobbyController, hook: Hook) {
  init(hook);
  ctrl.data.hooks.push(hook);
}
export function setAll(ctrl: LobbyController, hooks: Hook[]) {
  ctrl.data.hooks = hooks;
  initAll(ctrl);
}
export function remove(ctrl: LobbyController, id: string) {
  ctrl.data.hooks = ctrl.data.hooks.filter(h => h.id !== id);
  ctrl.stepHooks.forEach(h => {
    if (h.id === id) h.disabled = true;
  });
}
export function syncIds(ctrl: LobbyController, ids: string[]) {
  ctrl.data.hooks = ctrl.data.hooks.filter(h => ids.includes(h.id));
}
export function find(ctrl: LobbyController, id: string) {
  return ctrl.data.hooks.find(h => h.id === id);
}
