import { getRepository, In, getManager } from 'typeorm'
import { Message, MessageStatus, MessageSeed } from './db/entities/message'
import { Utx } from './db/entities/utxo'
import * as twitter from './services/twitter.service'
import * as borker from './services/borker.service'

let since_id: string | undefined
let max_id: string | undefined

export async function start (): Promise<void> {
  const replyFailed = await getManager().find(Message, {
    where: { status: In([MessageStatus.reply_failed]) },
    order: { createdAt: 'ASC' },
  })
  for (let message of replyFailed) {
    await processReply(message)
  }

  const borkFailed = await getManager().find(Message, {
    where: { status: In([MessageStatus.bork_failed]) },
    order: { createdAt: 'ASC' },
  })
  for (let message of borkFailed) {
    await processBorkAndReply(message)
  }

  const last = await getManager().findOne(Message, { order: { createdAt: 'DESC' } })
  if (last) { since_id = last.tweetId }
  poll()
}

async function poll () {
  try {
    const mentions = await getMentions()
    // oldest to newest
    if (mentions.length) { await processMentions(mentions.reverse()) }
  } catch (e) {
    console.error(e.message)
  } finally {
    setTimeout(poll, 43200000) // 12h
  }
}

async function getMentions (): Promise<twitter.MentionsTimelineRow[]> {
  let keepGoing = true
  let toReturn: twitter.MentionsTimelineRow[] = []

  while (keepGoing) {
    try {
      const mentions = await twitter.getMentions(since_id, max_id)
      if (max_id) { mentions.shift() }
      keepGoing = !!mentions.length
      toReturn.concat(mentions)
      max_id = mentions[mentions.length - 1].id_str
    } catch (e) {
      console.error(`error fetching mentions: ${e}`)
      keepGoing = false
    }
  }
  
  return toReturn
}

async function processMentions (mentions: twitter.MentionsTimelineRow[]): Promise<void> {
  const relevant = mentions.filter(m => m.in_reply_to_status_id_str === process.env.TWITTER_TWEET_ID!)

  for (let m of relevant) {
    const previous = await getRepository(Message).findOne(m.user.id_str, {
      where: {
        status: In([
          MessageStatus.accepted,
          MessageStatus.processing_bork,
          MessageStatus.processing_reply,
          MessageStatus.bork_failed,
          MessageStatus.reply_failed,
          MessageStatus.complete
        ])
      }
    })

    const text = m.full_text.substr(m.display_text_range[0], m.display_text_range[1] - m.display_text_range[0])
    let status: MessageStatus
    if (previous) {
      status = MessageStatus.rejected_duplicate
    } else if (!text) {
      status = MessageStatus.rejected_no_text
    } else if (m.entities.media.length || m.entities.polls.length || m.entities.urls.length) {
      status = MessageStatus.rejected_contains_media
    } else if (text.length > 59) {
      status = MessageStatus.rejected_too_long
    } else {
      status = MessageStatus.accepted
    }

    const seed: MessageSeed = {
      tweetId: m.id_str,
      userId: m.user.id_str,
      userHandle: m.user.screen_name,
      createdAt: new Date(),
      updatedAt: new Date(),
      status,
      text,
    }

    let message = await getRepository(Message).save(getRepository(Message).create(seed))

    if (message.status === MessageStatus.accepted) {
      processBorkAndReply(message)
    }

    since_id = m.id_str
  }
}

async function processBorkAndReply (message: Message): Promise<void> {
  message = await processBork(message)
  if (message.bitcoinTxid) {
    await processReply(message)
  }
}

async function processBork (message: Message): Promise<Message> {
  try {
    const { signedTx, inputs } = await borker.construct(message.userHandle, message.text)
    const txid = await borker.broadcast(signedTx)

    message.status = MessageStatus.processing_reply
    message.bitcoinTxid = txid
    message = await getRepository(Message).save(message)

    for (let input of inputs) {
      await getRepository(Utx).update(input.txid, { spentAt: new Date() })
    }
  } catch (e) {
    await handleError(message.tweetId, MessageStatus.bork_failed, e)
  }

  return message
}

async function processReply (message: Message): Promise<void> {
  try {
    const tweet = await twitter.tweetReply(message.tweetId, message.userHandle, message.bitcoinTxid!)
    await getRepository(Message).update(message.tweetId, {
      status: MessageStatus.complete,
      replyTweetId: tweet.id_str
    })
  } catch (e) {
    await handleError(message.tweetId, MessageStatus.reply_failed, e)
  }
}

async function handleError (tweetId: string, status: MessageStatus, e: Error): Promise<void> {
  console.error(e)
  await getRepository(Message).update(tweetId, {
    status,
    failedError: JSON.stringify(e)
  })
}