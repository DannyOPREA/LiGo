package lila.api

import lila.core.id.ClasId
import lila.team.Team
import lila.clas.Clas

final class ClasApi(
    clasApi: lila.clas.ClasApi
):

  def teamClas(team: Team): Fu[Option[Clas]] =
    team.isClas.so:
      clasApi.clas.byId(team.id.into(ClasId))

  // onSwissCreate/onArenaCreate (enrolling a class's students into a swiss/arena they created),
  // and the WithStudents helper they used, were removed with the swiss and tournament modules
  // (unit 3.2).
