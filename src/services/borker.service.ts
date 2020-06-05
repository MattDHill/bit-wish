import { getRepository, IsNull, getManager } from 'typeorm'
import { Utx, UtxSeed } from '../db/entities/utxo'
import { Fee, FeeSeed } from '../db/entities/fee-estimate'
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

let fee: Fee | undefined

export async function construct (handle: string, message: string): Promise<{ signedTxs: string[], inputs: Utx[] }> {
  if (!fee) {
    fee = await getManager().findOne(Fee, { order: { timestamp: 'DESC' } })
  }
  if (!fee || new Date().valueOf() - fee.timestamp > 1800000) { // 30m
    console.log('getting new fee estimate')
    const estimate = await (await fetch('https://bitcoiner.live/api/fees/estimates/latest')).json()
    const seed: FeeSeed = {
      timestamp: new Date().valueOf(),
      total: estimate.estimates[180].total.p2pkh.satoshi,
      raw: JSON.stringify(estimate)
    }
    fee = await getRepository(Fee).save(getRepository(Fee).create(seed))
  }

  console.log('FEE ESTIMATE', fee)

  message = `@${handle} ${message}`
  const txCount = message.length > 74 ? 2 : 1
  const feePerTx = fee.total
  const totalFee = feePerTx * txCount
  const minSats = totalFee + feePerTx // for output back to self

  await getMoreUtxos()

  let inputs = await getRepository(Utx).find({
    where: {
      spentAt: IsNull()
    },
  })

  let available = inputs.reduce((a, b) => {
    return a + b.amount
  }, 0)

  if (available < minSats) {
    throw new Error('Not enough BTC!')
  }

  const borkId = process.env.NETWORK === 'mainnet' ? process.env.BORK_ID! : process.env.TEST_BORK_ID!
  const data: NewBorkData = {
    type: BorkType.Comment,
    content: message,
    referenceId: borkId.substr(0, 2)
  }
  const rawTxInputs = inputs.map(i => i.rawTx)
  const recipient = {
    address: wallet().address(Network.Bitcoin),
    value: available - totalFee
  }
  const version = process.env.NETWORK === 'mainnet' ? undefined : 42
  console.log(data, rawTxInputs, recipient, version)

  const signedTxs = wallet().newBork(data, rawTxInputs, recipient, [], totalFee, Network.Bitcoin, version)

  return { signedTxs, inputs }
}

async function getMoreUtxos (): Promise<void> {
  const scripthash = process.env.NETWORK === 'mainnet' ? process.env.SCRIPT_HASH! : process.env.TEST_SCRIPT_HASH!
  let utxos = await rpcRequest<ListUnspentRes>(1, 'blockchain.scripthash.listunspent', [scripthash]) || []

  if (!utxos.length) { return }

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

  await getManager().createQueryBuilder()
    .insert()
    .into('utxos')
    .values(toSave)
    .onConflict('DO NOTHING')
    .execute()
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
