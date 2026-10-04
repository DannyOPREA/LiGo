import { attributesModule, classModule, eventListenersModule, init, propsModule } from 'snabbdom';

export const patch = init([classModule, attributesModule, propsModule, eventListenersModule]);
