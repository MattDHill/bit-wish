import {
  Entity,
  PrimaryColumn,
  Column,
} from 'typeorm'

@Entity({ name: 'fees' })
export class Fee {

  @PrimaryColumn('int', { name: 'timestamp' })
  timestamp: number

  @Column('int', { name: 'total' })
  total: number

  @Column('text', { name: 'raw' })
  raw: string
}

export interface FeeSeed {
  timestamp: number
  total: number
  raw: string
}
