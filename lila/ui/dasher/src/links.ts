import { install, installOffer } from 'lib/install';
import { licon, type LiconValue } from 'lib/licon';
import { pubsub } from 'lib/pubsub';
import { type Attrs, hl, type VNode, bind } from 'lib/view';
import { userLine, profileUrl } from 'lib/view/userLink';

import { type Mode, PaneCtrl } from './interfaces';

export class LinksCtrl extends PaneCtrl {
  render = (): VNode => {
    const modeCfg = this.modeCfg;
    return hl('div', [
      this.userLinks(),
      hl('div.subs', [
        hl('button.sub.language', modeCfg('langs'), i18n.site.language),
        hl('button.sub', modeCfg('sound'), i18n.site.sound),
        hl('button.sub', modeCfg('theme'), i18n.site.theme),
        hl('button.sub', modeCfg('board'), i18n.site.board),
        hl('button.sub', modeCfg('piece'), i18n.site.pieceSet),
        this.root.opts.zenable &&
          hl('div.zen.selector', [
            hl(
              'button.text',
              {
                attrs: { 'data-icon': licon.DiscBigOutline, title: 'Keyboard: z', type: 'button' },
                hook: bind('click', () => pubsub.emit('zen')),
              },
              i18n.preferences.zenMode,
            ),
          ]),
        this.installEntry(),
      ]),
      this.root.ping.render(),
    ]);
  };

  // LiGo: "Install LiGo" (unit 9.6, ADR 0026 §1). English until LiGo's strings reach i18n.
  private installEntry(): VNode | null {
    const offer = installOffer();
    if (offer === 'prompt')
      return hl('div.install.selector', [
        hl(
          'button.text',
          {
            attrs: { 'data-icon': licon.Download, type: 'button' },
            hook: bind('click', () => install().then(() => this.root.redraw())),
          },
          'Install LiGo',
        ),
      ]);
    if (offer === 'ios')
      return hl('div.install.selector', [
        hl(
          'p.text',
          { attrs: { 'data-icon': licon.ShareIos } },
          'Install LiGo: Share, then Add to Home Screen',
        ),
      ]);
    return null;
  }

  private get data() {
    return this.root.data;
  }

  private userLinks(): VNode | null {
    const d = this.data;
    const linkCfg = this.linkCfg;
    return d.user
      ? hl('div.links', [
          hl('a.user-link.online', { attrs: { href: profileUrl(d.user.name) } }, [
            userLine(d.user),
            i18n.site.profile,
          ]),
          hl(
            'a.text',
            linkCfg(
              '/account/profile',
              licon.Gear,
              this.root.opts.playing ? { target: '_blank' } : undefined,
            ),
            i18n.preferences.preferences,
          ),
          hl('form.logout', { attrs: { method: 'post', action: '/logout' } }, [
            hl('button.text', { attrs: { type: 'submit', 'data-icon': licon.Power } }, i18n.site.logOut),
          ]),
        ])
      : null;
  }

  private readonly modeCfg = (m: Mode) => ({ hook: bind('click', () => this.root.setMode(m)) });

  private readonly linkCfg = (href: string, icon: LiconValue, more?: Attrs) => ({
    attrs: { href, 'data-icon': icon, ...more },
  });
}
