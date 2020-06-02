import { getRepository, In, getManager } from 'typeorm'
import { Message, MessageStatus, MessageSeed } from './db/entities/message'
import { Utx } from './db/entities/utxo'
import { confirm } from 'node-ask'
import * as twitter from './services/twitter.service'
import * as borker from './services/borker.service'

let since_id: string
let max_id: string | undefined

export async function start (): Promise<void> {
  const failedReplies = await getManager().find(Message, {
    where: { status: In([MessageStatus.reply_failed]) },
    order: { createdAt: 'ASC' },
  })
  if (failedReplies.length) {
    if (await confirm(`process ${failedReplies.length} previously failed replies? `)) {
      for (let message of failedReplies) {
        await processReply(message)
      }
    }
  }

  const failedBorks = await getManager().find(Message, {
    where: { status: In([MessageStatus.bork_failed]) },
    order: { createdAt: 'ASC' },
  })
  if (failedBorks.length) {
    if (await confirm(`process ${failedBorks.length} previously failed borks? `)) {
      for (let message of failedBorks) {
        await processBorkAndReply(message)
      }
    }
  }

  const last = await getManager().findOne(Message, { order: { createdAt: 'DESC' } })
  since_id = last ? last.tweetId : process.env.TWITTER_TWEET_ID!
  poll()
}

async function poll () {
  try {
    const mentions = await getMentions()
    if (mentions.length) {
      await processMentions(mentions.reverse()) // oldest to newest
    }
  } catch (e) {
    console.error(e.message)
  } finally {
    setTimeout(poll, 3600000) // 1h
  }
}

async function getMentions (): Promise<twitter.MentionsTimelineRow[]> {
  let toReturn: twitter.MentionsTimelineRow[] = []
  let count = 1

  try {
    while (count <= 10) { // don't abuse Twitter. 10 fetches is plenty
      if (!await confirm(`get new mentions ${count}? `)) { throw new Error('Matt rejected getting new mentions') }
      console.log(`getting new mentions: since_id: ${since_id}, max_id: ${max_id}`)
      const newMentions = await twitter.getMentions(since_id, max_id)
      console.log(`MENTIONS`, JSON.stringify(newMentions))
      if (max_id) { newMentions.shift() }
      toReturn = toReturn.concat(newMentions)
      if (newMentions.length < 10) { break }
      max_id = newMentions[newMentions.length - 1].id_str
      count++
    }
  } catch (e) {
    console.error(`error fetching mentions: ${e}`)
  }
  return toReturn
}

async function processMentions (mentions: twitter.MentionsTimelineRow[]): Promise<void> {
  const relevant = mentions.filter(m => m.in_reply_to_status_id_str === process.env.TWITTER_TWEET_ID!)

  if (!await confirm(`${relevant.length} relevant mentions found. Process? `)) { throw new Error('Matt rejected processing mentions') }
  console.log('processing relevant mentions')

  for (let m of relevant) {
    const previous = await getManager().findOne(Message, {
      where: {
        userId: m.user.id_str,
        status: In([
          MessageStatus.accepted,
          MessageStatus.processing_bork_1,
          MessageStatus.processing_bork_2,
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
    } else if ((m.entities.media && m.entities.media.length) || (m.entities.polls && m.entities.polls.length) || (m.entities.urls && m.entities.urls.length)) {
      status = MessageStatus.rejected_contains_media
    } else if (Buffer.byteLength(text, 'utf8') > 132) {
      status = MessageStatus.rejected_too_long
    } else if (new Date(m.user.created_at).valueOf() > Number(process.env.CUTOFF_DATE!)) {
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
  if (message.bitcoinTxid1) {
    await processReply(message)
  }
}

async function processBork (message: Message): Promise<Message> {
  console.log('processing bork')
  try {
    const { signedTxs, inputs } = await borker.construct(message.userHandle, message.text)

    const txCount = signedTxs.length
    if (txCount > 2) {
      throw new Error(`Too many txs: ${txCount}`)
    }

    // first tx
    console.log('Message to Bork', message)
    if (!await confirm(`Process tx ${txCount > 1 ? '1 of 2' : '1 of 1'}? `)) { throw new Error('Matt aborted tx 1') }
    console.log(`boradcasting tx ${txCount > 1 ? '1 of 2' : '1 of 1'}`)
    const txid1 = await borker.broadcast(signedTxs[0])
    console.log(`TXID1: ${txid1}`)
    message.bitcoinTxid1 = txid1
    if (txCount > 1) {
      message.status = MessageStatus.processing_bork_2
    }
    message = await getRepository(Message).save(message)

    // 2nd tx
    if (txCount > 1) {
      if (!await confirm('Process tx 2 of 2? ')) { throw new Error('Matt aborted tx 2') }
      console.log(`boradcasting tx 2 of 2`)
      const txid2 = await borker.broadcast(signedTxs[1])
      console.log(`TXID2: ${txid2}`)
      message.bitcoinTxid2 = txid2
    }
    message.status = MessageStatus.processing_reply
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
  let reply = `@${message.userHandle}` + "\n\r" + message.bitcoinTxid1
  if (message.bitcoinTxid2) {
    reply = reply + "\n\r" + message.bitcoinTxid2
  }

  console.log('reply to tweet', reply)
  try {
    if (!await confirm('Process reply? ')) { throw new Error('Matt rejected processing reply') }
    console.log(`processing reply`)
    const tweet = await twitter.tweetReply(message.tweetId, message.userHandle, reply)
    console.log('REPLY', tweet)
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
    failedError: e.toString(),
  })
}