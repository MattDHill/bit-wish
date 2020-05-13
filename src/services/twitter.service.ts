import Twitter from 'twitter-lite'

const client = new Twitter({
  consumer_key: process.env.TWITTER_CONSUMER_KEY!,
  consumer_secret: process.env.TWITTER_CONSUMER_SECRET!,
  access_token_key: process.env.TWITTER_ACCESS_TOKEN_KEY!,
  access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET!
})


export async function getMentions (since_id: number): Promise<MentionsTimelineRow[]> {
  return client.get<MentionsTimelineRow[]>('statuses/mentions_timeline', {
    count: 60,
    include_entities: false,
    since_id,
  })
}

// @TODO max 300 per 3 hour period
export async function tweetReply (tweetId: number, handle: string, message: string): Promise<TweetRes> {
  return client.post<TweetRes>('statuses/update', {
    status: message,
    in_reply_to_status_id: tweetId,
    username: handle,
    trim_user: true,
  })
}

export interface MentionsTimelineRow {
  created_at: string
  id_str: string
  in_reply_to_user_id_str: string | null
  text: string
  retweet_count: number
  in_reply_to_status_id_str: string | null
  id: number
  retweeted: boolean
  in_reply_to_user_id: number | null
  user: User
  in_reply_to_screen_name: string | null
  in_reply_to_status_id: number | null
}

export interface TweetRes {
  created_at: string
  id: number
  id_str: string
  user: { id: number }
}

interface User {
  name: string
  created_at: string
  id_str: string
  id: number
  followers_count: number
  protected: false
  statuses_count: number
  friends_count: number
  screen_name: string
}