import Dexie, { type Table } from 'dexie'

import type { AgentRunRecord, AppSettingRecord, ChatMessage, ChatThread } from '../../types/chat'

class ChatDatabase extends Dexie {
  threads!: Table<ChatThread, string>
  messages!: Table<ChatMessage, string>
  settings!: Table<AppSettingRecord, 'app'>
  runs!: Table<AgentRunRecord, string>

  public constructor() {
    super('qwen-chat-ui')

    this.version(1).stores({
      threads: 'id,updatedAt,createdAt,model,title',
      messages: 'id,threadId,createdAt,role,status',
      settings: 'key',
    })

    this.version(2).stores({
      threads: 'id,updatedAt,createdAt,model,title',
      messages: 'id,threadId,createdAt,role,status',
      settings: 'key',
      runs: 'id,threadId,mode,status,createdAt,updatedAt',
    })
  }
}

export const db = new ChatDatabase()
