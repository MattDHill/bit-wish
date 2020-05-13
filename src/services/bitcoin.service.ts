import fetch from 'node-fetch'

export async function broadcast (signedTx: string): Promise<string> {
  const res = await (await fetch('https://api.blockcypher.com/v1/btc/txs/push', {
    method: 'POST',
    body: JSON.stringify({ tx: signedTx }),
  })).json() as { hash: string }

  return res.hash
}