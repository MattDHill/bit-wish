import { createConnections, getConnection, Connection } from 'typeorm'
import { database } from '../helpers/database'
import * as Twitter from '../../src/services/twitter.service'
import * as sinon from 'sinon'
import * as assert from 'assert'

describe('**** Twitter Service Tests ****', async () => {
  let connections: Connection[]

  before(async () => {
    connections = await createConnections([database])
    await getConnection('default').synchronize(true)
  })

  after(async () => {
    await Promise.all(connections.map(c => c.close()))
  })

  beforeEach(async () => {
    await getConnection('default').synchronize(true)
  })

  describe('', async () => {

    it('get mentions from Twitter', async () => {
      const mentions = await Twitter.getMentions(undefined, undefined)
      console.log(mentions)
    })
  })
})