import { sortTable, extendTablesortNumber } from 'lib/tablesort';
import { enter } from 'lib/view';

import { checkBoxAll, expandCheckboxZone, shiftClickCheckboxRange } from './checkBoxes';

site.load.then(() => {
  setupTable();
  setupFilter();
});

const setupFilter = () => {
  const form = document.querySelector('.mod-games__filter-form') as HTMLFormElement;
  $(form)
    .find('select')
    .on('change', () => form.submit());
  $(form)
    .find('input')
    .on(
      'keydown',
      enter(() => form.submit()),
    );
};

const setupTable = () => {
  const table = document.querySelector('table.game-list') as HTMLTableElement;
  extendTablesortNumber();
  sortTable(table, { descending: true });

  expandCheckboxZone(table, 'td:first-child', shiftClickCheckboxRange(table));
  checkBoxAll(table);
};
