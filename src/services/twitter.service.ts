import Twitter from 'twitter-lite'

let _client: Twitter
const client = () => _client || new Twitter({
  consumer_key: process.env.TWITTER_CONSUMER_KEY!,
  consumer_secret: process.env.TWITTER_CONSUMER_SECRET!,
  access_token_key: process.env.TWITTER_ACCESS_TOKEN_KEY!,
  access_token_secret: process.env.TWITTER_ACCESS_TOKEN_SECRET!
})

export async function getMentions (since_id: string | undefined, max_id: string | undefined): Promise<MentionsTimelineRow[]> {
  const params: GetMentionsParams = {
    tweet_mode: 'extended',
    count: 100, // 100 per hour
  }
  if (since_id) { params.since_id = since_id }
  if (max_id) { params.max_id = max_id }

  return client().get<MentionsTimelineRow[]>('statuses/mentions_timeline', params)
}

// @TODO max 300 per 3 hour period
export async function tweetReply (tweetId: string, handle: string, txid: string): Promise<TweetRes> {
  return client().post<TweetRes>('statuses/update', {
    status: txid,
    in_reply_to_status_id: tweetId,
    username: handle,
    trim_user: true,
  })
}

interface GetMentionsParams {
  tweet_mode: 'extended'
  count: 100
  since_id?: string
  max_id?: string
}

export interface MentionsTimelineRow {
  created_at: string
  id_str: string
  in_reply_to_user_id_str: string | null
  full_text: string
  display_text_range: [number, number]
  in_reply_to_status_id_str: string | null
  user: User
  in_reply_to_screen_name: string | null
  entities: {
    media?: any[]
    polls?: any[]
    urls?: any[]
  }
}

export interface TweetRes {
  created_at: string
  id_str: string
  user: { id_str: string }
}

interface User {
  name: string
  created_at: string
  id_str: string
  followers_count: number
  protected: false
  statuses_count: number
  friends_count: number
  screen_name: string
}