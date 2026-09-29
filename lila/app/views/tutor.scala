package views.tutor

import lila.app.UiEnv.*

// The opening pages went with the opening module (unit 3.4); tutor, which goes in unit 3.5, links to
// the analysis board instead.
val bits = lila.tutor.ui.TutorBits(helpers)(_ => routes.UserAnalysis.index)
val perf = lila.tutor.ui.TutorPerfUi(helpers, bits)
val queue = lila.tutor.ui.TutorQueueUi(helpers, bits)
val reports = lila.tutor.ui.TutorReportsUi(helpers, bits)
val report = lila.tutor.ui.TutorReportUi(helpers, bits, perf)
val home = lila.tutor.ui.TutorHomeUi(helpers, bits, queue, reports)
val openingUi = lila.tutor.ui.TutorOpening(helpers, bits, perf)
