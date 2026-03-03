package ix.memory.context

import cats.effect.IO
import cats.syntax.traverse._

import ix.memory.db.GraphQueryApi
import ix.memory.model._

class ClaimCollector(queryApi: GraphQueryApi) {

  def collect(tenant: TenantId, nodeIds: Vector[NodeId]): IO[Vector[Claim]] =
    nodeIds
      .traverse(id => queryApi.getClaims(tenant, id))
      .map(_.flatten.distinctBy(_.id))
}
