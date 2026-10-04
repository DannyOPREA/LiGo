db.game5.find({ so: 7, 'sgfi.user': { $exists: true } }).forEach(function (g) {
  delete g.ua;
  delete g.tv;
  g.sgfi.ca = g.ca;
  db.game5.update({ _id: g._id }, { $set: { 'sgfi.ca': g.ca }, $unset: { ua: true, tv: true } });
});
