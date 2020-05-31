import {
  Entity,
  PrimaryColumn,
  Column,
  Index
} from 'typeorm'

export enum MessageStatus {
  // active states
  accepted = 'accepted',
  processing_bork_1 = 'processing_bork_1',
  processing_bork_2 = 'processing_bork_2',
  processing_reply = 'processing_reply',
  bork_failed = 'bork_failed',
  reply_failed = 'reply_failed',
  // complete states
  rejected_no_text = 'rejected_no_text',
  rejected_too_long = 'rejected_too_long',
  rejected_contains_media = 'rejected_contains_media',
  rejected_duplicate = 'rejected_duplicate',
  complete = 'complete',
}

@Entity({ name: 'messages' })
export class Message {

  @PrimaryColumn('text', { name: 'tweet_id' })
  tweetId: string

  @Index()
  @Column('text', { name: 'user_id' })
  userId: string

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

  @Column('text', { name: 'bitcoin_txid_1', nullable: true })
  bitcoinTxid1: string | null

  @Column('text', { name: 'bitcoin_txid_2', nullable: true })
  bitcoinTxid2: string | null

  @Column('text', { name: 'reply_tweet_id', nullable: true })
  replyTweetId: string | null

  @Column('text', { name: 'failed_error', nullable: true })
  failedError: string | null
}

export interface MessageSeed {
  tweetId: string
  userId: string
  userHandle: string
  createdAt: Date
  updatedAt: Date
  status: MessageStatus
  text: string
  bitcoinTxid1?: string
  bitcoinTxid2?: string
  replyTweetId?: string
  failedError?: string
}
