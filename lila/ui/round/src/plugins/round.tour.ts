import Shepherd from 'shepherd.js';

import type { RoundTour } from '../interfaces';

export function initModule(): RoundTour {
  return {
    corresRematchOffline,
  };

  function corresRematchOffline() {
    const tour = new Shepherd.Tour();

    tour.addStep({
      title: i18n.site.goRematchOfflineTitle,
      text: i18n.site.goRematchOfflineText,
      attachTo: {
        element: 'button.rematch',
        on: 'bottom',
      },
      buttons: [
        {
          action() {
            return this.next();
          },
          text: i18n.site.goOkGotIt,
        },
      ],
    });

    tour.start();
  }
}
