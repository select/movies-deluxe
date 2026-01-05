import { readFile, writeFile, copyFile } from 'fs/promises'
import { join } from 'path'
import { existsSync } from 'fs'

const COLLECTIONS_FILE = join(process.cwd(), 'public/data/collections.json')
const BACKUP_FILE = join(process.cwd(), 'public/data/collections.json.bak')

async function migrate() {
  console.log('Starting collections migration...')

  if (!existsSync(COLLECTIONS_FILE)) {
    console.log('No collections.json found, skipping.')
    return
  }

  // 1. Backup
  await copyFile(COLLECTIONS_FILE, BACKUP_FILE)
  console.log(`Backup created at ${BACKUP_FILE}`)

  // 2. Read
  const content = await readFile(COLLECTIONS_FILE, 'utf-8')
  const db = JSON.parse(content)

  // 3. Migrate
  let count = 0
  for (const key in db) {
    if (key.startsWith('_')) continue

    const collection = db[key]
    if (!collection.savedQueries) {
      collection.savedQueries = []
    }
    if (!collection.tags) {
      collection.tags = []
    }
    count++
  }

  // 4. Update schema
  if (db._schema) {
    db._schema.version = '1.1.0'
    db._schema.lastUpdated = new Date().toISOString()
  }

  // 5. Save
  await writeFile(COLLECTIONS_FILE, JSON.stringify(db, null, 2), 'utf-8')
  console.log(`Successfully migrated ${count} collections to version 1.1.0`)
}

migrate().catch(err => {
  console.error('Migration failed:', err)
  process.exit(1)
})
