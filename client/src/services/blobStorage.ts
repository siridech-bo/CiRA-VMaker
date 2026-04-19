import { openDB, type IDBPDatabase } from 'idb'

const DB_NAME = 'cira-vmaker'
const DB_VERSION = 1
const AUDIO_STORE = 'audio'
const PROJECT_STORE = 'projects'

interface AudioRecord {
  slideId: string
  projectId: string
  blob: Blob
  duration: number
  createdAt: Date
}

interface ProjectRecord {
  id: string
  data: unknown
  updatedAt: Date
}

let dbPromise: Promise<IDBPDatabase> | null = null

function getDB(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(AUDIO_STORE)) {
          const audioStore = db.createObjectStore(AUDIO_STORE, { keyPath: 'slideId' })
          audioStore.createIndex('projectId', 'projectId')
        }

        if (!db.objectStoreNames.contains(PROJECT_STORE)) {
          db.createObjectStore(PROJECT_STORE, { keyPath: 'id' })
        }
      }
    })
  }
  return dbPromise
}

export const blobStorage = {
  async storeAudio(
    slideId: string,
    blob: Blob,
    duration: number,
    projectId: string = 'default'
  ): Promise<void> {
    const db = await getDB()
    const record: AudioRecord = {
      slideId,
      projectId,
      blob,
      duration,
      createdAt: new Date()
    }
    await db.put(AUDIO_STORE, record)
  },

  async getAudio(slideId: string): Promise<Blob | null> {
    const db = await getDB()
    const record = await db.get(AUDIO_STORE, slideId)
    return record?.blob ?? null
  },

  async getAudioWithDuration(slideId: string): Promise<{ blob: Blob; duration: number } | null> {
    const db = await getDB()
    const record = await db.get(AUDIO_STORE, slideId)
    if (!record) return null
    return { blob: record.blob, duration: record.duration }
  },

  async deleteAudio(slideId: string): Promise<void> {
    const db = await getDB()
    await db.delete(AUDIO_STORE, slideId)
  },

  async clearProjectAudio(projectId: string): Promise<void> {
    const db = await getDB()
    const tx = db.transaction(AUDIO_STORE, 'readwrite')
    const store = tx.objectStore(AUDIO_STORE)
    const index = store.index('projectId')

    let cursor = await index.openCursor(IDBKeyRange.only(projectId))
    while (cursor) {
      await cursor.delete()
      cursor = await cursor.continue()
    }

    await tx.done
  },

  async getAllAudioForProject(projectId: string): Promise<Map<string, AudioRecord>> {
    const db = await getDB()
    const tx = db.transaction(AUDIO_STORE, 'readonly')
    const store = tx.objectStore(AUDIO_STORE)
    const index = store.index('projectId')

    const records = await index.getAll(IDBKeyRange.only(projectId))
    const map = new Map<string, AudioRecord>()

    for (const record of records) {
      map.set(record.slideId, record)
    }

    return map
  },

  async getStorageUsage(): Promise<number> {
    const db = await getDB()
    const tx = db.transaction(AUDIO_STORE, 'readonly')
    const store = tx.objectStore(AUDIO_STORE)

    let totalSize = 0
    let cursor = await store.openCursor()

    while (cursor) {
      const record = cursor.value as AudioRecord
      totalSize += record.blob.size
      cursor = await cursor.continue()
    }

    return totalSize
  },

  async saveProject(id: string, data: unknown): Promise<void> {
    const db = await getDB()
    const record: ProjectRecord = {
      id,
      data,
      updatedAt: new Date()
    }
    await db.put(PROJECT_STORE, record)
  },

  async loadProject(id: string): Promise<unknown | null> {
    const db = await getDB()
    const record = await db.get(PROJECT_STORE, id)
    return record?.data ?? null
  },

  async deleteProject(id: string): Promise<void> {
    const db = await getDB()
    await db.delete(PROJECT_STORE, id)
    await this.clearProjectAudio(id)
  },

  async clearAll(): Promise<void> {
    const db = await getDB()
    await db.clear(AUDIO_STORE)
    await db.clear(PROJECT_STORE)
  }
}

export default blobStorage
