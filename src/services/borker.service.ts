import { getRepository, IsNull, getManager } from 'typeorm'
import { Utxo, UtxoSeed } from '../db/entities/utxo'
import * as borker from 'borker-rs-node'
import fetch from 'node-fetch'

const wallet = new borker.JsWallet(process.env.MNEMONIC!.replace(/ +/g, " ").split(',')).childAt([-44, -0, -0, 0, 0])
let feeEstimate: FeeEstimationRes

export async function construct (handle: string, message: string): Promise<{ signedTx: string, inputs: Utxo[] }> {
  if (!feeEstimate || new Date().valueOf() - feeEstimate.timestamp > 3600000) {
    feeEstimate = await (await fetch('https://bitcoiner.live/api/fees/estimates/latest')).json()
  }

  const fee = feeEstimate.estimates[60].total.p2pkh.satoshi

  let inputs: Utxo[] = []
  let accum = 0
  let skip = 0
  do {
    let utxos = await getRepository(Utxo).find({
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
  } while (accum < fee)

  const txids = inputs.map(i => i.txid)

  const data: borker.NewBorkData = {
    type: borker.BorkType.Bork,
    content: `${handle}: ${message}`,
  }
  const txs = wallet.newBork(data, txids, null, [], fee, borker.Network.Bitcoin)

  return { signedTx: txs[0], inputs }
}

async function getMoreUtxos (): Promise<number> {
  const res = await (await fetch('https://api.blockcypher.com/v1/btc/main/addrs/1JnGQ45UE7tbFYkMg16bTm3jVJYv5YqVWW?unspentOnly=true')).json() as BlockcypherUtxoRes
  let txrefs = res.txrefs

  if (!txrefs.length) { return 0 }

  const toSave: UtxoSeed[] = txrefs.map(t => {
    return {
      txid: t.tx_hash,
      receivedAt: new Date(),
      amount: t.value
    }
  })
  const inserted = await getManager().createQueryBuilder()
    .insert()
    .into('utxos')
    .values(toSave)
    .onConflict('DO NOTHING')
    .execute()

  // @TODO confirm this return an array containing all inserted rows and empty array if none
  return inserted.identifiers.length
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

interface BlockcypherUtxoRes {
  txrefs: [
    {
      tx_hash: string
      tx_input_n: -1
      tx_output_n: 1
      value: 5000000
    }
  ]
}