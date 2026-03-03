import Dexie, { type Table } from 'dexie'

import type { AppSettingRecord, ChatMessage, ChatThread } from '../../types/chat'

class ChatDatabase extends Dexie {
  threads!: Table<ChatThread, string>
  messages!: Table<ChatMessage, string>
  settings!: Table<AppSettingRecord, 'app'>

  public constructor() {
    super('qwen-chat-ui')

    this.version(1).stores({
      threads: 'id,updatedAt,createdAt,model,title',
      messages: 'id,threadId,createdAt,role,status',
      settings: 'key',
    })
  }
}

export const db = new ChatDatabase()
