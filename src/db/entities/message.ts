import {
  Entity,
  PrimaryColumn,
  Column,
  Index
} from 'typeorm'

export enum MessageStatus {
  // active states
  accepted = 'accepted',
  processing_bork = 'processing_bork',
  processing_reply = 'processing_reply',
  failed = 'failed',
  rejected_no_text = 'rejected_no_text',
  rejected_too_long = 'rejected_too_long',
  rejected_duplicate = 'rejected_duplicate',
  // complete states
  complete = 'complete',
  failed_permanently = 'failed_permanently',
  rejected_no_text_sent = 'rejected_no_text_sent',
  rejected_too_long_sent = 'rejected_too_long_sent',
  rejected_duplicate_sent = 'rejected_duplicate_sent',
}

@Entity({ name: 'messages' })
export class Message {

  @PrimaryColumn('int', { name: 'tweet_id' })
  tweetId: number

  @Index()
  @Column('int', { name: 'user_id' })
  userId: number

  @Column('text', { name: 'user_handle' })
  userHandle: string

  @Column('datetime', { name: 'created_at' })
  createdAt: Date

  @Column('datetime', { name: 'updated_at' })
  updatedAt: Date

  @Index()
  @Column('text', { name: 'type' })
  status: MessageStatus

  @Column('text', { name: 'text' })
  text: string

  @Column('text', { name: 'bitcoin_tx', nullable: true })
  bitcoinTx: string | null

  @Column('text', { name: 'bitcoin_txid', nullable: true })
  bitcoinTxid: string | null

  @Column('int', { name: 'reply_tweet_id', nullable: true })
  replyTweetId: number | null

  @Column('text', { name: 'failed_error', nullable: true })
  failedError: string | null
}

export interface MessageSeed {
  tweetId: number
  userId: number
  userHandle: string
  createdAt: Date
  updatedAt: Date
  status: MessageStatus
  text: string
  bitcoinTxid?: string
  replyTweetId?: number
  failedError?: string
}
