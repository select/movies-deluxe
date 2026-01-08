import { generateHomePages } from '../server/utils/generateHomePages'

async function main() {
  console.log('Generating home page collections...')
  try {
    await generateHomePages(progress => {
      console.log(`[${progress.current}/${progress.total}] ${progress.message}`)
    })
    console.log('Finished generating home page collections.')
  } catch (err) {
    console.error(err)
    process.exit(1)
  }
}

main()
