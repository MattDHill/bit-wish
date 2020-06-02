import {
  Entity,
  PrimaryColumn,
  Column,
} from 'typeorm'

@Entity({ name: 'utxos' })
export class Utx {

  @PrimaryColumn('text', { name: 'txid' })
  txid: string

  @Column('datetime', { name: 'created_at' })
  receivedAt: Date

  @Column('datetime', { name: 'spent_at', nullable: true })
  spentAt: Date | null

  @Column('int', { name: 'amount' })
  amount: number

  @Column('text', { name: 'raw_tx' })
  rawTx: string
}

export interface UtxSeed {
  txid: string
  receivedAt: Date
  spentAt?: Date
  amount: number
  rawTx: string
}
