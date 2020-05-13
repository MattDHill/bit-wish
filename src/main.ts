import { getRepository, In } from 'typeorm'
import { Message, MessageStatus, MessageSeed } from './db/entities/message'
import * as twitter from './services/twitter.service'
import * as borker from './services/borker.service'
import * as bitcoin from './services/bitcoin.service'

let last_message_id: number

export async function start (): Promise<void> {
  const last = await getRepository(Message).findOne(undefined, { order: { createdAt: 'DESC' } })
  if (last) { last_message_id = last.tweetId }
  poll()
}

async function poll () {
  try {
    const mentions = await twitter.getMentions(last_message_id)
    await processMentions(mentions)
  } catch (e) {
    console.error(e.message)
  } finally {
    setTimeout(poll, 3600000)
  }
}

async function processMentions (mentions: twitter.MentionsTimelineRow[]): Promise<void> {
  const relevant = mentions.filter(m => m.in_reply_to_status_id_str === process.env.TWITTER_RELEVANT_TWEET!)

  const repo = getRepository(Message)

  // @TODO make sure we are going oldest to newest
  for (let m of relevant) {
    const previous = await repo.findOne(m.user.id, {
      where: {
        status: In([
          MessageStatus.accepted,
          MessageStatus.processing_bork,
          MessageStatus.processing_reply,
          MessageStatus.failed,
          MessageStatus.complete
        ])
      }
    })

    let status: MessageStatus
    if (previous) {
      status = MessageStatus.rejected_duplicate
    } else if (!m.text) {
      status = MessageStatus.rejected_no_text
    } else if (m.text.length > 59) {
      status = MessageStatus.rejected_too_long
    } else {
      status = MessageStatus.accepted
    }

    const now = new Date()
    const seed: MessageSeed = {
      tweetId: m.id,
      userId: m.user.id,
      userHandle: m.user.screen_name,
      createdAt: now,
      updatedAt: now,
      status,
      text: m.text
    }

    const message = await repo.save(repo.create(seed))

    if (message.status === MessageStatus.accepted) {
      await handleAccepted(message)
    } else {
      await handleRejected(message)
    }

    last_message_id = m.id
  }
}

async function handleAccepted (message: Message): Promise<void> {
  const repo = getRepository(Message)

  try {
    // bork
    const signedTx = await borker.construct(message.userHandle, message.text)
    const txid = await bitcoin.broadcast(signedTx)
    await repo.update(message.tweetId, {
      status: MessageStatus.processing_reply,
      bitcoinTxid: txid,
    })
    // reply
    const tweet = await twitter.tweetReply(message.tweetId, message.userHandle, txid)
    await getRepository(Message).update(message.tweetId, {
      status: MessageStatus.complete,
      replyTweetId: tweet.id
    })
  } catch (e) {
    await handleError(message.tweetId, e)
  }
}

async function handleRejected (message: Message): Promise<void> {

  let reply = ''
  let status = message.status
  switch (message.status) {
    case MessageStatus.rejected_duplicate:
      reply = 'You are only allowed one message.'
      status = MessageStatus.rejected_duplicate_sent
      break
    case MessageStatus.rejected_no_text:
      reply = 'You cannot send an empty message. Please add some text.'
      status = MessageStatus.rejected_no_text_sent
      break
    case MessageStatus.rejected_too_long:
      reply = 'Your message is too big. Must be 59 characters or less, including spaces.'
      status = MessageStatus.rejected_too_long_sent
      break
  }

  try {
    const tweet = await twitter.tweetReply(message.tweetId, message.userHandle, reply)
    await getRepository(Message).update(message.tweetId, {
      status,
      replyTweetId: tweet.id
    })
  } catch (e) {
    await handleError(message.tweetId, e)
  }
}

async function handleError (tweetId: number, e: Error): Promise<void> {
  console.error(e)
  await getRepository(Message).update(tweetId, {
    status: MessageStatus.failed,
    failedError: JSON.stringify(e)
  })
}