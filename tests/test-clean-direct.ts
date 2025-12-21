import { cleanTitle } from './utils/titleCleaner.ts'

const testTitles = [
  'DOA: Dead or Alive (ACTION full movie German, Action movies German complete, Action movies new 2025)',
  'Snow-Covered Hearts - A Romantic Christmas Fairy Tale (CHRISTMAS MOVIES full movie German 2025)',
  'The Driftless Area - Nothing is as it seems (THRILLING THRILLER with ZOOEY DESHANEL, Mystery)',
]

console.log('Testing cleanTitle function with actual YouTube titles:\n')

for (const title of testTitles) {
  const result = cleanTitle(title, '@Netzkino')
  console.log('Original:', title)
  console.log('Cleaned: ', result)
  console.log('Changed: ', title !== result)
  console.log()
}
