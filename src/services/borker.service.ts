import { getRepository, IsNull, getManager } from 'typeorm'
import { Utx, UtxSeed } from '../db/entities/utxo'
import { FeeEstimate, FeeEstimateSeed } from '../db/entities/fee-estimate'
import { JsWallet, BorkType, NewBorkData, Network, JsChildWallet } from 'borker-rs-node'
import fetch from 'node-fetch'
import ElectrumCli from 'electrum-client'

let _ecl: ElectrumCli
const ecl = async (): Promise<any> => {
  if (!_ecl) {
    _ecl = new ElectrumCli(50001, process.env.RPC_URL)
    await _ecl.connect()
  }
  return _ecl
}

let _mnemonic: string
const mnemonic = (): string => {
  if (!_mnemonic) {
    _mnemonic = process.env.NETWORK === 'mainnet' ? process.env.MNEMONIC! : process.env.TEST_MNEMONIC!
  }
  return _mnemonic
}

let _wallet: JsChildWallet
const wallet = (): JsChildWallet => {
  if (!_wallet) {
    _wallet = new JsWallet(mnemonic().replace(/ +/g, " ").split(',')).childAt([-44, -0, -0, 0, 0])
  }
  return _wallet
}

let feeEstimate: FeeEstimationRes

export async function construct (handle: string, message: string): Promise<{ signedTxs: string[], inputs: Utx[] }> {
  if (!feeEstimate) {
    const fromDB = await getManager().findOne(FeeEstimate, { order: { createdAt: 'DESC' } })
    if (fromDB) { feeEstimate = JSON.parse(fromDB.feeObj) }
  }
  if (!feeEstimate || new Date().valueOf() - feeEstimate.timestamp > 3600000) {
    console.log('getting new fee estimate')
    feeEstimate = await (await fetch('https://bitcoiner.live/api/fees/estimates/latest')).json()
    const seed: FeeEstimateSeed = {
      createdAt: new Date(),
      feeObj: JSON.stringify({ ...feeEstimate, timestamp: feeEstimate.timestamp * 1000 })
    }
    await getRepository(FeeEstimate).save(getRepository(FeeEstimate).create(seed))
  }

  console.log('FEE ESTIMATE', feeEstimate)

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

  const version = process.env.NETWORK === 'mainnet' ? undefined : 42
  const signedTxs = wallet().newBork(data, rawTxInputs, null, [], totalFee, Network.Bitcoin, version)

  return { signedTxs, inputs }
}

async function getMoreUtxos (): Promise<number> {
  const scripthash = process.env.NETWORK === 'mainnet' ? process.env.SCRIPT_HASH! : process.env.TEST_SCRIPT_HASH!
  let utxos = await rpcRequest<ListUnspentRes>(1, 'blockchain.scripthash.listunspent', [scripthash]) || []

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
    const rawTx = await rpcRequest<string>(2, 'blockchain.transaction.get', [txid])

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
  return rpcRequest<string>(3, 'blockchain.transaction.broadcast', [signedTx])
}

export async function rpcRequest<T>(id: number, method: string, params: any[]): Promise<T> {
  try {
    const client = await ecl()
    return client.request(method, params)
  } catch (e) {
    throw new Error(`${id}:${e.code || '9999'}:${e.message || 'unknown'}`)
  }
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

type ListUnspentRes = {
  tx_hash: string
  tx_pos: number
  value: number
  height: number
}[]
