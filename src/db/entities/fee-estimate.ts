import {
  Entity,
  PrimaryColumn,
  Column,
} from 'typeorm'

@Entity({ name: 'fee_estimate' })
export class FeeEstimate {

  @PrimaryColumn('datetime', { name: 'created_at' })
  createdAt: Date

  @Column('text', { name: 'fee_obj' })
  feeObj: string
}

export interface FeeEstimateSeed {
  createdAt: Date
  feeObj: string
}
