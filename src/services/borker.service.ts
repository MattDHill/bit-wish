import { getRepository, IsNull, getManager } from 'typeorm'
import { Utx, UtxSeed } from '../db/entities/utxo'
import { JsWallet, BorkType, NewBorkData, Network } from 'borker-rs-node'
import fetch from 'node-fetch'
import proxyFetch from 'socks5-node-fetch'

const torFetch = proxyFetch({
  socksHost: 'localhost',
  socksPort: '9050'
})

const mnemonic = process.env.NETWORK === 'mainnet' ? process.env.MNEMONIC : process.env.TEST_MNEMONIC
const wallet = new JsWallet(mnemonic!.replace(/ +/g, " ").split(',')).childAt([-44, -0, -0, 0, 0])

let feeEstimate: FeeEstimationRes

export async function construct (handle: string, message: string): Promise<{ signedTxs: string[], inputs: Utx[] }> {
  if (!feeEstimate || new Date().valueOf() - feeEstimate.timestamp > 3600000) {
    feeEstimate = await (await fetch('https://bitcoiner.live/api/fees/estimates/latest')).json()
  }

  message = `${handle}: ${message}`
  const txCount = message.length > 76 ? 2 : 1
  const feePerTx = feeEstimate.estimates[60].total.p2pkh.satoshi * 1.25
  const totalFee = feePerTx * txCount

  let inputs: Utx[] = []
  let accum = 0
  let skip = 0
  do {
    let utxos = await getRepository(Utx).find({
      where: {
        spentAt: IsNull()
      },
      order: { receivedAt: 'ASC' },
      take: 10,
      skip,
    })

    if (!utxos.length) {
      const moreUtxos = await getMoreUtxos()
      if (moreUtxos) {
        continue
      } else {
        throw new Error('No more BTC!')
      }
    }

    for (let u of utxos) {
      inputs.push(u)
      accum = accum + u.amount
    }

    skip = skip + utxos.length
  } while (accum < totalFee)

  const rawTxInputs = inputs.map(i => i.rawTx)

  const data: NewBorkData = {
    type: BorkType.Bork,
    content: message,
  }

  const signedTxs = wallet.newBork(data, rawTxInputs, null, [], totalFee, Network.Bitcoin)

  return { signedTxs, inputs }
}

async function getMoreUtxos (): Promise<number> {

  let utxos = await rpcRequest<ListUnspentRes>({
    id: 1,
    method: 'blockchain.address.listunspent',
    params: [wallet.address(Network.Bitcoin)]
  }) || []

  if (!utxos.length) { return 0 }

  const unspent = utxos.reduce((acc, u) => {
    if (acc[u.tx_hash]) {
      acc[u.tx_hash] += u.value
    } else {
      acc[u.tx_hash] = u.value
    }
    return acc
  }, {} as {[txid:string]: number})

  const toSave: UtxSeed[] = []

  for (let txid in unspent) {
    const rawTx = await rpcRequest<string>({
      id: 2,
      method: 'blockchain.transaction.get',
      params: [txid]
    })

    toSave.push({
      txid,
      receivedAt: new Date(),
      amount: unspent[txid],
      rawTx,
    })
  }

  const inserted = await getManager().createQueryBuilder()
    .insert()
    .into('utxos')
    .values(toSave)
    .onConflict('DO NOTHING')
    .execute()

  // @TODO confirm this return an array containing all inserted rows and empty array if none
  return inserted.identifiers.length
}

export async function broadcast (signedTx: string): Promise<string> {
  return rpcRequest<string>({
    id: 3,
    method: 'blockchain.transaction.broadcast',
    params: [signedTx]
  })
}

export async function rpcRequest<T>(body: RPCReq): Promise<T> {

  const url = process.env.RPC_URL!
  const request = url.includes('.onion') ? torFetch : fetch

  let res: RPCRes<T>
  try {
    res = await (await request(url, {
      method: 'POST',
      body: JSON.stringify(body),
    })).json()
  } catch (e) {
    throw new Error(`4:${e}`)
  }

  const result = res.result

  if (!result) {
    const error = res.error!
    throw new Error(`${body.id}:${error.code}:${error.message}`)
  }

  return result
}

interface FeeEstimationRes {
  timestamp: number
  estimates: {
    60: {
      sat_per_vbyte: number
      total: {
        p2pkh:{
          usd: number
          satoshi: number
        }
      }
    }
  }
}

interface RPCReq {
  id: number
  method: string
  params: any[]
}

interface RPCRes<T> {
  id: number
  result?: T
  error?: RPCError
}

type ListUnspentRes = {
  tx_hash: string
  tx_pos: number
  value: number
  height: number
}[]

interface RPCError {
  code: number
  message: string
}