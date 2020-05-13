import {
  Entity,
  PrimaryColumn,
  Column,
} from 'typeorm'

@Entity({ name: 'utxos' })
export class Utxo {

  @PrimaryColumn('text', { name: 'txid' })
  txid: string

  @Column('datetime', { name: 'created_at' })
  receivedAt: Date

  @Column('datetime', { name: 'updated_at', nullable: true })
  spentAt: Date | null

  @Column('int', { name: 'amount' })
  amount: number
}

export interface UtxoSeed {
  txid: string
  receivedAt: Date
  spentAt?: Date
  amount: number
}
